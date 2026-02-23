// Worker v1.2.0 — email-allowlist auth for protected endpoints
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
const SESSION_SECRET = process.env.WORKER_SECRET || "dev-secret-change-me";

// Only these emails can access /health/detailed and /health/hevin
const ALLOWED_EMAILS = new Set(["hevinkalathiya123@gmail.com", "hevinatwork@gmail.com"]);

// In-memory session store: token -> email (cleared on worker restart)
const sessions = new Map<string, string>();

function generateToken(): string {
  return crypto.randomUUID() + "-" + Date.now().toString(36);
}

function getSessionEmail(req: Request): string | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(/worker_session=([^;]+)/);
  if (!match) return null;
  return sessions.get(match[1]) || null;
}

function isAuthorized(req: Request): boolean {
  // Allow via session cookie (browser login)
  const email = getSessionEmail(req);
  if (email && ALLOWED_EMAILS.has(email)) return true;
  // Also allow via Bearer token / header for curl/API access
  const auth = req.headers.get("authorization");
  const token = req.headers.get("x-worker-token");
  return auth === `Bearer ${SESSION_SECRET}` || token === SESSION_SECRET;
}

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cache-Control": "no-store",
};

function loginPage(error?: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScaleReach Worker — Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:40px;width:100%;max-width:380px}
    .logo{font-size:12px;color:#555;letter-spacing:.1em;text-transform:uppercase;margin-bottom:24px}
    h1{font-size:20px;font-weight:600;margin-bottom:8px}
    p{font-size:14px;color:#888;margin-bottom:28px;line-height:1.5}
    label{display:block;font-size:13px;color:#aaa;margin-bottom:6px}
    input{width:100%;padding:10px 14px;background:#111;border:1px solid #333;border-radius:8px;color:#e5e5e5;font-size:14px;outline:none}
    input:focus{border-color:#555}
    button{width:100%;margin-top:16px;padding:11px;background:#e5e5e5;color:#0f0f0f;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
    button:hover{background:#fff}
    .error{margin-top:16px;padding:10px 14px;background:#2a1a1a;border:1px solid #5a2a2a;border-radius:8px;font-size:13px;color:#f87171}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">ScaleReach · Worker</div>
    <h1>Dashboard Login</h1>
    <p>Enter your email address. Access is restricted to authorized accounts only.</p>
    <form method="POST" action="/auth/login">
      <label for="email">Email address</label>
      <input type="email" id="email" name="email" placeholder="you@example.com" required autofocus>
      <button type="submit">Continue →</button>
    </form>
    ${error ? `<div class="error">${error}</div>` : ""}
  </div>
</body>
</html>`;
  return new Response(html, {
    status: error ? 403 : 200,
    headers: { "Content-Type": "text/html", "X-Frame-Options": "DENY", "Cache-Control": "no-store" },
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
    const [vW, vA, vC, vF] = await Promise.all([videoProcessingQueue.getWaitingCount(), videoProcessingQueue.getActiveCount(), videoProcessingQueue.getCompletedCount(), videoProcessingQueue.getFailedCount()]);
    const [cW, cA, cC, cF] = await Promise.all([clipGenerationQueue.getWaitingCount(), clipGenerationQueue.getActiveCount(), clipGenerationQueue.getCompletedCount(), clipGenerationQueue.getFailedCount()]);
    const [tW, tA, tC, tF] = await Promise.all([translationQueue.getWaitingCount(), translationQueue.getActiveCount(), translationQueue.getCompletedCount(), translationQueue.getFailedCount()]);
    const [dW, dA, dC, dF] = await Promise.all([dubbingQueue.getWaitingCount(), dubbingQueue.getActiveCount(), dubbingQueue.getCompletedCount(), dubbingQueue.getFailedCount()]);
    const [sW, sA, sC, sF] = await Promise.all([socialPostingQueue.getWaitingCount(), socialPostingQueue.getActiveCount(), socialPostingQueue.getCompletedCount(), socialPostingQueue.getFailedCount()]);
    return {
      videoProcessing: { waiting: vW, active: vA, completed: vC, failed: vF },
      clipGeneration: { waiting: cW, active: cA, completed: cC, failed: cF },
      translation: { waiting: tW, active: tA, completed: tC, failed: tF },
      dubbing: { waiting: dW, active: dA, completed: dC, failed: dF },
      socialPosting: { waiting: sW, active: sA, completed: sC, failed: sF },
    };
  } catch { return null; }
}

let healthServer: ReturnType<typeof Bun.serve> | null = null;
try {
  healthServer = Bun.serve({
    port: WORKER_HEALTH_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // ── Auth: login page ──────────────────────────────────
      if (url.pathname === "/auth/login") {
        if (req.method === "GET") return loginPage();
        if (req.method === "POST") {
          const body = await req.text();
          const params = new URLSearchParams(body);
          const email = (params.get("email") || "").toLowerCase().trim();
          if (!ALLOWED_EMAILS.has(email)) {
            return loginPage("Access denied. This email is not authorized.");
          }
          const token = generateToken();
          sessions.set(token, email);
          return new Response(null, {
            status: 302,
            headers: {
              Location: "/health/hevin",
              "Set-Cookie": `worker_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`,
              "Cache-Control": "no-store",
            },
          });
        }
      }

      // ── Auth: logout ──────────────────────────────────────
      if (url.pathname === "/auth/logout") {
        const cookie = req.headers.get("cookie") || "";
        const match = cookie.match(/worker_session=([^;]+)/);
        if (match) sessions.delete(match[1]);
        return new Response(null, {
          status: 302,
          headers: { Location: "/auth/login", "Set-Cookie": "worker_session=; Path=/; Max-Age=0" },
        });
      }

      // ── PUBLIC: basic health ──────────────────────────────
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

      // ── PUBLIC: liveness / readiness probes ──────────────
      if (url.pathname === "/health/live") {
        return new Response(JSON.stringify({ status: "alive", timestamp: new Date().toISOString() }),
          { status: 200, headers: SECURITY_HEADERS });
      }
      if (url.pathname === "/health/ready") {
        const redisHealth = await checkRedisHealth();
        const isReady = redisHealth.status === "healthy" &&
          videoWorker.isRunning() && clipWorker.isRunning() &&
          translationWorker.isRunning() && dubbingWorker.isRunning() && socialWorker.isRunning();
        return new Response(JSON.stringify({ status: isReady ? "ready" : "not_ready", timestamp: new Date().toISOString() }),
          { status: isReady ? 200 : 503, headers: SECURITY_HEADERS });
      }

      // ── PROTECTED: queue stats ────────────────────────────
      if (url.pathname === "/health/detailed") {
        if (!isAuthorized(req)) {
          // Browser: redirect to login. API client: return 401
          const accept = req.headers.get("accept") || "";
          if (accept.includes("text/html")) return new Response(null, { status: 302, headers: { Location: "/auth/login" } });
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }
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

      // ── PROTECTED: full debug dashboard ──────────────────
      if (url.pathname === "/health/hevin") {
        if (!isAuthorized(req)) {
          const accept = req.headers.get("accept") || "";
          if (accept.includes("text/html")) return new Response(null, { status: 302, headers: { Location: "/auth/login" } });
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }
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
          redisMemory = { used_memory_human: redisInfo.used_memory_human, used_memory_peak_human: redisInfo.used_memory_peak_human, maxmemory_human: redisInfo.maxmemory_human || "unlimited", mem_fragmentation_ratio: redisInfo.mem_fragmentation_ratio };
          redisClients = { connected_clients: redisInfo.connected_clients, blocked_clients: redisInfo.blocked_clients, tracking_clients: redisInfo.tracking_clients };
          redisStats = { total_commands_processed: redisInfo.total_commands_processed, total_connections_received: redisInfo.total_connections_received, keyspace_hits: redisInfo.keyspace_hits, keyspace_misses: redisInfo.keyspace_misses, uptime_in_seconds: redisInfo.uptime_in_seconds, redis_version: redisInfo.redis_version, role: redisInfo.role };
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
        const sessionEmail = getSessionEmail(req);
        return new Response(JSON.stringify({
          timestamp: new Date().toISOString(),
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
          authenticated_as: sessionEmail,
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
            platform: os.platform(), arch: os.arch(), node_version: process.version,
            bun_version: typeof Bun !== "undefined" ? Bun.version : "n/a",
            cpu_count: cpus.length, cpu_model: cpus[0]?.model, cpu_speed_mhz: cpus[0]?.speed,
            load_avg_1m: loadAvg[0].toFixed(2), load_avg_5m: loadAvg[1].toFixed(2), load_avg_15m: loadAvg[2].toFixed(2),
            memory_total_mb: Math.round(totalMem / 1024 / 1024), memory_free_mb: Math.round(freeMem / 1024 / 1024),
            memory_used_mb: Math.round((totalMem - freeMem) / 1024 / 1024),
            memory_used_pct: ((1 - freeMem / totalMem) * 100).toFixed(1) + "%",
            process_memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            process_heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            hostname: os.hostname(),
          },
          redis: { status: redisHealth.status, latency_ms: redisHealth.latency, version: redisStats.redis_version, role: redisStats.role, uptime_seconds: redisStats.uptime_in_seconds, memory: redisMemory, clients: redisClients, stats: redisStats, bullmq_keys_count: redisKeys.length, bullmq_keys: redisKeys },
          env: { NODE_ENV: process.env.NODE_ENV, WORKER_HEALTH_PORT: process.env.WORKER_HEALTH_PORT, VIDEO_WORKER_CONCURRENCY: process.env.VIDEO_WORKER_CONCURRENCY, CLIP_WORKER_CONCURRENCY: process.env.CLIP_WORKER_CONCURRENCY, DUBBING_WORKER_CONCURRENCY: process.env.DUBBING_WORKER_CONCURRENCY },
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
