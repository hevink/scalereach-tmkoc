// Worker v1.0.3 — CI/CD pipeline verified
// Initialize Sentry first (must be at the very top)
import "./lib/sentry";

import { startPotServer, stopPotServer } from "./lib/pot-server";
import { startVideoWorker } from "./jobs/video.worker";
import { startClipWorker } from "./jobs/clip.worker";
import { startTranslationWorker, translationQueue } from "./jobs/translation.worker";
import { startDubbingWorker, dubbingQueue } from "./jobs/dubbing.worker";
import { startSocialWorker } from "./jobs/social.worker";
import { redisConnection, videoProcessingQueue, clipGenerationQueue, socialPostingQueue } from "./jobs/queue";

// Worker concurrency configuration via environment variables
// Note: CLIP_WORKER_CONCURRENCY default is 2 to balance speed vs stability
// Higher values (3-4) may cause FFmpeg exit code 202 errors with --force-keyframes-at-cuts
const VIDEO_WORKER_CONCURRENCY = parseInt(process.env.VIDEO_WORKER_CONCURRENCY || "2", 10);
const CLIP_WORKER_CONCURRENCY = parseInt(process.env.CLIP_WORKER_CONCURRENCY || "2", 10);
const WORKER_HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || "3002", 10);
const DUBBING_WORKER_CONCURRENCY = parseInt(process.env.DUBBING_WORKER_CONCURRENCY || "1", 10);

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

/**
 * Worker health check server
 * Provides health endpoints for monitoring the worker process
 */
