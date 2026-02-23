// Worker v1.0.1 — deployed via CI/CD
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
