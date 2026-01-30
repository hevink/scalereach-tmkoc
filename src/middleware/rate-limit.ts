import { Context, Next, MiddlewareHandler } from "hono";
import IORedis from "ioredis";

// Redis connection for rate limiting
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Create a dedicated Redis connection for rate limiting
// Using a separate connection to avoid blocking the main queue connection
let redisClient: IORedis | null = null;

function getRedisClient(): IORedis {
  if (!redisClient) {
    redisClient = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error("[RATE-LIMIT] Redis connection failed after 3 retries");
          return null;
        }
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on("connect", () => {
      console.log("[RATE-LIMIT] Connected to Redis");
    });

    redisClient.on("error", (err) => {
      console.error("[RATE-LIMIT] Redis error:", err.message);
    });
  }
  return redisClient;
}

/**
 * Rate limit configuration options
 */
export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Key prefix for Redis storage */
  keyPrefix?: string;
  /** Custom key generator function - defaults to IP-based */
  keyGenerator?: (c: Context) => string;
  /** Custom error message */
  message?: string;
  /** Skip rate limiting for certain requests */
  skip?: (c: Context) => boolean;
  /** Handler called when rate limit is exceeded */
  onRateLimitExceeded?: (c: Context, retryAfter: number) => void;
}

/**
 * Rate limit result from Redis
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
}

/**
 * Sliding window rate limiter using Redis
 * Uses a sorted set to track request timestamps for accurate rate limiting
 */
