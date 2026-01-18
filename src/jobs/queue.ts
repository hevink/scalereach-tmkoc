import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export const redisConnection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

redisConnection.on("connect", () => {
  console.log("[REDIS] Connected to Redis");
});

redisConnection.on("error", (err) => {
  console.error("[REDIS] Connection error:", err.message);
});

export const QUEUE_NAMES = {
  VIDEO_PROCESSING: "video-processing",
} as const;

export interface VideoProcessingJobData {
  videoId: string;
  projectId: string | null;
  userId: string;
  sourceType: "youtube" | "upload";
  sourceUrl: string;
}

export const videoProcessingQueue = new Queue<VideoProcessingJobData>(
  QUEUE_NAMES.VIDEO_PROCESSING,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        count: 100,
        age: 24 * 60 * 60,
      },
      removeOnFail: {
        count: 50,
        age: 7 * 24 * 60 * 60,
      },
    },
  }
);

export async function addVideoProcessingJob(data: VideoProcessingJobData) {
  console.log(`[QUEUE] Adding video processing job for video: ${data.videoId}`);

  const job = await videoProcessingQueue.add("process-video", data, {
    jobId: `video-${data.videoId}`,
  });

  console.log(`[QUEUE] Job added with ID: ${job.id}`);
  return job;
}

export async function getJobStatus(jobId: string) {
  const job = await videoProcessingQueue.getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };
}

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  concurrency: number = 2
) {
  const worker = new Worker<T>(queueName, processor, {
    connection: redisConnection,
    concurrency,
  });

  worker.on("completed", (job) => {
    console.log(`[WORKER] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[WORKER] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error(`[WORKER] Worker error:`, err.message);
  });

  return worker;
}
