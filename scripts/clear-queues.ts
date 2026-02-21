/**
 * Script to clear video and clip queues + database records
 * Usage: npx tsx scripts/clear-queues.ts [--video] [--clip] [--all] [--db]
 * 
 * Options:
 *   --video  Clear video processing queue
 *   --clip   Clear clip generation queue
 *   --all    Clear both queues (default if no options)
 *   --db     Also delete database records (videos, clips, exports)
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_TLS = process.env.REDIS_TLS === "true" || REDIS_HOST?.includes("upstash.io");

let redisConfig: any = { maxRetriesPerRequest: null };

if (!REDIS_URL) {
  redisConfig = { ...redisConfig, host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD };
}

if (REDIS_TLS) {
  redisConfig.tls = {};
}

function createConnection() {
  return REDIS_URL ? new IORedis(REDIS_URL, redisConfig) : new IORedis(redisConfig);
}

async function clearQueue(queueName: string) {
  const queue = new Queue(queueName, { connection: createConnection() });
  
  console.log(`\nClearing queue: ${queueName}...`);
  
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const delayed = await queue.getDelayedCount();
  const failed = await queue.getFailedCount();
  
  console.log(`  Before: waiting=${waiting}, active=${active}, delayed=${delayed}, failed=${failed}`);
  
  await queue.obliterate({ force: true });
  
  console.log(`  ✓ ${queueName} cleared`);
  await queue.close();
}

async function clearDatabase() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("  ✗ DATABASE_URL not set, skipping database cleanup");
    return;
  }

  console.log("\nClearing database records...");
  
  const client = postgres(DATABASE_URL);
  const db = drizzle(client);

  // Delete in order due to foreign key constraints
  // video_export -> viral_clip -> video
  
  const exportResult = await db.execute(sql`DELETE FROM video_export`);
  console.log(`  ✓ Deleted video_export records`);

  const clipResult = await db.execute(sql`DELETE FROM viral_clip`);
  console.log(`  ✓ Deleted viral_clip records`);

  const videoResult = await db.execute(sql`DELETE FROM video`);
  console.log(`  ✓ Deleted video records`);

  await client.end();
  console.log("  ✓ Database cleanup complete");
}

async function main() {
  const args = process.argv.slice(2);
  const clearVideo = args.includes("--video") || args.includes("--all") || (!args.includes("--clip") && !args.includes("--db"));
  const clearClip = args.includes("--clip") || args.includes("--all") || (!args.includes("--video") && !args.includes("--db"));
  const clearDb = args.includes("--db");

  console.log("Queue & Data Cleaner");
  console.log("====================");

  if (clearVideo) {
    await clearQueue("video-processing");
  }

  if (clearClip) {
    await clearQueue("clip-generation");
  }

  if (clearDb) {
    await clearDatabase();
  }

  console.log("\n✓ Done!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