async function checkRateLimit(
  redis: IORedis,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const resetTime = now + windowSeconds * 1000;

  // Use a Redis transaction for atomic operations
  const pipeline = redis.pipeline();

  // Remove expired entries (outside the window)
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Count current requests in the window
  pipeline.zcard(key);

  // Add current request timestamp
  pipeline.zadd(key, now, `${now}-${Math.random()}`);

  // Set expiry on the key
  pipeline.expire(key, windowSeconds + 1);

  const results = await pipeline.exec();

  if (!results) {
    // If pipeline fails, allow the request (fail open)
    return {
      allowed: true,
      remaining: limit,
      resetTime,
      retryAfter: 0,
    };
  }

  // Get the count before adding the current request
  const currentCount = (results[1]?.[1] as number) || 0;
  const allowed = currentCount < limit;
  const remaining = Math.max(0, limit - currentCount - 1);

  // Calculate retry-after based on oldest request in window
  let retryAfter = 0;
  if (!allowed) {
    // Get the oldest timestamp in the window
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    if (oldest && oldest.length >= 2) {
      const oldestTime = parseInt(oldest[1], 10);
      retryAfter = Math.ceil((oldestTime + windowSeconds * 1000 - now) / 1000);
      retryAfter = Math.max(1, retryAfter); // At least 1 second
    } else {
      retryAfter = windowSeconds;
    }
  }

  return {
    allowed,
    remaining,
    resetTime,
    retryAfter,
  };
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(c: Context): string {
  // Try to get the real IP from common headers (for proxied requests)
  const forwarded = c.req.header("x-forwarded-for");
  const realIp = c.req.header("x-real-ip");
  const cfConnectingIp = c.req.header("cf-connecting-ip"); // Cloudflare

  let ip = forwarded?.split(",")[0]?.trim() || realIp || cfConnectingIp;

  // Fallback to connection info if available
  if (!ip) {
    // For Bun/Node environments
    const connInfo = c.req.raw as unknown as { socket?: { remoteAddress?: string } };
    ip = connInfo?.socket?.remoteAddress || "unknown";
  }

  return ip;
}

/**
 * Create a rate limiting middleware
 *
 * @example
 * // Basic usage - 100 requests per minute
 * app.use(rateLimit({ limit: 100, windowSeconds: 60 }));
 *
 * @example
 * // Stricter limit for auth endpoints
 * authRouter.use(rateLimit({
 *   limit: 5,
 *   windowSeconds: 60,
 *   keyPrefix: 'auth',
 *   message: 'Too many login attempts. Please try again later.'
 * }));
 *
 * @example
 * // Custom key generator (e.g., by user ID)
 * app.use(rateLimit({
 *   limit: 1000,
 *   windowSeconds: 3600,
 *   keyGenerator: (c) => c.get('user')?.id || defaultKeyGenerator(c)
 * }));
 */
export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const {
    limit,
    windowSeconds,
    keyPrefix = "rl",
    keyGenerator = defaultKeyGenerator,
    message = "Too many requests. Please try again later.",
    skip,
    onRateLimitExceeded,
  } = options;

  return async (c: Context, next: Next) => {
    // Check if we should skip rate limiting for this request
    if (skip && skip(c)) {
      return next();
    }

    const redis = getRedisClient();

    // Generate the rate limit key
    const identifier = keyGenerator(c);
    const path = c.req.path;
    const key = `${keyPrefix}:${path}:${identifier}`;

    try {
      const result = await checkRateLimit(redis, key, limit, windowSeconds);

      // Set rate limit headers
      c.header("X-RateLimit-Limit", limit.toString());
      c.header("X-RateLimit-Remaining", result.remaining.toString());
      c.header("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000).toString());

      if (!result.allowed) {
        // Set Retry-After header
        c.header("Retry-After", result.retryAfter.toString());

        // Call custom handler if provided
        if (onRateLimitExceeded) {
          onRateLimitExceeded(c, result.retryAfter);
        }

        return c.json(
          {
            error: "Too Many Requests",
            message,
            retryAfter: result.retryAfter,
          },
          429
        );
      }

      return next();
    } catch (error) {
      // If Redis fails, log the error and allow the request (fail open)
      console.error("[RATE-LIMIT] Error checking rate limit:", error);
      return next();
    }
  };
}

/**
 * Preset rate limit configurations for common use cases
 */
export const RateLimitPresets = {
  /**
   * Strict rate limit for authentication endpoints
   * 5 requests per minute per IP
   */
  auth: (): MiddlewareHandler =>
    rateLimit({
      limit: 5,
      windowSeconds: 60,
      keyPrefix: "rl:auth",
      message: "Too many authentication attempts. Please try again in a minute.",
    }),

  /**
   * Strict rate limit for password reset
   * 3 requests per 15 minutes per IP
   */
  passwordReset: (): MiddlewareHandler =>
    rateLimit({
      limit: 3,
      windowSeconds: 900, // 15 minutes
      keyPrefix: "rl:pwd-reset",
      message: "Too many password reset attempts. Please try again later.",
    }),

  /**
   * Standard API rate limit
   * 100 requests per minute per IP
   */
  api: (): MiddlewareHandler =>
    rateLimit({
      limit: 100,
      windowSeconds: 60,
      keyPrefix: "rl:api",
    }),

  /**
   * Relaxed rate limit for read-heavy endpoints
   * 300 requests per minute per IP
   */
  read: (): MiddlewareHandler =>
    rateLimit({
      limit: 300,
      windowSeconds: 60,
      keyPrefix: "rl:read",
    }),

  /**
   * Strict rate limit for expensive operations (video processing, exports)
   * 10 requests per minute per IP
   */
  expensive: (): MiddlewareHandler =>
    rateLimit({
      limit: 10,
      windowSeconds: 60,
      keyPrefix: "rl:expensive",
      message: "Too many requests for this operation. Please wait before trying again.",
    }),

  /**
   * Very strict rate limit for file uploads
   * 20 uploads per hour per IP
   */
  upload: (): MiddlewareHandler =>
    rateLimit({
      limit: 20,
      windowSeconds: 3600, // 1 hour
      keyPrefix: "rl:upload",
      message: "Upload limit reached. Please try again later.",
    }),

  /**
   * Rate limit for webhook endpoints
   * 1000 requests per minute per IP
   */
  webhook: (): MiddlewareHandler =>
    rateLimit({
      limit: 1000,
      windowSeconds: 60,
      keyPrefix: "rl:webhook",
    }),
};

/**
 * Create a user-based rate limiter (requires authenticated user)
 * Falls back to IP-based limiting if user is not authenticated
 */
export function userRateLimit(options: Omit<RateLimitOptions, "keyGenerator">): MiddlewareHandler {
  return rateLimit({
    ...options,
    keyGenerator: (c: Context) => {
      const user = c.get("user") as { id?: string } | undefined;
      if (user?.id) {
        return `user:${user.id}`;
      }
      // Fallback to IP-based limiting
      return `ip:${defaultKeyGenerator(c)}`;
    },
  });
}

/**
 * Cleanup function to close Redis connection
 * Call this when shutting down the application
 */
export async function closeRateLimitRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log("[RATE-LIMIT] Redis connection closed");
  }
}
