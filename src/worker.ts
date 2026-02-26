// Worker v1.3.0 — live log viewer at /health/hevin/logs
// Initialize Sentry first (must be at the very top)
import "./lib/sentry";

import { spawn as spawnProc, execSync as execSyncNode } from "child_process";
import { existsSync as fsExists } from "fs";

import { startPotServer, stopPotServer } from "./lib/pot-server";
import { startVideoWorker } from "./jobs/video.worker";
import { startClipWorker } from "./jobs/clip.worker";
import { startTranslationWorker, translationQueue } from "./jobs/translation.worker";
import { startDubbingWorker, dubbingQueue } from "./jobs/dubbing.worker";
import { startSocialWorker } from "./jobs/social.worker";
import { startStorageCleanupJob } from "./jobs/storage-cleanup.job";
import { startSmartCropWorker } from "./jobs/smart-crop.worker";
import { redisConnection, videoProcessingQueue, clipGenerationQueue, socialPostingQueue, smartCropQueue } from "./jobs/queue";

const VIDEO_WORKER_CONCURRENCY = parseInt(process.env.VIDEO_WORKER_CONCURRENCY || "2", 10);
const CLIP_WORKER_CONCURRENCY = parseInt(process.env.CLIP_WORKER_CONCURRENCY || "2", 10);
const WORKER_HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || "3002", 10);
const DUBBING_WORKER_CONCURRENCY = parseInt(process.env.DUBBING_WORKER_CONCURRENCY || "1", 10);
const SMART_CROP_WORKER_CONCURRENCY = parseInt(process.env.SMART_CROP_WORKER_CONCURRENCY || "1", 10);
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

// ── Live log viewer ───────────────────────────────────────────────────────────
const PM2_LOG_FILE = process.env.PM2_LOG_FILE ||
  `/opt/scalereach/logs/worker-out.log`;
const PM2_ERR_FILE = process.env.PM2_ERR_FILE ||
  `/opt/scalereach/logs/worker-error.log`;

