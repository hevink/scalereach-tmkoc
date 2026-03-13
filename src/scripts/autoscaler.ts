/**
 * Autoscaler — runs on the BASE instance via PM2
 *
 * Checks BullMQ clip-generation queue depth every 60s.
 * If waiting+active >= SCALE_UP_THRESHOLD → starts burst EC2 instance.
 * If queue empty for SCALE_DOWN_IDLE_MS → stops burst EC2 instance.
 */

import { Queue } from "bullmq";
import {
  EC2Client,
  StartInstancesCommand,
  StopInstancesCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";

// ── Config ──────────────────────────────────────────────────
const BURST_INSTANCE_ID = process.env.BURST_INSTANCE_ID;
const SCALE_UP_THRESHOLD = parseInt(process.env.SCALE_UP_THRESHOLD || "3", 10);
const SCALE_DOWN_IDLE_MS = parseInt(process.env.SCALE_DOWN_IDLE_MS || "600000", 10); // 10 min
const CHECK_INTERVAL_MS = parseInt(process.env.SCALER_CHECK_INTERVAL_MS || "60000", 10); // 60s
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Redis — reuse the same env vars as the worker
const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Queue prefix (matches queue.ts)
const QUEUE_PREFIX = process.env.QUEUE_PREFIX ? `${process.env.QUEUE_PREFIX}-` : "";
const CLIP_QUEUE_NAME = `${QUEUE_PREFIX}clip-generation`;

// Telegram notifications (optional)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BURST_INSTANCE_ID) {
  console.error("[SCALER] BURST_INSTANCE_ID is required");
  process.exit(1);
}

// ── Redis connection for BullMQ Queue ───────────────────────
import IORedis from "ioredis";

const redisConfig: any = { maxRetriesPerRequest: null };
if (!REDIS_URL) {
  redisConfig.host = REDIS_HOST;
  redisConfig.port = REDIS_PORT;
  redisConfig.password = REDIS_PASSWORD;
}

const redis = REDIS_URL
  ? new IORedis(REDIS_URL, redisConfig)
  : new IORedis(redisConfig);

const clipQueue = new Queue(CLIP_QUEUE_NAME, { connection: redis });
const ec2 = new EC2Client({ region: AWS_REGION });

// ── State ───────────────────────────────────────────────────
let lastActiveTime = Date.now();
let lastKnownState: string = "unknown";

// ── Telegram helper ─────────────────────────────────────────
async function notify(text: string) {
  console.log(`[SCALER] ${text}`);
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `⚡ <b>Autoscaler</b>\n\n${text}`,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.error("[SCALER] Telegram notify failed:", err);
  }
}

// ── EC2 helpers ─────────────────────────────────────────────
async function getBurstState(): Promise<string> {
  try {
    const res = await ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [BURST_INSTANCE_ID!] })
    );
    const state = res.Reservations?.[0]?.Instances?.[0]?.State?.Name || "unknown";
    lastKnownState = state;
    return state;
  } catch (err) {
    console.error("[SCALER] Failed to describe burst instance:", err);
    return lastKnownState;
  }
}

async function startBurst(queueDepth: number) {
  const state = await getBurstState();
  if (state === "running" || state === "pending") {
    console.log(`[SCALER] Burst already ${state}, skipping start`);
    return;
  }
  await notify(`🚀 Starting burst instance\n<b>Queue depth:</b> ${queueDepth}\n<b>Instance:</b> <code>${BURST_INSTANCE_ID}</code>`);
  await ec2.send(new StartInstancesCommand({ InstanceIds: [BURST_INSTANCE_ID!] }));
}

async function stopBurst() {
  const state = await getBurstState();
  if (state === "stopped" || state === "stopping") {
    console.log(`[SCALER] Burst already ${state}, skipping stop`);
    return;
  }
  await notify(`💤 Stopping burst instance — queue empty for ${Math.round(SCALE_DOWN_IDLE_MS / 60000)}min\n<b>Instance:</b> <code>${BURST_INSTANCE_ID}</code>`);
  await ec2.send(new StopInstancesCommand({ InstanceIds: [BURST_INSTANCE_ID!] }));
}

// ── Main check loop ─────────────────────────────────────────
async function check() {
  try {
    const [waiting, active, delayed] = await Promise.all([
      clipQueue.getWaitingCount(),
      clipQueue.getActiveCount(),
      clipQueue.getDelayedCount(),
    ]);
    const total = waiting + active;
    const burstState = await getBurstState();

    console.log(
      `[SCALER] Queue: waiting=${waiting} active=${active} delayed=${delayed} total=${total} | Burst: ${burstState}`
    );

    if (total >= SCALE_UP_THRESHOLD) {
      lastActiveTime = Date.now();
      await startBurst(total);
    } else if (total === 0 && Date.now() - lastActiveTime > SCALE_DOWN_IDLE_MS) {
      await stopBurst();
      // Reset so we don't keep firing stop every check cycle
      lastActiveTime = Date.now();
    } else if (total > 0) {
      // Queue has jobs but below threshold — keep tracking activity
      lastActiveTime = Date.now();
    }
  } catch (err) {
    console.error("[SCALER] Check failed:", err);
  }
}

// ── Start ───────────────────────────────────────────────────
console.log(`[SCALER] Starting autoscaler`);
console.log(`[SCALER] Burst instance: ${BURST_INSTANCE_ID}`);
console.log(`[SCALER] Scale-up threshold: ${SCALE_UP_THRESHOLD} jobs`);
console.log(`[SCALER] Scale-down idle: ${SCALE_DOWN_IDLE_MS / 60000} min`);
console.log(`[SCALER] Check interval: ${CHECK_INTERVAL_MS / 1000}s`);

// Initial check
check();

// Periodic check
setInterval(check, CHECK_INTERVAL_MS);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[SCALER] SIGTERM received, shutting down...");
  await redis.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[SCALER] SIGINT received, shutting down...");
  await redis.quit();
  process.exit(0);
});
