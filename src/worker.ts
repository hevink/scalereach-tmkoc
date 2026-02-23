// Worker v1.1.0 — secured health endpoints
// Initialize Sentry first (must be at the very top)
import "./lib/sentry";

import { startPotServer, stopPotServer } from "./lib/pot-server";
import { startVideoWorker } from "./jobs/video.worker";
import { startClipWorker } from "./jobs/clip.worker";
import { startTranslationWorker, translationQueue } from "./jobs/translation.worker";
import { startDubbingWorker, dubbingQueue } from "./jobs/dubbing.worker";
import { startSocialWorker } from "./jobs/social.worker";
import { redisConnection, videoProcessingQueue, clipGenerationQueue, socialPostingQueue } from "./jobs/queue";

const VIDEO_WORKER_CONCURRENCY = parseInt(process.env.VIDEO_WORKER_CONCURRENCY || "2", 10);
const CLIP_WORKER_CONCURRENCY = parseInt(process.env.CLIP_WORKER_CONCURRENCY || "2", 10);
const WORKER_HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || "3002", 10);
const DUBBING_WORKER_CONCURRENCY = parseInt(process.env.DUBBING_WORKER_CONCURRENCY || "1", 10);
// Set WORKER_SECRET in .env to protect /health/detailed and /health/hevin
const WORKER_SECRET = process.env.WORKER_SECRET || null;

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cache-Control": "no-store",
};

function checkAuth(req: Request): boolean {
  if (!WORKER_SECRET) return true; // no secret configured = open (local dev)
  const auth = req.headers.get("authorization");
  const token = req.headers.get("x-worker-token");
  return auth === `Bearer ${WORKER_SECRET}` || token === WORKER_SECRET;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: SECURITY_HEADERS,
  });
}

const startTime = Date.now();

startPotServer();

console.log("[WORKER] Starting video processing worker...");
const videoWorker = startVideoWorker(VIDEO_WORKER_CONCURRENCY);

console.log("[WORKER] Starting clip generation worker...");
const clipWorker = startClipWorker(CLIP_WORKER_CONCURRENCY);

console.log("[WORKER] Starting translation worker...");
const translationWorker = startTranslationWorker();

console.log("[WORKER] Starting dubbing worker...");
const dubbingWorker = startDubbingWorker(DUBBING_WORKER_CONCURRENCY);

console.log("[WORKER] Starting social posting worker...");
const socialWorker = startSocialWorker();

