/**
 * List all jobs in video and clip queues
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_TLS = process.env.REDIS_TLS === "true" || REDIS_HOST?.includes("upstash.io");

let redisConfig: any = { maxRetriesPerRequest: null };
if (!REDIS_URL) {
  redisConfig = { ...redisConfig, host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD };
}
if (REDIS_TLS) redisConfig.tls = {};

function createConnection() {
  return REDIS_URL ? new IORedis(REDIS_URL, redisConfig) : new IORedis(redisConfig);
}

async function listJobs(queueName: string) {
  const queue = new Queue(queueName, { connection: createConnection() });
  
  console.log(`\n=== ${queueName.toUpperCase()} ===`);
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getCompleted(0, 10),
    queue.getFailed(0, 10),
    queue.getDelayed(),
  ]);

  console.log(`Waiting: ${waiting.length}, Active: ${active.length}, Delayed: ${delayed.length}`);
  console.log(`Completed: ${completed.length}, Failed: ${failed.length}`);

  if (waiting.length > 0) {
    console.log("\n📋 Waiting:");
    waiting.forEach(j => console.log(`  - ${j.id} | ${j.name}`));
  }

  if (active.length > 0) {
    console.log("\n🔄 Active:");
    active.forEach(j => console.log(`  - ${j.id} | ${j.name} | progress: ${j.progress}%`));
  }

  if (delayed.length > 0) {
    console.log("\n⏳ Delayed:");
    delayed.forEach(j => console.log(`  - ${j.id} | ${j.name}`));
  }

  if (failed.length > 0) {
    console.log("\n❌ Failed (last 10):");
    failed.forEach(j => console.log(`  - ${j.id} | ${j.failedReason?.slice(0, 80)}...`));
  }

  if (completed.length > 0) {
    console.log("\n✅ Completed (last 10):");
    completed.forEach(j => console.log(`  - ${j.id}`));
  }

  await queue.close();
}

async function main() {
  await listJobs("video-processing");
  await listJobs("clip-generation");
  console.log("\n");
  process.exit(0);
}

main().catch(console.error);
