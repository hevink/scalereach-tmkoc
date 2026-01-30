import IORedis from "ioredis";
import { redisConnection } from "../jobs/queue";

/**
 * Redis Cache Utility
 * Provides TTL-based caching with common patterns for user sessions, project metadata, etc.
 */

// Default TTL values in seconds
export const CacheTTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
  WEEK: 604800, // 7 days
} as const;

// Cache key prefixes for organization
export const CachePrefix = {
  USER: "cache:user",
  SESSION: "cache:session",
  PROJECT: "cache:project",
  VIDEO: "cache:video",
  CLIP: "cache:clip",
  WORKSPACE: "cache:workspace",
  SUBSCRIPTION: "cache:subscription",
} as const;

/**
 * Get the Redis client for caching
 * Uses the existing connection from the queue module
 */
function getRedis(): IORedis {
  return redisConnection;
}

/**
 * Build a cache key with prefix
 */
export function buildKey(prefix: string, ...parts: string[]): string {
  return [prefix, ...parts].join(":");
}

/**
 * Get a value from cache
 * Returns null if key doesn't exist or on error
 */
export async function get<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const value = await redis.get(key);
    if (value === null) {
      return null;
    }
    return JSON.parse(value) as T;
  } catch (error) {
    console.error("[CACHE] Error getting key:", key, error);
    return null;
  }
}

/**
 * Set a value in cache with TTL
 * @param key - Cache key
 * @param value - Value to cache (will be JSON serialized)
 * @param ttlSeconds - Time to live in seconds (default: 5 minutes)
 */
export async function set<T>(
  key: string,
  value: T,
  ttlSeconds: number = CacheTTL.MEDIUM
): Promise<boolean> {
  try {
    const redis = getRedis();
    const serialized = JSON.stringify(value);
    await redis.setex(key, ttlSeconds, serialized);
    return true;
  } catch (error) {
    console.error("[CACHE] Error setting key:", key, error);
    return false;
  }
}

/**
 * Delete a key from cache
 */
export async function del(key: string): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.del(key);
    return true;
  } catch (error) {
    console.error("[CACHE] Error deleting key:", key, error);
    return false;
  }
}

/**
 * Delete multiple keys matching a pattern
 * Use with caution - scans the keyspace
 * @param pattern - Redis glob pattern (e.g., "cache:user:*")
 */
export async function delPattern(pattern: string): Promise<number> {
  try {
    const redis = getRedis();
    let cursor = "0";
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== "0");

    return deletedCount;
  } catch (error) {
    console.error("[CACHE] Error deleting pattern:", pattern, error);
    return 0;
  }
}

/**
 * Check if a key exists in cache
 */
export async function exists(key: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    console.error("[CACHE] Error checking existence:", key, error);
    return false;
  }
}

/**
 * Get remaining TTL for a key in seconds
 * Returns -2 if key doesn't exist, -1 if no TTL set
 */
export async function ttl(key: string): Promise<number> {
  try {
    const redis = getRedis();
    return await redis.ttl(key);
  } catch (error) {
    console.error("[CACHE] Error getting TTL:", key, error);
    return -2;
  }
}

/**
 * Get or Set pattern (cache-aside)
 * Returns cached value if exists, otherwise calls fetcher and caches the result
 *
 * @param key - Cache key
 * @param fetcher - Async function to fetch data if not cached
 * @param ttlSeconds - Time to live in seconds
 *
 * @example
 * const user = await getOrSet(
 *   buildKey(CachePrefix.USER, userId),
 *   () => db.query.users.findFirst({ where: eq(users.id, userId) }),
 *   CacheTTL.MEDIUM
 * );
 */
export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T | null>,
  ttlSeconds: number = CacheTTL.MEDIUM
): Promise<T | null> {
  // Try to get from cache first
  const cached = await get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const fresh = await fetcher();
  if (fresh === null) {
    return null;
  }

  // Cache the result
  await set(key, fresh, ttlSeconds);
  return fresh;
}

/**
 * Invalidate cache for a specific entity
 * Deletes all keys matching the entity pattern
 *
 * @example
 * // Invalidate all user-related cache
 * await invalidate(CachePrefix.USER, userId);
 */
export async function invalidate(prefix: string, id: string): Promise<boolean> {
  const key = buildKey(prefix, id);
  return del(key);
}

/**
 * Invalidate multiple related cache entries
 *
 * @example
 * // When a project is updated, invalidate project and related caches
 * await invalidateMany([
 *   [CachePrefix.PROJECT, projectId],
 *   [CachePrefix.WORKSPACE, workspaceId],
 * ]);
 */
