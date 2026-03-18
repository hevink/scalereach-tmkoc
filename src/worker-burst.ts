/**
 * Burst Worker - runs on the burst EC2 instance only
 *
 * Stripped-down worker that only starts CPU-heavy workers:
 * - Clip generation (FFmpeg encoding)
 * - Dubbing (FFmpeg + TTS)
 *
 * No video worker, no social worker, no cron jobs.
 * Connects to the same Redis/BullMQ queues as the base worker.
 */

// Initialize Sentry
import "./lib/sentry";

import { startClipWorker } from "./jobs/clip.worker";
import { startDubbingWorker } from "./jobs/dubbing.worker";
import { cleanupOrphanedTempFiles } from "./utils/temp-cleanup";
import { redisConnection, clipGenerationQueue } from "./jobs/queue";
import { dubbingQueue } from "./jobs/dubbing.worker";
import { R2Service } from "./services/r2.service";
import { readFileSync, existsSync } from "fs";

const CLIP_CONCURRENCY = parseInt(process.env.CLIP_WORKER_CONCURRENCY || "8", 10);
const DUBBING_CONCURRENCY = parseInt(process.env.DUBBING_WORKER_CONCURRENCY || "2", 10);
const HEALTH_PORT = parseInt(process.env.BURST_HEALTH_PORT || "3003", 10);

console.log(`[BURST] Starting burst workers`);
console.log(`[BURST] Clip concurrency: ${CLIP_CONCURRENCY}`);
console.log(`[BURST] Dubbing concurrency: ${DUBBING_CONCURRENCY}`);

// Clean up orphaned temp files from previous crashed runs
cleanupOrphanedTempFiles().catch(() => {});

const clipWorker = startClipWorker(CLIP_CONCURRENCY);
const dubbingWorker = startDubbingWorker(DUBBING_CONCURRENCY);

const startTime = Date.now();

async function getGitInfo() {
  try {
    const { execSync } = await import("child_process");
    const opts = { cwd: "/opt/scalereach" };
    return {
      commit: execSync("git rev-parse HEAD", opts).toString().trim(),
      short: execSync("git rev-parse --short HEAD", opts).toString().trim(),
      branch: execSync("git rev-parse --abbrev-ref HEAD", opts).toString().trim(),
      message: execSync("git log -1 --pretty=%s", opts).toString().trim(),
      author: execSync("git log -1 --pretty=%an", opts).toString().trim(),
      date: execSync("git log -1 --pretty=%ci", opts).toString().trim(),
    };
  } catch { return { error: "git info unavailable" }; }
}

async function getQueueStats() {
  try {
    const [cW, cA, cC, cF, cP] = await Promise.all([
      clipGenerationQueue.getWaitingCount(), clipGenerationQueue.getActiveCount(),
      clipGenerationQueue.getCompletedCount(), clipGenerationQueue.getFailedCount(),
      // BullMQ stores priority jobs in a separate sorted set, not in the wait list.
      // getWaitingCount() misses them entirely, so we count them via Redis directly.
      redisConnection.zcard(`bull:${clipGenerationQueue.name}:prioritized`).catch(() => 0),
    ]);
    const [dW, dA, dC, dF] = await Promise.all([
      dubbingQueue.getWaitingCount(), dubbingQueue.getActiveCount(),
      dubbingQueue.getCompletedCount(), dubbingQueue.getFailedCount(),
    ]);
    return {
      clipGeneration: { waiting: cW + cP, active: cA, completed: cC, failed: cF },
      dubbing: { waiting: dW, active: dA, completed: dC, failed: dF },
    };
  } catch { return null; }
}

async function checkRedisHealth() {
  const start = Date.now();
  try {
    const result = await redisConnection.ping();
    if (result === "PONG") return { status: "healthy", latency: Date.now() - start };
    return { status: "unhealthy", latency: Date.now() - start, error: `Unexpected: ${result}` };
  } catch (error) {
    return { status: "unhealthy", latency: Date.now() - start, error: error instanceof Error ? error.message : "Unknown" };
  }
}

const BURST_OUT_LOG = process.env.PM2_LOG_FILE || "/opt/scalereach/logs/burst-out.log";
const BURST_ERR_LOG = process.env.PM2_ERR_FILE || "/opt/scalereach/logs/burst-error.log";

