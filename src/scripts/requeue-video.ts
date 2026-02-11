import "dotenv/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const videoId = process.argv[2];
if (!videoId) { console.error("Usage: bun run src/scripts/requeue-video.ts <videoId>"); process.exit(1); }

const REDIS_URL = process.env.REDIS_URL;
const conn = () => REDIS_URL ? new IORedis(REDIS_URL, { maxRetriesPerRequest: null }) : new IORedis({ maxRetriesPerRequest: null });

async function main() {
  const queue = new Queue("video-processing", { connection: conn() });
  const existing = await queue.getJob(`video-${videoId}`);
  if (existing) { await existing.remove(); console.log("Removed old job"); }

  const job = await queue.add("process-video", {
    videoId,
    projectId: null,
    userId: "PKwPme76C1vxTLnKYpZEnlb9IPTi1mYw",
    sourceType: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=jaRfBM7ESfc",
  }, { jobId: `video-${videoId}` });

  console.log(`✅ Re-queued ${videoId} as ${job.id}`);
  await new Promise(r => setTimeout(r, 3000));
  console.log(`State: ${await job.getState()}`);
  await queue.close();
  process.exit(0);
}
main();
