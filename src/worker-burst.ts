/**
 * Burst Worker - runs on the burst EC2 instance only
 *
 * Stripped-down worker that only starts CPU-heavy workers:
 * - Clip generation (FFmpeg encoding)
 * - Dubbing (FFmpeg + TTS)
 *
 * No health server, no video worker, no social worker, no cron jobs.
 * Connects to the same Redis/BullMQ queues as the base worker.
 */

// Initialize Sentry
import "./lib/sentry";

import { startClipWorker } from "./jobs/clip.worker";
import { startDubbingWorker } from "./jobs/dubbing.worker";
import { cleanupOrphanedTempFiles } from "./utils/temp-cleanup";

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

// Minimal health endpoint so the base scaler can check if burst is alive
const startTime = Date.now();
let healthServer: ReturnType<typeof Bun.serve> | null = null;
try {
  healthServer = Bun.serve({
    port: HEALTH_PORT,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health" || url.pathname === "/") {
        const isHealthy = clipWorker.isRunning() && dubbingWorker.isRunning();
        return new Response(
          JSON.stringify({
            status: isHealthy ? "healthy" : "unhealthy",
            mode: "burst",
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - startTime) / 1000),
            workers: {
              clipWorker: { running: clipWorker.isRunning(), concurrency: CLIP_CONCURRENCY },
              dubbingWorker: { running: dubbingWorker.isRunning(), concurrency: DUBBING_CONCURRENCY },
            },
          }, null, 2),
          {
            status: isHealthy ? 200 : 503,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      return new Response("Not Found", { status: 404 });
    },
  });
  console.log(`[BURST] Health server running on http://localhost:${HEALTH_PORT}`);
} catch (err) {
  console.warn(`[BURST] Health server failed to start (port ${HEALTH_PORT} in use)`);
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[BURST] ${signal} received, shutting down...`);
  healthServer?.stop();
  await Promise.all([clipWorker.close(), dubbingWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log("[BURST] Workers running and waiting for jobs...");