export async function invalidateMany(entries: [string, string][]): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();

  for (const [prefix, id] of entries) {
    const key = buildKey(prefix, id);
    pipeline.del(key);
  }

  try {
    await pipeline.exec();
  } catch (error) {
    console.error("[CACHE] Error invalidating multiple keys:", error);
  }
}

/**
 * Refresh TTL on an existing key without changing its value
 */
export async function touch(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.expire(key, ttlSeconds);
    return result === 1;
  } catch (error) {
    console.error("[CACHE] Error touching key:", key, error);
    return false;
  }
}

// ============================================================================
// Domain-specific cache helpers
// ============================================================================

/**
 * Cache helpers for user data
 */
export const userCache = {
  key: (userId: string) => buildKey(CachePrefix.USER, userId),

  get: <T>(userId: string) => get<T>(userCache.key(userId)),

  set: <T>(userId: string, data: T, ttl = CacheTTL.MEDIUM) =>
    set(userCache.key(userId), data, ttl),

  invalidate: (userId: string) => del(userCache.key(userId)),

  getOrSet: <T>(userId: string, fetcher: () => Promise<T | null>, ttl = CacheTTL.MEDIUM) =>
    getOrSet(userCache.key(userId), fetcher, ttl),
};

/**
 * Cache helpers for session data
 */
export const sessionCache = {
  key: (sessionId: string) => buildKey(CachePrefix.SESSION, sessionId),

  get: <T>(sessionId: string) => get<T>(sessionCache.key(sessionId)),

  set: <T>(sessionId: string, data: T, ttl = CacheTTL.DAY) =>
    set(sessionCache.key(sessionId), data, ttl),

  invalidate: (sessionId: string) => del(sessionCache.key(sessionId)),

  // Invalidate all sessions for a user
  invalidateUser: (userId: string) => delPattern(`${CachePrefix.SESSION}:*:${userId}`),
};

/**
 * Cache helpers for project data
 */
export const projectCache = {
  key: (projectId: string) => buildKey(CachePrefix.PROJECT, projectId),

  get: <T>(projectId: string) => get<T>(projectCache.key(projectId)),

  set: <T>(projectId: string, data: T, ttl = CacheTTL.MEDIUM) =>
    set(projectCache.key(projectId), data, ttl),

  invalidate: (projectId: string) => del(projectCache.key(projectId)),

  getOrSet: <T>(projectId: string, fetcher: () => Promise<T | null>, ttl = CacheTTL.MEDIUM) =>
    getOrSet(projectCache.key(projectId), fetcher, ttl),
};

/**
 * Cache helpers for video metadata
 */
export const videoCache = {
  key: (videoId: string) => buildKey(CachePrefix.VIDEO, videoId),

  get: <T>(videoId: string) => get<T>(videoCache.key(videoId)),

  set: <T>(videoId: string, data: T, ttl = CacheTTL.LONG) =>
    set(videoCache.key(videoId), data, ttl),

  invalidate: (videoId: string) => del(videoCache.key(videoId)),

  getOrSet: <T>(videoId: string, fetcher: () => Promise<T | null>, ttl = CacheTTL.LONG) =>
    getOrSet(videoCache.key(videoId), fetcher, ttl),
};

/**
 * Cache helpers for workspace data
 */
export const workspaceCache = {
  key: (workspaceId: string) => buildKey(CachePrefix.WORKSPACE, workspaceId),

  get: <T>(workspaceId: string) => get<T>(workspaceCache.key(workspaceId)),

  set: <T>(workspaceId: string, data: T, ttl = CacheTTL.MEDIUM) =>
    set(workspaceCache.key(workspaceId), data, ttl),

  invalidate: (workspaceId: string) => del(workspaceCache.key(workspaceId)),

  getOrSet: <T>(workspaceId: string, fetcher: () => Promise<T | null>, ttl = CacheTTL.MEDIUM) =>
    getOrSet(workspaceCache.key(workspaceId), fetcher, ttl),
};

/**
 * Cache helpers for subscription/billing data
 */
export const subscriptionCache = {
  key: (workspaceId: string) => buildKey(CachePrefix.SUBSCRIPTION, workspaceId),

  get: <T>(workspaceId: string) => get<T>(subscriptionCache.key(workspaceId)),

  set: <T>(workspaceId: string, data: T, ttl = CacheTTL.SHORT) =>
    set(subscriptionCache.key(workspaceId), data, ttl),

  invalidate: (workspaceId: string) => del(subscriptionCache.key(workspaceId)),

  getOrSet: <T>(workspaceId: string, fetcher: () => Promise<T | null>, ttl = CacheTTL.SHORT) =>
    getOrSet(subscriptionCache.key(workspaceId), fetcher, ttl),
};