function logViewerPage(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScaleReach Worker — Live Logs</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;flex-direction:column;height:100vh;overflow:hidden}
    .topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#111;border-bottom:1px solid #222;flex-shrink:0}
    .topbar-left{display:flex;align-items:center;gap:16px}
    .logo{font-size:11px;color:#555;letter-spacing:.1em;text-transform:uppercase}
    h1{font-size:15px;font-weight:600;color:#e5e5e5}
    .badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 10px;border-radius:20px;background:#1a2a1a;color:#4ade80;border:1px solid #2a4a2a}
    .badge.err{background:#2a1a1a;color:#f87171;border-color:#4a2a2a}
    .badge.disconnected{background:#2a2a1a;color:#facc15;border-color:#4a4a1a}
    .dot{width:7px;height:7px;border-radius:50%;background:currentColor;animation:pulse 1.5s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .controls{display:flex;align-items:center;gap:10px}
    .btn{padding:6px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #333;background:#1a1a1a;color:#aaa;transition:all .15s}
    .btn:hover{background:#222;color:#e5e5e5;border-color:#444}
    .btn.active{background:#1a2a1a;color:#4ade80;border-color:#2a4a2a}
    .btn.danger{background:#2a1a1a;color:#f87171;border-color:#4a2a2a}
    select{padding:5px 10px;border-radius:6px;font-size:12px;background:#1a1a1a;color:#aaa;border:1px solid #333;cursor:pointer;outline:none}
    select:focus{border-color:#444}
    .log-wrap{flex:1;overflow-y:auto;padding:12px 16px;font-family:'JetBrains Mono','Fira Code','Cascadia Code',monospace;font-size:12.5px;line-height:1.7}
    .log-wrap::-webkit-scrollbar{width:6px}
    .log-wrap::-webkit-scrollbar-track{background:#111}
    .log-wrap::-webkit-scrollbar-thumb{background:#333;border-radius:3px}
    .line{display:flex;gap:10px;padding:1px 0;border-radius:3px}
    .line:hover{background:#141414}
    .ts{color:#444;flex-shrink:0;user-select:none;font-size:11px;padding-top:1px}
    .msg{color:#d4d4d4;word-break:break-all;white-space:pre-wrap}
    .msg.err{color:#f87171}
    .msg.warn{color:#facc15}
    .msg.info{color:#60a5fa}
    .msg.success{color:#4ade80}
    .statusbar{padding:6px 20px;background:#111;border-top:1px solid #1a1a1a;font-size:11px;color:#444;display:flex;gap:16px;flex-shrink:0}
    .empty{color:#333;text-align:center;padding:60px 0;font-size:13px}
    a.back{font-size:12px;color:#555;text-decoration:none}
    a.back:hover{color:#aaa}
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-left">
      <a class="back" href="/health/hevin">← Dashboard</a>
      <div class="logo">ScaleReach · Worker</div>
      <h1>Live Logs</h1>
      <span class="badge" id="status"><span class="dot"></span> Connecting…</span>
    </div>
    <div class="controls">
      <select id="logType" onchange="reconnect()">
        <option value="out">stdout</option>
        <option value="err">stderr</option>
        <option value="both">both</option>
      </select>
      <select id="lineCount" onchange="reconnect()">
        <option value="100">Last 100</option>
        <option value="200">Last 200</option>
        <option value="500">Last 500</option>
      </select>
      <button class="btn active" id="scrollBtn" onclick="toggleScroll()">↓ Auto-scroll</button>
      <button class="btn" onclick="clearLogs()">Clear</button>
      <button class="btn danger" id="pauseBtn" onclick="togglePause()">Pause</button>
    </div>
  </div>
  <div class="log-wrap" id="logWrap">
    <div class="empty" id="empty">Waiting for logs…</div>
  </div>
  <div class="statusbar">
    <span id="lineCounter">0 lines</span>
    <span id="byteCounter">0 bytes</span>
    <span id="lastTs">—</span>
  </div>

  <script>
    let es = null, paused = false, autoScroll = true, lineCount = 0, byteCount = 0;
    const wrap = document.getElementById('logWrap');
    const empty = document.getElementById('empty');
    const statusEl = document.getElementById('status');
    const lineCounter = document.getElementById('lineCounter');
    const byteCounter = document.getElementById('byteCounter');
    const lastTs = document.getElementById('lastTs');

    function colorClass(msg) {
      if (/error|err:|failed|exception|fatal/i.test(msg)) return 'err';
      if (/warn|warning/i.test(msg)) return 'warn';
      if (/✓|success|done|complete|started|running|healthy/i.test(msg)) return 'success';
      if (/\\[info\\]|info:/i.test(msg)) return 'info';
      return '';
    }

    function addLine(text, isErr) {
      if (paused) return;
      empty.style.display = 'none';
      const now = new Date();
      const ts = now.toTimeString().slice(0,8);
      const div = document.createElement('div');
      div.className = 'line';
      const cls = isErr ? 'err' : colorClass(text);
      div.innerHTML = '<span class="ts">' + ts + '</span><span class="msg ' + cls + '">' + escHtml(text) + '</span>';
      wrap.appendChild(div);
      lineCount++;
      byteCount += text.length;
      lineCounter.textContent = lineCount + ' lines';
      byteCounter.textContent = (byteCount / 1024).toFixed(1) + ' KB';
      lastTs.textContent = 'Last: ' + now.toLocaleTimeString();
      if (autoScroll) wrap.scrollTop = wrap.scrollHeight;
      // Keep max 2000 lines in DOM
      const lines = wrap.querySelectorAll('.line');
      if (lines.length > 2000) lines[0].remove();
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function setStatus(text, cls) {
      statusEl.className = 'badge ' + (cls || '');
      statusEl.innerHTML = '<span class="dot"></span> ' + text;
    }

    function connect() {
      if (es) es.close();
      const type = document.getElementById('logType').value;
      const lines = document.getElementById('lineCount').value;
      es = new EventSource('/health/hevin/logs/stream?type=' + type + '&lines=' + lines);
      setStatus('Connecting…', '');
      es.onopen = () => setStatus('Live', '');
      es.onmessage = (e) => {
        const d = JSON.parse(e.data);
        addLine(d.line, d.err);
      };
      es.onerror = () => {
        setStatus('Disconnected — retrying…', 'disconnected');
        setTimeout(connect, 3000);
      };
    }

    function reconnect() { lineCount = 0; byteCount = 0; wrap.querySelectorAll('.line').forEach(e=>e.remove()); empty.style.display=''; connect(); }
    function clearLogs() { wrap.querySelectorAll('.line').forEach(e=>e.remove()); lineCount=0; byteCount=0; empty.style.display=''; lineCounter.textContent='0 lines'; byteCounter.textContent='0 bytes'; }
    function toggleScroll() { autoScroll=!autoScroll; document.getElementById('scrollBtn').className='btn'+(autoScroll?' active':''); }
    function togglePause() { paused=!paused; document.getElementById('pauseBtn').textContent=paused?'Resume':'Pause'; document.getElementById('pauseBtn').className='btn danger'+(paused?' active':''); }

    connect();
  </script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html", "X-Frame-Options": "DENY", "Cache-Control": "no-store" },
  });
}

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

console.log("[WORKER] Starting smart crop worker...");
const smartCropWorker = startSmartCropWorker(SMART_CROP_WORKER_CONCURRENCY);

console.log("[WORKER] Starting storage cleanup job...");
startStorageCleanupJob();

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

async function getGitInfo() {
  try {
    const { execSync } = await import("child_process");
    const commit = execSync("git rev-parse HEAD", { cwd: "/opt/scalereach" }).toString().trim();
    const shortCommit = execSync("git rev-parse --short HEAD", { cwd: "/opt/scalereach" }).toString().trim();
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: "/opt/scalereach" }).toString().trim();
    const message = execSync("git log -1 --pretty=%s", { cwd: "/opt/scalereach" }).toString().trim();
    const author = execSync("git log -1 --pretty=%an", { cwd: "/opt/scalereach" }).toString().trim();
    const date = execSync("git log -1 --pretty=%ci", { cwd: "/opt/scalereach" }).toString().trim();
    return { commit, short: shortCommit, branch, message, author, date };
  } catch {
    return { error: "git info unavailable" };
  }
}

async function getQueueStats() {
  try {
    const [vW, vA, vC, vF] = await Promise.all([videoProcessingQueue.getWaitingCount(), videoProcessingQueue.getActiveCount(), videoProcessingQueue.getCompletedCount(), videoProcessingQueue.getFailedCount()]);
    const [cW, cA, cC, cF] = await Promise.all([clipGenerationQueue.getWaitingCount(), clipGenerationQueue.getActiveCount(), clipGenerationQueue.getCompletedCount(), clipGenerationQueue.getFailedCount()]);
    const [tW, tA, tC, tF] = await Promise.all([translationQueue.getWaitingCount(), translationQueue.getActiveCount(), translationQueue.getCompletedCount(), translationQueue.getFailedCount()]);
    const [dW, dA, dC, dF] = await Promise.all([dubbingQueue.getWaitingCount(), dubbingQueue.getActiveCount(), dubbingQueue.getCompletedCount(), dubbingQueue.getFailedCount()]);
    const [sW, sA, sC, sF] = await Promise.all([socialPostingQueue.getWaitingCount(), socialPostingQueue.getActiveCount(), socialPostingQueue.getCompletedCount(), socialPostingQueue.getFailedCount()]);
    const [scW, scA, scC, scF] = await Promise.all([smartCropQueue.getWaitingCount(), smartCropQueue.getActiveCount(), smartCropQueue.getCompletedCount(), smartCropQueue.getFailedCount()]);
    return {
      videoProcessing: { waiting: vW, active: vA, completed: vC, failed: vF },
      clipGeneration: { waiting: cW, active: cA, completed: cC, failed: cF },
      translation: { waiting: tW, active: tA, completed: tC, failed: tF },
      dubbing: { waiting: dW, active: dA, completed: dC, failed: dF },
      socialPosting: { waiting: sW, active: sA, completed: sC, failed: sF },
      smartCrop: { waiting: scW, active: scA, completed: scC, failed: scF },
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
            smartCropWorker: { running: smartCropWorker.isRunning(), concurrency: SMART_CROP_WORKER_CONCURRENCY },
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
          git: await getGitInfo(),
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
          git: await getGitInfo(),
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

      // ── PUBLIC: validate YouTube URL (proxied from API) ──
      if (url.pathname === "/validate-youtube" && req.method === "GET") {
        const ytUrl = url.searchParams.get("url");
        if (!ytUrl) {
          return new Response(JSON.stringify({ valid: false, error: "URL is required" }), { status: 400, headers: SECURITY_HEADERS });
        }
        try {
          const { YouTubeService } = await import("./services/youtube.service");
          const isValid = YouTubeService.isValidYouTubeUrl(ytUrl);
          if (!isValid) {
            return new Response(JSON.stringify({ valid: false, error: "Invalid YouTube URL format" }), { status: 200, headers: SECURITY_HEADERS });
          }
          const videoInfo = await YouTubeService.getVideoInfo(ytUrl);
          const durationValidation = YouTubeService.validateVideoDuration(videoInfo.duration);
          if (!durationValidation.valid) {
            return new Response(JSON.stringify({ valid: false, error: durationValidation.error, videoInfo }), { status: 200, headers: SECURITY_HEADERS });
          }
          return new Response(JSON.stringify({ valid: true, videoInfo }), { status: 200, headers: SECURITY_HEADERS });
        } catch (error: any) {
          const msg = error?.message || "Unknown error";
          console.error("[WORKER] validate-youtube error:", msg);
          return new Response(JSON.stringify({ valid: false, error: msg }), { status: 200, headers: SECURITY_HEADERS });
        }
      }

      // ── PROTECTED: live log viewer ────────────────────────
      if (url.pathname === "/health/hevin/logs") {
        if (!isAuthorized(req)) {
          const accept = req.headers.get("accept") || "";
          if (accept.includes("text/html")) return new Response(null, { status: 302, headers: { Location: "/auth/login" } });
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }
        return logViewerPage();
      }

      // ── PROTECTED: live log SSE stream ────────────────────
      if (url.pathname === "/health/hevin/logs/stream") {
        if (!isAuthorized(req)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }

        const logType = url.searchParams.get("type") || "both";
        const tailLines = Math.min(parseInt(url.searchParams.get("lines") || "100", 10), 500);

        const { ReadableStream } = globalThis;

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          start(controller) {
            const send = (line: string, isErr: boolean) => {
              try {
                const data = `data: ${JSON.stringify({ line, err: isErr })}\n\n`;
                controller.enqueue(encoder.encode(data));
              } catch { /* client disconnected */ }
            };

            const sendEvent = (event: string, data: string) => {
              try {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
              } catch { /* client disconnected */ }
            };

            // Send history first
            const historyLines: { line: string; err: boolean }[] = [];
            const filesToTail: { path: string; isErr: boolean }[] = [];

            if ((logType === "out" || logType === "both") && fsExists(PM2_LOG_FILE)) {
              filesToTail.push({ path: PM2_LOG_FILE, isErr: false });
            }
            if ((logType === "err" || logType === "both") && fsExists(PM2_ERR_FILE)) {
              filesToTail.push({ path: PM2_ERR_FILE, isErr: true });
            }

            // Send last N lines as history — individual data messages so onmessage fires reliably
            for (const { path, isErr } of filesToTail) {
              try {
                const out = execSyncNode(`tail -${tailLines} "${path}"`, { encoding: "utf8", maxBuffer: 1024 * 1024 });
                out.split("\n").filter(Boolean).forEach((l: string) => historyLines.push({ line: l, err: isErr }));
              } catch { /* file may not exist yet */ }
            }
            // Send each history line as a normal data message (not custom event)
            for (const { line, err } of historyLines) {
              send(line, err);
            }

            // Now tail -f for live updates
            const tailArgs = ["-f", "-n", "0"];
            for (const { path } of filesToTail) tailArgs.push(path);

            if (filesToTail.length === 0) {
              send("[No log files found yet — waiting for worker activity]", false);
              return;
            }

            const tail = spawnProc("tail", tailArgs, { stdio: ["ignore", "pipe", "ignore"] });

            // Track which file each line comes from when tailing both
            // (tail -f prefixes with "==> filename <==" when multiple files)
            let currentIsErr = logType === "err";
            let buf = "";

            tail.stdout?.on("data", (chunk: Buffer) => {
              buf += chunk.toString();
              const lines = buf.split("\n");
              buf = lines.pop() ?? "";
              for (const line of lines) {
                if (!line) continue;
                // tail -f header when watching multiple files
                if (line.startsWith("==>") && line.endsWith("<==")) {
                  currentIsErr = line.includes("error");
                  continue;
                }
                send(line, logType === "both" ? currentIsErr : logType === "err");
              }
            });

            tail.on("exit", () => {
              try { controller.close(); } catch { /* already closed */ }
            });

            // Clean up when client disconnects
            req.signal?.addEventListener("abort", () => {
              tail.kill();
              try { controller.close(); } catch { /* already closed */ }
            });
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
          },
        });
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
  await Promise.all([videoWorker.close(), clipWorker.close(), translationWorker.close(), dubbingWorker.close(), socialWorker.close(), smartCropWorker.close()]);
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[WORKER] Received SIGINT, shutting down gracefully...");
  healthServer?.stop();
  stopPotServer();
  await Promise.all([videoWorker.close(), clipWorker.close(), translationWorker.close(), dubbingWorker.close(), socialWorker.close(), smartCropWorker.close()]);
  process.exit(0);
});

console.log("[WORKER] Workers are running and waiting for jobs...");
