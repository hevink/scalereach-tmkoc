// Worker v1.4.0 - dashboard & logs moved to admin panel
// Initialize Sentry first (must be at the very top)
import "./lib/sentry";

import { spawn as spawnProc, execSync as execSyncNode } from "child_process";
import { existsSync as fsExists } from "fs";

import { startPotServer, stopPotServer } from "./lib/pot-server";
import { startVideoWorker } from "./jobs/video.worker";
import { startClipWorker } from "./jobs/clip.worker";
import { cleanupOrphanedTempFiles } from "./utils/temp-cleanup";
import { startTranslationWorker, translationQueue } from "./jobs/translation.worker";
import { startDubbingWorker, dubbingQueue } from "./jobs/dubbing.worker";
import { startSocialWorker } from "./jobs/social.worker";
import { startStorageCleanupJob } from "./jobs/storage-cleanup.job";
import { startCreditExpiryJob } from "./jobs/credit-expiry.job";
import { redisConnection, videoProcessingQueue, clipGenerationQueue, socialPostingQueue } from "./jobs/queue";

const VIDEO_WORKER_CONCURRENCY = parseInt(process.env.VIDEO_WORKER_CONCURRENCY || "2", 10);
const CLIP_WORKER_CONCURRENCY = parseInt(process.env.CLIP_WORKER_CONCURRENCY || "1", 10);
const WORKER_HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || "3002", 10);
const DUBBING_WORKER_CONCURRENCY = parseInt(process.env.DUBBING_WORKER_CONCURRENCY || "1", 10);
const SESSION_SECRET = process.env.WORKER_SECRET || "dev-secret-change-me";

function isAuthorized(req: Request): boolean {
  // Allow via Bearer token / header for API access
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


const startTime = Date.now();

const PM2_LOG_FILE = process.env.PM2_LOG_FILE ||
  `/opt/scalereach/logs/worker-out.log`;
const PM2_ERR_FILE = process.env.PM2_ERR_FILE ||
  `/opt/scalereach/logs/worker-error.log`;

type WorkerLogType = "out" | "err" | "both";

function getWorkerLogFiles(logType: WorkerLogType) {
  const files: { path: string; isErr: boolean; label: string }[] = [];

  if ((logType === "out" || logType === "both") && fsExists(PM2_LOG_FILE)) {
    files.push({ path: PM2_LOG_FILE, isErr: false, label: "stdout" });
  }
  if ((logType === "err" || logType === "both") && fsExists(PM2_ERR_FILE)) {
    files.push({ path: PM2_ERR_FILE, isErr: true, label: "stderr" });
  }

  return files;
}

function readWorkerLogTail(logType: WorkerLogType, tailLines: number): string {
  const filesToTail = getWorkerLogFiles(logType);
  if (filesToTail.length === 0) return "";

  return filesToTail.map(({ path, label }) => {
    try {
      const content = execSyncNode(`tail -${tailLines} "${path}"`, {
        encoding: "utf8",
        maxBuffer: 5 * 1024 * 1024,
      }).trimEnd();

      if (!content) return "";
      if (filesToTail.length === 1) return content;
      return `==> ${label} <==\n${content}`;
    } catch {
      return "";
    }
  }).filter(Boolean).join("\n\n");
}

startPotServer();

// Clean up orphaned temp files from previous crashed runs
cleanupOrphanedTempFiles().catch(() => {});

console.log("[WORKER] Starting video processing worker...");
const videoWorker = startVideoWorker(VIDEO_WORKER_CONCURRENCY);

console.log("[WORKER] Starting clip generation worker...");
const clipWorker = CLIP_WORKER_CONCURRENCY > 0 ? startClipWorker(CLIP_WORKER_CONCURRENCY) : null;
if (!clipWorker) console.log("[WORKER] Clip worker disabled (concurrency=0), clips handled by burst instance");

console.log("[WORKER] Starting translation worker...");
const translationWorker = startTranslationWorker();

console.log("[WORKER] Starting dubbing worker...");
const dubbingWorker = startDubbingWorker(DUBBING_WORKER_CONCURRENCY);

console.log("[WORKER] Starting social posting worker...");
const socialWorker = startSocialWorker();

console.log("[WORKER] Starting storage cleanup job...");
startStorageCleanupJob();

console.log("[WORKER] Starting credit expiry job...");
startCreditExpiryJob();



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
    const [cW, cA, cC, cF, cP] = await Promise.all([
      clipGenerationQueue.getWaitingCount(), clipGenerationQueue.getActiveCount(),
      clipGenerationQueue.getCompletedCount(), clipGenerationQueue.getFailedCount(),
      // BullMQ stores priority jobs in a separate sorted set, not in the wait list.
      // getWaitingCount() misses them entirely, so we count them via Redis directly.
      redisConnection.zcard(`bull:${clipGenerationQueue.name}:prioritized`).catch(() => 0),
    ]);
    const [tW, tA, tC, tF] = await Promise.all([translationQueue.getWaitingCount(), translationQueue.getActiveCount(), translationQueue.getCompletedCount(), translationQueue.getFailedCount()]);
    const [dW, dA, dC, dF] = await Promise.all([dubbingQueue.getWaitingCount(), dubbingQueue.getActiveCount(), dubbingQueue.getCompletedCount(), dubbingQueue.getFailedCount()]);
    const [sW, sA, sC, sF] = await Promise.all([socialPostingQueue.getWaitingCount(), socialPostingQueue.getActiveCount(), socialPostingQueue.getCompletedCount(), socialPostingQueue.getFailedCount()]);
    return {
      videoProcessing: { waiting: vW, active: vA, completed: vC, failed: vF },
      clipGeneration: { waiting: cW + cP, active: cA, completed: cC, failed: cF },
      translation: { waiting: tW, active: tA, completed: tC, failed: tF },
      dubbing: { waiting: dW, active: dA, completed: dC, failed: dF },
      socialPosting: { waiting: sW, active: sA, completed: sC, failed: sF },
    };
  } catch { return null; }
}

