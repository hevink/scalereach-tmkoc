import { Hono } from "hono";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { redisConnection, videoProcessingQueue, clipGenerationQueue, QUEUE_NAMES } from "../jobs/queue";
import { adminMiddleware } from "../middleware/admin.middleware";

const healthRouter = new Hono();

interface HealthCheckResult {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    queues?: QueueHealth;
  };
}

interface ComponentHealth {
  status: "healthy" | "unhealthy";
  latency?: number;
  error?: string;
}

interface QueueHealth {
  status: "healthy" | "unhealthy" | "degraded";
  videoProcessing: QueueStats;
  clipGeneration: QueueStats;
}

interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

const startTime = Date.now();

/**
 * Check database connectivity by running a simple query
 */
async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // Run a simple query to check database connectivity
    await db.execute(sql`SELECT 1`);
    return {
      status: "healthy",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}

/**
 * Check Redis connectivity using ping
 */
async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const result = await redisConnection.ping();
    if (result === "PONG") {
      return {
        status: "healthy",
        latency: Date.now() - start,
      };
    }
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      error: `Unexpected ping response: ${result}`,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown Redis error",
    };
  }
}

/**
 * Get queue statistics
 */
async function getQueueStats(): Promise<QueueHealth> {
  try {
    const [videoWaiting, videoActive, videoCompleted, videoFailed, videoDelayed] =
      await Promise.all([
        videoProcessingQueue.getWaitingCount(),
        videoProcessingQueue.getActiveCount(),
        videoProcessingQueue.getCompletedCount(),
        videoProcessingQueue.getFailedCount(),
        videoProcessingQueue.getDelayedCount(),
      ]);

    const [clipWaiting, clipActive, clipCompleted, clipFailed, clipDelayed] =
      await Promise.all([
        clipGenerationQueue.getWaitingCount(),
        clipGenerationQueue.getActiveCount(),
        clipGenerationQueue.getCompletedCount(),
        clipGenerationQueue.getFailedCount(),
        clipGenerationQueue.getDelayedCount(),
      ]);

    const videoStats: QueueStats = {
      waiting: videoWaiting,
      active: videoActive,
      completed: videoCompleted,
      failed: videoFailed,
      delayed: videoDelayed,
    };

    const clipStats: QueueStats = {
      waiting: clipWaiting,
      active: clipActive,
      completed: clipCompleted,
      failed: clipFailed,
      delayed: clipDelayed,
    };

    // Determine overall queue health
    // Degraded if there are failed jobs, unhealthy if we can't get stats
    const hasFailed = videoFailed > 0 || clipFailed > 0;

    return {
      status: hasFailed ? "degraded" : "healthy",
      videoProcessing: videoStats,
      clipGeneration: clipStats,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      videoProcessing: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
      clipGeneration: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    };
  }
}

/**
 * Basic health check - lightweight, for load balancers
 * GET /health
 */
healthRouter.get("/", async (c) => {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const isHealthy = dbHealth.status === "healthy" && redisHealth.status === "healthy";

  const result: HealthCheckResult = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      database: dbHealth,
      redis: redisHealth,
    },
  };

  return c.json(result, isHealthy ? 200 : 503);
});

/**
 * Detailed health check - includes queue stats, for monitoring dashboards
 * GET /health/detailed (admin only)
 */
healthRouter.get("/detailed", adminMiddleware, async (c) => {
  const [dbHealth, redisHealth, queueHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    getQueueStats(),
  ]);

  const isDbHealthy = dbHealth.status === "healthy";
  const isRedisHealthy = redisHealth.status === "healthy";
  const isQueueHealthy = queueHealth.status === "healthy";

  let overallStatus: "healthy" | "unhealthy" | "degraded" = "healthy";
  if (!isDbHealthy || !isRedisHealthy) {
    overallStatus = "unhealthy";
  } else if (queueHealth.status === "degraded") {
    overallStatus = "degraded";
  }

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      database: dbHealth,
      redis: redisHealth,
      queues: queueHealth,
    },
  };

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;
  return c.json(result, statusCode);
});

/**
 * Liveness probe - just checks if the server is running
 * GET /health/live
 */
healthRouter.get("/live", (c) => {
  return c.json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe - checks if the server is ready to accept traffic
 * GET /health/ready
 */
healthRouter.get("/ready", async (c) => {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const isReady = dbHealth.status === "healthy" && redisHealth.status === "healthy";

  return c.json(
    {
      status: isReady ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealth.status,
        redis: redisHealth.status,
      },
    },
    isReady ? 200 : 503
  );
});

export default healthRouter;