async function checkRedisHealth(): Promise<{ status: string; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    const result = await redisConnection.ping();
    if (result === "PONG") {
      return { status: "healthy", latency: Date.now() - start };
    }
    return { status: "unhealthy", latency: Date.now() - start, error: `Unexpected: ${result}` };
  } catch (error) {
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function getQueueStats() {
  try {
    const [videoWaiting, videoActive, videoCompleted, videoFailed] = await Promise.all([
      videoProcessingQueue.getWaitingCount(),
      videoProcessingQueue.getActiveCount(),
      videoProcessingQueue.getCompletedCount(),
      videoProcessingQueue.getFailedCount(),
    ]);

    const [clipWaiting, clipActive, clipCompleted, clipFailed] = await Promise.all([
      clipGenerationQueue.getWaitingCount(),
      clipGenerationQueue.getActiveCount(),
      clipGenerationQueue.getCompletedCount(),
      clipGenerationQueue.getFailedCount(),
    ]);

    const [translationWaiting, translationActive, translationCompleted, translationFailed] = await Promise.all([
      translationQueue.getWaitingCount(),
      translationQueue.getActiveCount(),
      translationQueue.getCompletedCount(),
      translationQueue.getFailedCount(),
    ]);

    const [dubbingWaiting, dubbingActive, dubbingCompleted, dubbingFailed] = await Promise.all([
      dubbingQueue.getWaitingCount(),
      dubbingQueue.getActiveCount(),
      dubbingQueue.getCompletedCount(),
      dubbingQueue.getFailedCount(),
    ]);

    const [socialWaiting, socialActive, socialCompleted, socialFailed] = await Promise.all([
      socialPostingQueue.getWaitingCount(),
      socialPostingQueue.getActiveCount(),
      socialPostingQueue.getCompletedCount(),
      socialPostingQueue.getFailedCount(),
    ]);

    return {
      videoProcessing: { waiting: videoWaiting, active: videoActive, completed: videoCompleted, failed: videoFailed },
      clipGeneration: { waiting: clipWaiting, active: clipActive, completed: clipCompleted, failed: clipFailed },
      translation: { waiting: translationWaiting, active: translationActive, completed: translationCompleted, failed: translationFailed },
      dubbing: { waiting: dubbingWaiting, active: dubbingActive, completed: dubbingCompleted, failed: dubbingFailed },
      socialPosting: { waiting: socialWaiting, active: socialActive, completed: socialCompleted, failed: socialFailed },
    };
  } catch {
    return null;
  }
}

let healthServer: ReturnType<typeof Bun.serve> | null = null;
try {
healthServer = Bun.serve({
  port: WORKER_HEALTH_PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Basic health check
    if (url.pathname === "/health" || url.pathname === "/") {
      const redisHealth = await checkRedisHealth();
      const isVideoRunning = videoWorker.isRunning();
      const isClipRunning = clipWorker.isRunning();
      const isTranslationRunning = translationWorker.isRunning();
      const isDubbingRunning = dubbingWorker.isRunning();
      const isSocialRunning = socialWorker.isRunning();

      const isHealthy =
        redisHealth.status === "healthy" && isVideoRunning && isClipRunning && isTranslationRunning && isDubbingRunning;

      const response = {
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        workers: {
          videoWorker: { running: isVideoRunning, concurrency: VIDEO_WORKER_CONCURRENCY },
          clipWorker: { running: isClipRunning, concurrency: CLIP_WORKER_CONCURRENCY },
          translationWorker: { running: isTranslationRunning, concurrency: 1 },
          dubbingWorker: { running: isDubbingRunning, concurrency: DUBBING_WORKER_CONCURRENCY },
          socialWorker: { running: isSocialRunning, concurrency: 2 },
        },
        redis: redisHealth,
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: isHealthy ? 200 : 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Detailed health check with queue stats
    if (url.pathname === "/health/detailed") {
      const redisHealth = await checkRedisHealth();
      const queueStats = await getQueueStats();
      const isVideoRunning = videoWorker.isRunning();
      const isClipRunning = clipWorker.isRunning();
      const isTranslationRunning = translationWorker.isRunning();
      const isDubbingRunning = dubbingWorker.isRunning();
      const isSocialRunning2 = socialWorker.isRunning();

      const isHealthy =
        redisHealth.status === "healthy" && isVideoRunning && isClipRunning && isTranslationRunning && isDubbingRunning;

      const response = {
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        workers: {
          videoWorker: { running: isVideoRunning, concurrency: VIDEO_WORKER_CONCURRENCY },
          clipWorker: { running: isClipRunning, concurrency: CLIP_WORKER_CONCURRENCY },
          translationWorker: { running: isTranslationRunning, concurrency: 1 },
          dubbingWorker: { running: isDubbingRunning, concurrency: DUBBING_WORKER_CONCURRENCY },
          socialWorker: { running: isSocialRunning2, concurrency: 2 },
        },
        redis: redisHealth,
        queues: queueStats,
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: isHealthy ? 200 : 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Full debug dashboard — all Redis + system + queue data
    if (url.pathname === "/health/hevin") {
      const redisHealth = await checkRedisHealth();
      const queueStats = await getQueueStats();

      // Redis INFO
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
        // Get all BullMQ keys
        const keys = await redisConnection.keys("bull:*");
        redisKeys = keys.sort();
      } catch (e) {
        redisInfo = { error: e instanceof Error ? e.message : "failed" };
      }

      // System info
      const os = await import("os");
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const loadAvg = os.loadavg();

      const response = {
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000),

        workers: {
          videoWorker: { running: videoWorker.isRunning(), concurrency: VIDEO_WORKER_CONCURRENCY },
          clipWorker: { running: clipWorker.isRunning(), concurrency: CLIP_WORKER_CONCURRENCY },
          translationWorker: { running: translationWorker.isRunning(), concurrency: 1 },
          dubbingWorker: { running: dubbingWorker.isRunning(), concurrency: DUBBING_WORKER_CONCURRENCY },
          socialWorker: { running: socialWorker.isRunning(), concurrency: 2 },
          total_concurrency:
            VIDEO_WORKER_CONCURRENCY + CLIP_WORKER_CONCURRENCY + 1 + DUBBING_WORKER_CONCURRENCY + 2,
        },

        queues: queueStats,

        system: {
          platform: os.platform(),
          arch: os.arch(),
          node_version: process.version,
          bun_version: typeof Bun !== "undefined" ? Bun.version : "n/a",
          cpu_count: cpus.length,
          cpu_model: cpus[0]?.model,
          cpu_speed_mhz: cpus[0]?.speed,
          load_avg_1m: loadAvg[0].toFixed(2),
          load_avg_5m: loadAvg[1].toFixed(2),
          load_avg_15m: loadAvg[2].toFixed(2),
          memory_total_mb: Math.round(totalMem / 1024 / 1024),
          memory_free_mb: Math.round(freeMem / 1024 / 1024),
          memory_used_mb: Math.round((totalMem - freeMem) / 1024 / 1024),
          memory_used_pct: ((1 - freeMem / totalMem) * 100).toFixed(1) + "%",
          process_memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          process_heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          hostname: os.hostname(),
        },

        redis: {
          status: redisHealth.status,
          latency_ms: redisHealth.latency,
          version: redisStats.redis_version,
          role: redisStats.role,
          uptime_seconds: redisStats.uptime_in_seconds,
          memory: redisMemory,
          clients: redisClients,
          stats: redisStats,
          bullmq_keys_count: redisKeys.length,
          bullmq_keys: redisKeys,
        },

        env: {
          NODE_ENV: process.env.NODE_ENV,
          WORKER_HEALTH_PORT: process.env.WORKER_HEALTH_PORT,
          VIDEO_WORKER_CONCURRENCY: process.env.VIDEO_WORKER_CONCURRENCY,
          CLIP_WORKER_CONCURRENCY: process.env.CLIP_WORKER_CONCURRENCY,
          DUBBING_WORKER_CONCURRENCY: process.env.DUBBING_WORKER_CONCURRENCY,
        },
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Liveness probe
    if (url.pathname === "/health/live") {
      return new Response(
        JSON.stringify({ status: "alive", timestamp: new Date().toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Readiness probe
    if (url.pathname === "/health/ready") {
      const redisHealth = await checkRedisHealth();
      const isVideoRunning = videoWorker.isRunning();
      const isClipRunning = clipWorker.isRunning();
      const isTranslationRunning = translationWorker.isRunning();
      const isDubbingRunning = dubbingWorker.isRunning();
      const isSocialRunning3 = socialWorker.isRunning();

      const isReady =
        redisHealth.status === "healthy" && isVideoRunning && isClipRunning && isTranslationRunning && isDubbingRunning && isSocialRunning3;

      return new Response(
        JSON.stringify({
          status: isReady ? "ready" : "not_ready",
          timestamp: new Date().toISOString(),
        }),
        {
          status: isReady ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[WORKER] Health check server running on http://localhost:${WORKER_HEALTH_PORT}`);
} catch (err) {
  console.warn(`[WORKER] Health check server failed to start (port ${WORKER_HEALTH_PORT} in use). Workers will continue without health endpoint.`);
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