function youtubeE2ePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YouTube E2E Test</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;max-width:900px;margin:0 auto}
h1{font-size:1.5rem;margin-bottom:16px;color:#38bdf8}
.form-row{display:flex;gap:8px;margin-bottom:20px}
input[type=text]{flex:1;padding:10px 14px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:14px}
input[type=text]:focus{outline:none;border-color:#38bdf8}
button{padding:10px 20px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;font-size:14px;white-space:nowrap}
button:hover{background:#1d4ed8}
button:disabled{opacity:.5;cursor:not-allowed}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin .6s linear infinite;margin-right:6px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.card{background:#1e293b;border-radius:10px;padding:16px;margin-bottom:12px;border:1px solid #334155}
.card h3{font-size:.9rem;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600}
.badge.ok{background:#065f46;color:#6ee7b7}
.badge.fail{background:#7f1d1d;color:#fca5a5}
.badge.warn{background:#78350f;color:#fcd34d}
.env-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
.env-item{font-size:13px}.env-label{color:#64748b}.env-val{color:#e2e8f0;font-family:monospace}
.step{border-left:3px solid #334155;padding:8px 12px;margin-bottom:8px}
.step.ok{border-color:#22c55e}
.step.fail{border-color:#ef4444}
.step-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.step-name{font-weight:600;font-size:14px}
.step-time{font-size:12px;color:#64748b}
.step-detail{font-size:13px;color:#94a3b8;font-family:monospace;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto}
.error-box{background:#1c1917;border:1px solid #7f1d1d;border-radius:6px;padding:10px;margin-top:6px;color:#fca5a5;font-size:12px;font-family:monospace;white-space:pre-wrap;max-height:400px;overflow-y:auto}
.summary{font-size:1.1rem;font-weight:700;padding:12px;border-radius:8px;text-align:center;margin-bottom:16px}
.summary.ok{background:#065f46;color:#6ee7b7}
.summary.fail{background:#7f1d1d;color:#fca5a5}
#results{display:none}
</style></head><body>
<h1>🎬 YouTube E2E Test</h1>
<p style="color:#64748b;margin-bottom:16px;font-size:14px">Full pipeline test: metadata fetch → 20s clip download → FFmpeg trim. Tests proxy, cookies, POT server.</p>
<div class="form-row">
<input type="text" id="ytUrl" placeholder="https://www.youtube.com/watch?v=..." value="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
<button id="runBtn" onclick="runTest()">▶ Run Test</button>
</div>
<div id="results">
<div id="summaryBox" class="summary"></div>
<div id="envCard" class="card"><h3>Environment</h3><div id="envContent" class="env-grid"></div></div>
<div id="stepsCard" class="card"><h3>Steps</h3><div id="stepsContent"></div></div>
<div id="videoCard" class="card" style="display:none"><h3>Video Info</h3><div id="videoContent" class="step-detail"></div></div>
</div>
<script>
async function runTest(){
  const btn=document.getElementById('runBtn');
  const url=document.getElementById('ytUrl').value.trim();
  if(!url){alert('Enter a YouTube URL');return}
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span>Testing...';
  document.getElementById('results').style.display='block';
  document.getElementById('summaryBox').className='summary';
  document.getElementById('summaryBox').textContent='Running test...';
  document.getElementById('stepsContent').innerHTML='';
  document.getElementById('envContent').innerHTML='';
  document.getElementById('videoCard').style.display='none';
  try{
    const token=new URLSearchParams(location.search).get('token')||'';
    const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'X-Worker-Token':token},body:JSON.stringify({url})});
    const d=await r.json();
    // Environment
    if(d.environment){
      const e=d.environment;
      let h='';
      h+=ei('yt-dlp',e.ytdlpVersion);
      h+=ei('FFmpeg',e.ffmpegVersion);
      h+=ei('Cookies',e.cookieStatus+' ('+e.cookieCount+')');
      h+=ei('POT Server',e.potServer?.status||'n/a');
      h+=ei('Proxy',e.proxy||'none');
      h+=ei('Cookie Path',e.cookiesPath);
      document.getElementById('envContent').innerHTML=h;
    }
    // Steps
    const sc=document.getElementById('stepsContent');
    for(const s of (d.steps||[])){
      const ok=s.ok!==false;
      let det='';
      if(s.resolution)det+='Resolution: '+s.resolution+'\\n';
      if(s.codec)det+='Codec: '+s.codec+'\\n';
      if(s.actualDuration)det+='Duration: '+s.actualDuration+'s\\n';
      if(s.fileSizeMB)det+='File size: '+s.fileSizeMB+' MB\\n';
      if(s.clipStart!==undefined)det+='Clip range: '+s.clipStart+'s - '+s.clipEnd+'s\\n';
      if(s.result)det+=JSON.stringify(s.result,null,2);
      let html='<div class="step '+(ok?'ok':'fail')+'"><div class="step-header"><span class="step-name">'+s.name+' <span class="badge '+(ok?'ok':'fail')+'">'+(ok?'PASS':'FAIL')+'</span></span><span class="step-time">'+(s.elapsedMs?(s.elapsedMs/1000).toFixed(1)+'s':'')+'</span></div>';
      if(det)html+='<div class="step-detail">'+esc(det)+'</div>';
      if(s.error)html+='<div class="error-box">'+esc(s.error)+'</div>';
      html+='</div>';
      sc.innerHTML+=html;
    }
    // Video info
    if(d.videoInfo){
      document.getElementById('videoCard').style.display='block';
      document.getElementById('videoContent').textContent=JSON.stringify(d.videoInfo,null,2);
    }
    // Summary
    const sb=document.getElementById('summaryBox');
    sb.textContent=(d.summary||'Done')+' ('+((d.totalElapsedMs||0)/1000).toFixed(1)+'s)';
    sb.className='summary '+(d.success?'ok':'fail');
  }catch(e){
    document.getElementById('summaryBox').textContent='Request failed: '+e.message;
    document.getElementById('summaryBox').className='summary fail';
  }finally{btn.disabled=false;btn.textContent='▶ Run Test'}
}
function ei(l,v){return '<div class="env-item"><div class="env-label">'+l+'</div><div class="env-val">'+(v||'—')+'</div></div>'}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
</script></body></html>`;
}

let healthServer: ReturnType<typeof Bun.serve> | null = null;
try {
  healthServer = Bun.serve({
    port: WORKER_HEALTH_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // ── PUBLIC: basic health ──────────────────────────────
      if (url.pathname === "/health" || url.pathname === "/") {
        const redisHealth = await checkRedisHealth();
        const isHealthy = redisHealth.status === "healthy" &&
          videoWorker.isRunning() && (clipWorker?.isRunning() ?? true) &&
          translationWorker.isRunning() && dubbingWorker.isRunning();
        return new Response(JSON.stringify({
          status: isHealthy ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
          workers: {
            videoWorker: { running: videoWorker.isRunning(), concurrency: VIDEO_WORKER_CONCURRENCY },
            clipWorker: { running: clipWorker?.isRunning() ?? false, concurrency: CLIP_WORKER_CONCURRENCY },
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
          videoWorker.isRunning() && (clipWorker?.isRunning() ?? true) &&
          translationWorker.isRunning() && dubbingWorker.isRunning() && socialWorker.isRunning();
        return new Response(JSON.stringify({ status: isReady ? "ready" : "not_ready", timestamp: new Date().toISOString() }),
          { status: isReady ? 200 : 503, headers: SECURITY_HEADERS });
      }

      // ── PROTECTED: queue stats ────────────────────────────
      if (url.pathname === "/health/detailed") {
        if (!isAuthorized(req)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }
        const redisHealth = await checkRedisHealth();
        const queueStats = await getQueueStats();
        const isHealthy = redisHealth.status === "healthy" &&
          videoWorker.isRunning() && (clipWorker?.isRunning() ?? true) &&
          translationWorker.isRunning() && dubbingWorker.isRunning();
        return new Response(JSON.stringify({
          status: isHealthy ? "healthy" : "unhealthy",
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
          git: await getGitInfo(),
          workers: {
            videoWorker: { running: videoWorker.isRunning(), concurrency: VIDEO_WORKER_CONCURRENCY },
            clipWorker: { running: clipWorker?.isRunning() ?? false, concurrency: CLIP_WORKER_CONCURRENCY },
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
        return new Response(JSON.stringify({
          timestamp: new Date().toISOString(),
          uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
          git: await getGitInfo(),
          workers: {
            videoWorker: { running: videoWorker.isRunning(), concurrency: VIDEO_WORKER_CONCURRENCY },
            clipWorker: { running: clipWorker?.isRunning() ?? false, concurrency: CLIP_WORKER_CONCURRENCY },
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

      // ── PROTECTED: Environment variables for admin dashboard ──
      if (url.pathname === "/health/hevin/envs") {
        if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401, headers: SECURITY_HEADERS });
        const SENSITIVE_PATTERNS = ["TOKEN", "SECRET", "PASSWORD", "KEY", "DSN", "DATABASE_URL", "REDIS_URL", "PROXY"];
        const IGNORE_PATTERNS = ["axm_", "pm_id", "PM2_", "instances", "vizion", "automation", "autorestart", "autostart", "treekill", "created_at", "restart_time", "unstable_restarts", "version", "node_args", "merge_logs", "exec_mode", "exec_interpreter", "watch", "instance_var", "filter_env", "namespace", "unique_id", "status", "pm_cwd", "pm_exec_path", "NODE_APP_INSTANCE", "windowsHide", "kill_retry_time", "username", "uid", "gid"];
        const envs: Record<string, string | undefined> = {};
        for (const [key, val] of Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b))) {
          if (IGNORE_PATTERNS.some(p => key === p || key.startsWith(p))) continue;
          if (val === undefined) {
            envs[key] = undefined;
          } else if (SENSITIVE_PATTERNS.some(p => key.toUpperCase().includes(p))) {
            envs[key] = val.length > 8 ? val.slice(0, 8) + "***" : "***";
          } else {
            envs[key] = val;
          }
        }
        return new Response(JSON.stringify({ mode: "base", envs }, null, 2), { status: 200, headers: SECURITY_HEADERS });
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

      // ── PROTECTED: YouTube health status (JSON API) ──────
      if (url.pathname === "/health/youtube-status") {
        if (!isAuthorized(req)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }

        const cookiesPath = process.env.YOUTUBE_COOKIES_PATH || "/opt/scalereach/config/youtube_cookies.txt";
        const bgutilBaseUrl = process.env.YT_DLP_GET_POT_BGUTIL_BASE_URL;
        const fsModule = await import("fs");

        // Cookie status
        let cookieStatus: "valid" | "expired" | "missing" | "error" = "missing";
        let cookieExpiry: string | null = null;
        let cookieDaysLeft: number | null = null;
        let cookieCount = 0;

        try {
          if (fsModule.existsSync(cookiesPath)) {
            const content = fsModule.readFileSync(cookiesPath, "utf8");
            const lines = content.split("\n").filter(l => l && !l.startsWith("#"));
            cookieCount = lines.length;
            const authCookies = ["SID", "SSID", "HSID", "SAPISID", "__Secure-1PSID", "__Secure-3PSID"];
            let minExpiry = Infinity;
            for (const line of lines) {
              const parts = line.split("\t");
              if (parts.length >= 6 && authCookies.includes(parts[5])) {
                const exp = parseInt(parts[4], 10);
                if (exp > 0 && exp < minExpiry) minExpiry = exp;
              }
            }
            if (minExpiry !== Infinity) {
              const expiryDate = new Date(minExpiry * 1000);
              const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / 86400000);
              cookieExpiry = expiryDate.toISOString();
              cookieDaysLeft = daysLeft;
              cookieStatus = daysLeft > 0 ? "valid" : "expired";
            } else {
              cookieStatus = "valid";
            }
          }
        } catch { cookieStatus = "error"; }

        // POT server status
        let potStatus: "running" | "stopped" | "not_configured" = "not_configured";
        if (bgutilBaseUrl) {
          try {
            const res = await fetch(bgutilBaseUrl, { signal: AbortSignal.timeout(3000) });
            potStatus = res.ok || res.status < 500 ? "running" : "stopped";
          } catch {
            potStatus = "stopped";
          }
        }

        // yt-dlp version
        let ytdlpVersion = "unknown";
        try {
          const { execSync } = await import("child_process");
          ytdlpVersion = execSync("yt-dlp --version", { timeout: 5000 }).toString().trim();
        } catch {}

        // POST: also run a live test
        if (req.method === "POST") {
          const body = await req.json().catch(() => ({}));
          const testUrl = (body as any).url || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
          const start = Date.now();
          try {
            const { YouTubeService } = await import("./services/youtube.service");
            const videoInfo = await YouTubeService.getVideoInfoYtDlp(testUrl);
            const elapsed = Date.now() - start;
            return new Response(JSON.stringify({
              cookie: { status: cookieStatus, expiry: cookieExpiry, daysLeft: cookieDaysLeft, count: cookieCount, path: cookiesPath },
              pot: { status: potStatus, url: bgutilBaseUrl || null },
              ytdlp: { version: ytdlpVersion },
              test: { ok: true, elapsed_ms: elapsed, videoInfo },
            }), { headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
          } catch (err: any) {
            const elapsed = Date.now() - start;
            return new Response(JSON.stringify({
              cookie: { status: cookieStatus, expiry: cookieExpiry, daysLeft: cookieDaysLeft, count: cookieCount, path: cookiesPath },
              pot: { status: potStatus, url: bgutilBaseUrl || null },
              ytdlp: { version: ytdlpVersion },
              test: { ok: false, elapsed_ms: elapsed, error: err?.message || "Unknown error" },
            }), { headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
          }
        }

        return new Response(JSON.stringify({
          cookie: { status: cookieStatus, expiry: cookieExpiry, daysLeft: cookieDaysLeft, count: cookieCount, path: cookiesPath },
          pot: { status: potStatus, url: bgutilBaseUrl || null },
          ytdlp: { version: ytdlpVersion },
        }), { headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
      }

      // ── PROTECTED: latest log tail snapshot ──────────────
      if (url.pathname === "/health/hevin/logs") {
        if (!isAuthorized(req)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }

        const requestedType = url.searchParams.get("type");
        const logType: WorkerLogType = requestedType === "out" || requestedType === "err" || requestedType === "both"
          ? requestedType
          : "both";
        const tailLines = Math.min(Math.max(parseInt(url.searchParams.get("lines") || "500", 10), 1), 5000);
        const content = readWorkerLogTail(logType, tailLines);

        if (!content) {
          return new Response("No log files found yet", {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        return new Response(content, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
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
            const filesToTail = getWorkerLogFiles(
              logType === "out" || logType === "err" || logType === "both" ? logType : "both"
            );

            // Send last N lines as history - individual data messages so onmessage fires reliably
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
              send("[No log files found yet - waiting for worker activity]", false);
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

      // ── PROTECTED: execute whitelisted commands ────────────
      if (url.pathname === "/health/hevin/exec" && req.method === "POST") {
        if (!isAuthorized(req)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }

        try {
          const body = await req.json() as { command: string };
          const { command } = body;

          // Whitelist of allowed commands for safety
          const ALLOWED_COMMANDS: Record<string, string> = {
            "pm2-status": "pm2 jlist",
            "disk-usage": "df -h",
            "memory": "free -h",
            "top-processes": "ps aux --sort=-%mem | head -20",
            "network-connections": "ss -tuln",
            "docker-ps": "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo 'Docker not available'",
            "gpu-status": "nvidia-smi 2>/dev/null || echo 'No GPU available'",
            "uptime": "uptime",
            "yt-dlp-version": "yt-dlp --version",
            "ffmpeg-version": "ffmpeg -version 2>&1 | head -1",
            "pot-server-check": `curl -s -o /dev/null -w '%{http_code}' ${process.env.BGUTIL_BASE_URL || 'http://localhost:4416'} 2>/dev/null || echo 'unreachable'`,
            "active-downloads": "ps aux | grep -E 'yt-dlp|ffmpeg' | grep -v grep || echo 'No active downloads'",
            "redis-ping": "redis-cli ping 2>/dev/null || echo 'Redis CLI not available'",
            "tail-errors": `tail -30 ${PM2_ERR_FILE} 2>/dev/null || echo 'No error log found'`,
            "tail-output": `tail -30 ${PM2_LOG_FILE} 2>/dev/null || echo 'No output log found'`,
            "git-status": "cd /opt/scalereach && git log --oneline -5 2>/dev/null || echo 'Git not available'",
            "check-ports": "ss -tlnp 2>/dev/null | grep -E ':(3000|4416|6379|8080)' || echo 'No matching ports'",
            "cookie-check": `wc -l ${process.env.COOKIES_PATH || '/opt/scalereach/cookies.txt'} 2>/dev/null || echo 'Cookie file not found'`,
          };

          if (!command || !ALLOWED_COMMANDS[command]) {
            return new Response(JSON.stringify({
              error: "Unknown command",
              available: Object.keys(ALLOWED_COMMANDS),
            }), { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
          }

          const { execSync } = await import("child_process");
          const output = execSync(ALLOWED_COMMANDS[command], {
            encoding: "utf8",
            timeout: 15000,
            maxBuffer: 1024 * 512,
          });

          return new Response(JSON.stringify({ command, output: output.trim() }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({
            error: err?.message || "Command execution failed",
            output: err?.stdout?.toString() || err?.stderr?.toString() || "",
          }), { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
        }
      }

      // ── PROTECTED: drain/clean a queue ──────────────────
      if (url.pathname === "/health/hevin/queue-action" && req.method === "POST") {
        if (!isAuthorized(req)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }

        try {
          const body = await req.json() as { queue: string; action: string };
          const { queue, action } = body;

          const queueMap: Record<string, any> = {
            clipGeneration: clipGenerationQueue,
            videoProcessing: videoProcessingQueue,
            socialPosting: socialPostingQueue,
            translation: translationQueue,
            dubbing: dubbingQueue,
          };

          const targetQueue = queueMap[queue];
          if (!targetQueue) {
            return new Response(JSON.stringify({ error: "Unknown queue", available: Object.keys(queueMap) }), { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
          }

          const validActions = ["drain", "clean-completed", "clean-failed"];
          if (!validActions.includes(action)) {
            return new Response(JSON.stringify({ error: "Unknown action", available: validActions }), { status: 400, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
          }

          let result: any = {};

          if (action === "drain") {
            // Remove all waiting/delayed jobs (drain the queue)
            await targetQueue.drain();
            result = { drained: true };
          } else if (action === "clean-completed") {
            const cleaned = await targetQueue.clean(0, 1000, "completed");
            result = { cleaned: cleaned.length, type: "completed" };
          } else if (action === "clean-failed") {
            const cleaned = await targetQueue.clean(0, 1000, "failed");
            result = { cleaned: cleaned.length, type: "failed" };
          }

          // Return fresh stats
          const [waiting, active, completed, failed] = await Promise.all([
            targetQueue.getWaitingCount(),
            targetQueue.getActiveCount(),
            targetQueue.getCompletedCount(),
            targetQueue.getFailedCount(),
          ]);
          // Also count prioritized jobs for clip queue
          let prioritized = 0;
          try { prioritized = await redisConnection.zcard(`bull:${targetQueue.name}:prioritized`); } catch {}

          return new Response(JSON.stringify({
            success: true,
            action,
            queue,
            result,
            stats: { waiting: waiting + prioritized, active, completed, failed },
          }), { status: 200, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message || "Queue action failed" }), { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } });
        }
      }

      // ── PROTECTED: YouTube E2E test page ──────────────────
      if (url.pathname === "/health/hevin/youtube-e2e") {
        if (!isAuthorized(req)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: SECURITY_HEADERS });
        }

        // GET: serve the HTML test page
        if (req.method === "GET") {
          return new Response(youtubeE2ePageHtml(), {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // POST: run the full E2E test
        if (req.method === "POST") {
          const body = await req.json().catch(() => ({})) as { url?: string };
          const testUrl = body.url?.trim();
          if (!testUrl) {
            return new Response(JSON.stringify({ error: "YouTube URL is required" }), {
              status: 400, headers: { "Content-Type": "application/json" },
            });
          }

          const results: any = { url: testUrl, steps: [], startedAt: new Date().toISOString() };
          const cookiesPath = process.env.YOUTUBE_COOKIES_PATH || "/opt/scalereach/config/youtube_cookies.txt";
          const proxy = process.env.YOUTUBE_PROXY;
          const bgutilBaseUrl = process.env.YT_DLP_GET_POT_BGUTIL_BASE_URL;
          const fsModule = await import("fs");

          // ── Pre-flight checks ──
          let ytdlpVersion = "unknown";
          try {
            ytdlpVersion = execSyncNode("yt-dlp --version", { timeout: 5000 }).toString().trim();
          } catch {}

          let ffmpegVersion = "unknown";
          try {
            ffmpegVersion = execSyncNode("ffmpeg -version 2>&1 | head -1", { timeout: 5000 }).toString().trim();
          } catch {}

          let cookieStatus = "missing";
          let cookieCount = 0;
          try {
            if (fsModule.existsSync(cookiesPath)) {
              const lines = fsModule.readFileSync(cookiesPath, "utf8").split("\n").filter((l: string) => l && !l.startsWith("#"));
              cookieCount = lines.length;
              cookieStatus = cookieCount > 0 ? "present" : "empty";
            }
          } catch { cookieStatus = "error"; }

          let potStatus = "not_configured";
          if (bgutilBaseUrl) {
            try {
              const res = await fetch(bgutilBaseUrl, { signal: AbortSignal.timeout(3000) });
              potStatus = res.ok || res.status < 500 ? "running" : "stopped";
            } catch { potStatus = "stopped"; }
          }

          results.environment = {
            ytdlpVersion, ffmpegVersion, cookieStatus, cookieCount, cookiesPath,
            potServer: { status: potStatus, url: bgutilBaseUrl || null },
            proxy: proxy || null,
          };

          // ── Step 1: Fetch video metadata ──
          const step1: any = { name: "Fetch Video Metadata", startMs: Date.now() };
          try {
            const { YouTubeService } = await import("./services/youtube.service");
            const videoInfo = await YouTubeService.getVideoInfoYtDlp(testUrl);
            step1.elapsedMs = Date.now() - step1.startMs;
            step1.ok = true;
            step1.result = videoInfo;
            results.videoInfo = videoInfo;
          } catch (err: any) {
            step1.elapsedMs = Date.now() - step1.startMs;
            step1.ok = false;
            step1.error = err?.message || String(err);

            // Try with cookies as fallback
            const step1b: any = { name: "Fetch Metadata (web + cookies fallback)", startMs: Date.now() };
            try {
              const { YouTubeService } = await import("./services/youtube.service");
              const videoInfo = await YouTubeService.getVideoInfoYtDlp(testUrl, true);
              step1b.elapsedMs = Date.now() - step1b.startMs;
              step1b.ok = true;
              step1b.result = videoInfo;
              results.videoInfo = videoInfo;
            } catch (err2: any) {
              step1b.elapsedMs = Date.now() - step1b.startMs;
              step1b.ok = false;
              step1b.error = err2?.message || String(err2);
            }
            results.steps.push(step1b);
          }
          results.steps.push(step1);

          // If metadata failed entirely, return early
          if (!results.videoInfo) {
            results.finishedAt = new Date().toISOString();
            results.totalElapsedMs = Date.now() - new Date(results.startedAt).getTime();
            results.success = false;
            results.summary = "Failed at metadata fetch — could not get video info";
            return new Response(JSON.stringify(results, null, 2), {
              status: 200, headers: { "Content-Type": "application/json" },
            });
          }

          // ── Step 2: Download 20s clip ──
          const duration = results.videoInfo.duration || 60;
          const clipStart = Math.min(30, Math.max(0, duration - 25));
          const clipEnd = Math.min(clipStart + 20, duration);
          const tmpDir = process.env.SMART_CROP_TMP_DIR || "/tmp";
          const testOutputPath = `${tmpDir}/yt-e2e-test-${Date.now()}.mp4`;

          const step2: any = { name: "Download 20s Clip", startMs: Date.now(), clipStart, clipEnd, outputPath: testOutputPath };
          try {
            const { ClipGeneratorService } = await import("./services/clip-generator.service");
            await ClipGeneratorService.downloadYouTubeSegmentToLocalFile(testUrl, clipStart, clipEnd, testOutputPath, "1080p");
            step2.elapsedMs = Date.now() - step2.startMs;
            step2.ok = true;

            // Get file info
            try {
              const stat = fsModule.statSync(testOutputPath);
              step2.fileSizeMB = (stat.size / 1024 / 1024).toFixed(2);
            } catch {}

            // Probe the downloaded file for resolution/duration
            try {
              const probeOut = execSyncNode(
                `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name -show_entries format=duration -of json "${testOutputPath}"`,
                { timeout: 10000 }
              ).toString();
              const probeData = JSON.parse(probeOut);
              const stream = probeData.streams?.[0];
              step2.resolution = stream ? `${stream.width}x${stream.height}` : "unknown";
              step2.codec = stream?.codec_name || "unknown";
              step2.actualDuration = parseFloat(probeData.format?.duration || "0").toFixed(1);
            } catch {}
          } catch (err: any) {
            step2.elapsedMs = Date.now() - step2.startMs;
            step2.ok = false;
            step2.error = err?.message || String(err);
          }
          results.steps.push(step2);

          // ── Cleanup test file ──
          try { fsModule.unlinkSync(testOutputPath); } catch {}
          // Also clean up any -full.mp4 leftover from proxy path
          try { fsModule.unlinkSync(testOutputPath.replace(".mp4", "-full.mp4")); } catch {}

          results.finishedAt = new Date().toISOString();
          results.totalElapsedMs = Date.now() - new Date(results.startedAt).getTime();
          results.success = results.steps.every((s: any) => s.ok !== false);
          results.summary = results.success
            ? `All steps passed in ${(results.totalElapsedMs / 1000).toFixed(1)}s`
            : `Failed: ${results.steps.filter((s: any) => s.ok === false).map((s: any) => s.name).join(", ")}`;

          return new Response(JSON.stringify(results, null, 2), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
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
  await Promise.all([videoWorker.close(), clipWorker?.close(), translationWorker.close(), dubbingWorker.close(), socialWorker.close()].filter(Boolean));
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[WORKER] Received SIGINT, shutting down gracefully...");
  healthServer?.stop();
  stopPotServer();
  await Promise.all([videoWorker.close(), clipWorker?.close(), translationWorker.close(), dubbingWorker.close(), socialWorker.close()].filter(Boolean));
  process.exit(0);
});

console.log("[WORKER] Workers are running and waiting for jobs...");
