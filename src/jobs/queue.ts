import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Create Redis connection config for BullMQ
const redisConfig = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

export const redisConnection = new IORedis(redisConfig);

redisConnection.on("connect", () => {
  console.log("[REDIS] Connected to Redis");
});

redisConnection.on("error", (err) => {
  console.error("[REDIS] Connection error:", err.message);
});

export const QUEUE_NAMES = {
  VIDEO_PROCESSING: "video-processing",
  CLIP_GENERATION: "clip-generation",
} as const;

export interface VideoProcessingJobData {
  videoId: string;
  projectId: string | null;
  userId: string;
  sourceType: "youtube" | "upload";
  sourceUrl: string;
}

/**
 * Clip generation job data
 * Validates: Requirements 7.5, 7.6, 7.7
 */
export interface ClipGenerationJobData {
  clipId: string;
  videoId: string;
  workspaceId: string; // For credit tracking
  userId: string; // For credit tracking
  sourceType: "youtube" | "upload";
  sourceUrl?: string;
  storageKey?: string;
  startTime: number;
  endTime: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  quality: "720p" | "1080p" | "4k";
  creditCost: number; // Credits to consume for this generation
  // Intro title to burn into video for first 3 seconds
  introTitle?: string;
  // Caption data for burning into video
  captions?: {
    words: Array<{ word: string; start: number; end: number }>;
    style?: {
      fontFamily?: string;
      fontSize?: number;
      textColor?: string;
      backgroundColor?: string;
      backgroundOpacity?: number;
      position?: "top" | "center" | "bottom";
      alignment?: "left" | "center" | "right";
      highlightColor?: string;
      highlightEnabled?: boolean;
      shadow?: boolean;
      outline?: boolean;
      outlineColor?: string;
    };
  };
}

export const videoProcessingQueue = new Queue<VideoProcessingJobData>(
  QUEUE_NAMES.VIDEO_PROCESSING,
  {
    connection: redisConfig as any,
    defaultJobOptions: {
      attempts: 1,
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
    connection: redisConfig as any,
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


/**
 * Clip generation queue
 * Validates: Requirements 7.5, 7.6, 7.7
 */
export const clipGenerationQueue = new Queue<ClipGenerationJobData>(
  QUEUE_NAMES.CLIP_GENERATION,
  {
    connection: redisConfig as any,
    defaultJobOptions: {
      attempts: 1, // Retry up to 3 times (Requirement 7.7)
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

/**
 * Add a clip generation job to the queue
 * Validates: Requirements 7.5
 */
export async function addClipGenerationJob(data: ClipGenerationJobData) {
  console.log(`[QUEUE] Adding clip generation job for clip: ${data.clipId}`);

  const job = await clipGenerationQueue.add("generate-clip", data, {
    jobId: `clip-${data.clipId}`,
  });

  console.log(`[QUEUE] Clip generation job added with ID: ${job.id}`);
  return job;
}

/**
 * Get clip generation job status
 */
export async function getClipJobStatus(jobId: string) {
  const job = await clipGenerationQueue.getJob(jobId);
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