async function checkRedisHealth(): Promise<{ status: string; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    const result = await redisConnection.ping();
    if (result === "PONG") return { status: "healthy", latency: Date.now() - start };
    return { status: "unhealthy", latency: Date.now() - start, error: `Unexpected: ${result}` };
  } catch (error) {
    return { status: "unhealthy", latency: Date.now() - start, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

async function getQueueStats() {
  try {
    const [videoWaiting, videoActive, videoCompleted, videoFailed] = await Promise.all([
      videoProcessingQueue.getWaitingCount(), videoProcessingQueue.getActiveCount(),
      videoProcessingQueue.getCompletedCount(), videoProcessingQueue.getFailedCount(),
    ]);
    const [clipWaiting, clipActive, clipCompleted, clipFailed] = await Promise.all([
      clipGenerationQueue.getWaitingCount(), clipGenerationQueue.getActiveCount(),
      clipGenerationQueue.getCompletedCount(), clipGenerationQueue.getFailedCount(),
    ]);
    const [translationWaiting, translationActive, translationCompleted, translationFailed] = await Promise.all([
      translationQueue.getWaitingCount(), translationQueue.getActiveCount(),
      translationQueue.getCompletedCount(), translationQueue.getFailedCount(),
    ]);
    const [dubbingWaiting, dubbingActive, dubbingCompleted, dubbingFailed] = await Promise.all([
      dubbingQueue.getWaitingCount(), dubbingQueue.getActiveCount(),
      dubbingQueue.getCompletedCount(), dubbingQueue.getFailedCount(),
    ]);
    const [socialWaiting, socialActive, socialCompleted, socialFailed] = await Promise.all([
      socialPostingQueue.getWaitingCount(), socialPostingQueue.getActiveCount(),
      socialPostingQueue.getCompletedCount(), socialPostingQueue.getFailedCount(),
    ]);
    return {
      videoProcessing: { waiting: videoWaiting, active: videoActive, completed: videoCompleted, failed: videoFailed },
      clipGeneration: { waiting: clipWaiting, active: clipActive, completed: clipCompleted, failed: clipFailed },
      translation: { waiting: translationWaiting, active: translationActive, completed: translationCompleted, failed: translationFailed },
      dubbing: { waiting: dubbingWaiting, active: dubbingActive, completed: dubbingCompleted, failed: dubbingFailed },
      socialPosting: { waiting: socialWaiting, active: socialActive, completed: socialCompleted, failed: socialFailed },
    };
  } catch { return null; }
}

let healthServer: ReturnType<typeof Bun.serve> | null = null;
try {
  healthServer = Bun.serve({
    port: WORKER_HEALTH_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // PUBLIC — basic status only, no sensitive data
      if (url.pathname === "/health" || url.pathname === "/") {
        const redisHealth = await checkRedisHealth();
        const isHealthy = redisHealth.status === "healthy" &&
          videoWorker.isRunning() && clipWorker.isRunning() &&
          translationWorker.isRunning() && dubbingWorker.isRunning();
        return new Response(JSON.stringify({
          status: isHealthy ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
          workers: {
            videoWorker: { running: videoWorker.isRunning(), concurrency: VIDEO_WORKER_CONCURRENCY },
            clipWorker: { running: clipWorker.isRunning(), concurrency: CLIP_WORKER_CONCURRENCY },
            translationWorker: { running: translationWorker.isRunning(), concurrency: 1 },
            dubbingWorker: { running: dubbingWorker.isRunning(), concurrency: DUBBING_WORKER_CONCURRENCY },
            socialWorker: { running: socialWorker.isRunning(), concurrency: 2 },
          },
          redis: redisHealth,
        }, null, 2), { status: isHealthy ? 200 : 503, headers: SECURITY_HEADERS });
      }

      // PUBLIC — liveness probe
      if (url.pathname === "/health/live") {
        return new Response(JSON.stringify({ status: "alive", timestamp: new Date().toISOString() }),
          { status: 200, headers: SECURITY_HEADERS });
      }

      // PUBLIC — readiness probe
      if (url.pathname === "/health/ready") {
        const redisHealth = await checkRedisHealth();
        const isReady = redisHealth.status === "healthy" &&
          videoWorker.isRunning() && clipWorker.isRunning() &&
          translationWorker.isRunning() && dubbingWorker.isRunning() && socialWorker.isRunning();
        return new Response(JSON.stringify({ status: isReady ? "ready" : "not_ready", timestamp: new Date().toISOString() }),
          { status: isReady ? 200 : 503, headers: SECURITY_HEADERS });
      }

      // PROTECTED — queue stats
      if (url.pathname === "/health/detailed") {
        if (!checkAuth(req)) return unauthorized();
        const redisHealth = await checkRedisHealth();
        const queueStats = await getQueueStats();
        const isHealthy = redisHealth.status === "healthy" &&
          videoWorker.isRunning() && clipWorker.isRunning() &&
          translationWorker.isRunning() && dubbingWorker.isRunning();
        return new Response(JSON.stringify({
          status: isHealthy ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
          workers: {
            videoWorker: { running: videoWorker.isRunning(), concurrency: VIDEO_WORKER_CONCURRENCY },
            clipWorker: { running: clipWorker.isRunning(), concurrency: CLIP_WORKER_CONCURRENCY },
            translationWorker: { running: translationWorker.isRunning(), concurrency: 1 },
            dubbingWorker: { running: dubbingWorker.isRunning(), concurrency: DUBBING_WORKER_CONCURRENCY },
            socialWorker: { running: socialWorker.isRunning(), concurrency: 2 },
          },
          redis: redisHealth,
          queues: queueStats,
        }, null, 2), { status: isHealthy ? 200 : 503, headers: SECURITY_HEADERS });
      }

      // PROTECTED — full debug dashboard
      if (url.pathname === "/health/hevin") {
        if (!checkAuth(req)) return unauthorized();
        const redisHealth = await checkRedisHealth();
        const queueStats = await getQueueStats();
        let redisInfo: Record<string, string> = {};
        let redisKeys: string[] = [];
        let redisMemory: Record<string, string> = {};
        let redisClients: Record<string, string> = {};
        let redisStats: Record<string, string> = {};
        try {
          const infoRaw = await redisConnection.info();
          infoRaw.split("\r\n").forEach((line) => {
            if (line && !line.startsWith("#")) {
              const [k, v] = line.split(":");
              if (k && v !== undefined) redisInfo[k.trim()] = v.trim();
            }
          });
          redisMemory = {
            used_memory_human: redisInfo.used_memory_human,
            used_memory_peak_human: redisInfo.used_memory_peak_human,
            maxmemory_human: redisInfo.maxmemory_human || "unlimited",
            mem_fragmentation_ratio: redisInfo.mem_fragmentation_ratio,
          };
          redisClients = {
            connected_clients: redisInfo.connected_clients,
            blocked_clients: redisInfo.blocked_clients,
            tracking_clients: redisInfo.tracking_clients,
          };
          redisStats = {
            total_commands_processed: redisInfo.total_commands_processed,
            total_connections_received: redisInfo.total_connections_received,
            keyspace_hits: redisInfo.keyspace_hits,
            keyspace_misses: redisInfo.keyspace_misses,
            uptime_in_seconds: redisInfo.uptime_in_seconds,
            redis_version: redisInfo.redis_version,
            role: redisInfo.role,
          };
          const keys = await redisConnection.keys("bull:*");
          redisKeys = keys.sort();
        } catch (e) {
          redisInfo = { error: e instanceof Error ? e.message : "failed" };
        }
        const os = await import("os");
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const loadAvg = os.loadavg();
        return new Response(JSON.stringify({
          timestamp: new Date().toISOString(),
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
          workers: {
            videoWorker: { running: videoWorker.isRunning(), concurrency: VIDEO_WORKER_CONCURRENCY },
            clipWorker: { running: clipWorker.isRunning(), concurrency: CLIP_WORKER_CONCURRENCY },
            translationWorker: { running: translationWorker.isRunning(), concurrency: 1 },
            dubbingWorker: { running: dubbingWorker.isRunning(), concurrency: DUBBING_WORKER_CONCURRENCY },
            socialWorker: { running: socialWorker.isRunning(), concurrency: 2 },
            total_concurrency: VIDEO_WORKER_CONCURRENCY + CLIP_WORKER_CONCURRENCY + 1 + DUBBING_WORKER_CONCURRENCY + 2,
          },
          queues: queueStats,
          system: {
            platform: os.platform(), arch: os.arch(),
            node_version: process.version,
            bun_version: typeof Bun !== "undefined" ? Bun.version : "n/a",
            cpu_count: cpus.length, cpu_model: cpus[0]?.model, cpu_speed_mhz: cpus[0]?.speed,
            load_avg_1m: loadAvg[0].toFixed(2), load_avg_5m: loadAvg[1].toFixed(2), load_avg_15m: loadAvg[2].toFixed(2),
            memory_total_mb: Math.round(totalMem / 1024 / 1024),
            memory_free_mb: Math.round(freeMem / 1024 / 1024),
            memory_used_mb: Math.round((totalMem - freeMem) / 1024 / 1024),
            memory_used_pct: ((1 - freeMem / totalMem) * 100).toFixed(1) + "%",
            process_memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            process_heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            hostname: os.hostname(),
          },
          redis: {
            status: redisHealth.status, latency_ms: redisHealth.latency,
            version: redisStats.redis_version, role: redisStats.role,
            uptime_seconds: redisStats.uptime_in_seconds,
            memory: redisMemory, clients: redisClients, stats: redisStats,
            bullmq_keys_count: redisKeys.length, bullmq_keys: redisKeys,
          },
          env: {
            NODE_ENV: process.env.NODE_ENV,
            WORKER_HEALTH_PORT: process.env.WORKER_HEALTH_PORT,
            VIDEO_WORKER_CONCURRENCY: process.env.VIDEO_WORKER_CONCURRENCY,
            CLIP_WORKER_CONCURRENCY: process.env.CLIP_WORKER_CONCURRENCY,
            DUBBING_WORKER_CONCURRENCY: process.env.DUBBING_WORKER_CONCURRENCY,
          },
        }, null, 2), { status: 200, headers: SECURITY_HEADERS });
      }

      return new Response("Not Found", { status: 404, headers: SECURITY_HEADERS });
    },
  });
  console.log(`[WORKER] Health check server running on http://localhost:${WORKER_HEALTH_PORT}`);
} catch (err) {
  console.warn(`[WORKER] Health check server failed to start (port ${WORKER_HEALTH_PORT} in use).`);
}

process.on("SIGTERM", async () => {
  console.log("[WORKER] Received SIGTERM, shutting down gracefully...");
  healthServer?.stop();
  stopPotServer();
  await Promise.all([videoWorker.close(), clipWorker.close(), translationWorker.close(), dubbingWorker.close(), socialWorker.close()]);
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[WORKER] Received SIGINT, shutting down gracefully...");
  healthServer?.stop();
  stopPotServer();
  await Promise.all([videoWorker.close(), clipWorker.close(), translationWorker.close(), dubbingWorker.close(), socialWorker.close()]);
  process.exit(0);
});

console.log("[WORKER] Workers are running and waiting for jobs...");