async function uploadLogsToR2() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const results: { key: string; url: string; size: number }[] = [];

  for (const { path, prefix } of [
    { path: BURST_OUT_LOG, prefix: "burst-out" },
    { path: BURST_ERR_LOG, prefix: "burst-error" },
  ]) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path);
    if (content.length === 0) continue;

    // Upload timestamped version
    const tsKey = `logs/burst/${prefix}-${ts}.log`;
    const { url } = await R2Service.uploadFile(tsKey, content, "text/plain");
    results.push({ key: tsKey, url, size: content.length });

    // Upload as "latest" for quick access
    const latestKey = `logs/burst/${prefix}-latest.log`;
    await R2Service.uploadFile(latestKey, content, "text/plain");
  }

  return results;
}

let healthServer: ReturnType<typeof Bun.serve> | null = null;
try {
  healthServer = Bun.serve({
    port: HEALTH_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health" || url.pathname === "/") {
        const isHealthy = clipWorker.isRunning() && dubbingWorker.isRunning();
        const redisHealth = await checkRedisHealth();
        const queueStats = await getQueueStats();
        const os = await import("os");
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const loadAvg = os.loadavg();

        return new Response(JSON.stringify({
          status: isHealthy ? "healthy" : "unhealthy",
          mode: "burst",
          timestamp: new Date().toISOString(),
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
          git: await getGitInfo(),
          workers: {
            clipWorker: { running: clipWorker.isRunning(), concurrency: CLIP_CONCURRENCY },
            dubbingWorker: { running: dubbingWorker.isRunning(), concurrency: DUBBING_CONCURRENCY },
          },
          queues: queueStats,
          system: {
            platform: os.platform(), arch: os.arch(),
            bun_version: typeof Bun !== "undefined" ? Bun.version : "n/a",
            cpu_count: cpus.length, cpu_model: cpus[0]?.model, cpu_speed_mhz: cpus[0]?.speed,
            load_avg_1m: loadAvg[0].toFixed(2), load_avg_5m: loadAvg[1].toFixed(2),
            memory_total_mb: Math.round(totalMem / 1024 / 1024),
            memory_free_mb: Math.round(freeMem / 1024 / 1024),
            memory_used_mb: Math.round((totalMem - freeMem) / 1024 / 1024),
            memory_used_pct: ((1 - freeMem / totalMem) * 100).toFixed(1) + "%",
            process_memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            hostname: os.hostname(),
          },
          redis: { status: redisHealth.status, latency_ms: redisHealth.latency },
        }, null, 2), {
          status: isHealthy ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Upload burst logs to R2 on demand
      if (url.pathname === "/health/upload-logs" && req.method === "POST") {
        try {
          const results = await uploadLogsToR2();
          return new Response(JSON.stringify({ success: true, uploaded: results }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message || "Upload failed" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      }

      // Read local log content directly
      if (url.pathname === "/health/logs") {
        const type = url.searchParams.get("type") || "out";
        const lines = Math.min(parseInt(url.searchParams.get("lines") || "500", 10), 5000);
        const logPath = type === "error" ? BURST_ERR_LOG : BURST_OUT_LOG;
        try {
          if (!existsSync(logPath)) {
            return new Response("Log file not found", { status: 404 });
          }
          const { execSync } = await import("child_process");
          const content = execSync(`tail -${lines} "${logPath}"`, { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
          return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
        } catch (err: any) {
          return new Response(err?.message || "Failed to read logs", { status: 500 });
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });
  console.log(`[BURST] Health server running on http://localhost:${HEALTH_PORT}`);
} catch (err) {
  console.warn(`[BURST] Health server failed to start (port ${HEALTH_PORT} in use)`);
}

async function shutdown(signal: string) {
  console.log(`[BURST] ${signal} received, shutting down...`);
  console.log(`[BURST] Uploading logs to R2 before shutdown...`);
  try {
    await uploadLogsToR2();
    console.log(`[BURST] Logs uploaded to R2`);
  } catch (err) {
    console.error(`[BURST] Failed to upload logs on shutdown:`, err);
  }
  healthServer?.stop();
  await Promise.all([clipWorker.close(), dubbingWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log("[BURST] Workers running and waiting for jobs...");
