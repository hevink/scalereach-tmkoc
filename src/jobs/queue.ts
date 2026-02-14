import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

// Support both REDIS_URL and individual config
const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_TLS = process.env.REDIS_TLS === "true" || REDIS_HOST.includes("upstash.io");

// Create Redis connection - used by both the shared connection and BullMQ queues/workers
let redisConfig: any;

if (REDIS_URL) {
  redisConfig = {
    maxRetriesPerRequest: null,
  };
  console.log(`[REDIS] Using REDIS_URL connection`);
} else {
  redisConfig = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };
  console.log(`[REDIS] Using host:port connection: ${REDIS_HOST}:${REDIS_PORT}`);
}

// Enable TLS only for Upstash and other cloud Redis providers
if (REDIS_TLS) {
  redisConfig.tls = {};
  console.log(`[REDIS] TLS enabled`);
}

export const redisConnection = REDIS_URL 
  ? new IORedis(REDIS_URL, redisConfig)
  : new IORedis(redisConfig);

// Factory to create new IORedis connections for BullMQ queues/workers
// BullMQ needs its own connections (not shared), so we create new ones with the same config
export function createRedisConnection(): any {
  return REDIS_URL ? new IORedis(REDIS_URL, redisConfig) : new IORedis(redisConfig);
}

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
  watermark?: boolean; // Burn watermark overlay (free plan)
  // Transcript with emojis for animated emoji overlays
  emojis?: string;
  // Intro title to burn into video for first 3 seconds
  introTitle?: string;
  // Target language for translated captions (if set, uses translated captions)
  targetLanguage?: string;
  // Dubbing ID for dubbed audio replacement during export
  dubbingId?: string;
  // Split-screen background video data
  splitScreen?: {
    backgroundVideoId: string;
    backgroundStorageKey: string;
    backgroundDuration: number;
    splitRatio: number;
  };
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
      x?: number;
      y?: number;
      maxWidth?: number;
      alignment?: "left" | "center" | "right";
      animation?: "none" | "word-by-word" | "karaoke" | "bounce" | "fade";
      highlightColor?: string;
      highlightEnabled?: boolean;
      shadow?: boolean;
      outline?: boolean;
      outlineColor?: string;
      outlineWidth?: number;
      highlightScale?: number;
      textTransform?: "none" | "uppercase";
      wordsPerLine?: number;
    };
  };
}

export const videoProcessingQueue = new Queue<VideoProcessingJobData>(
  QUEUE_NAMES.VIDEO_PROCESSING,
  {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 1,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        count: 100,
        age: 24 * 60 * 60, // Remove completed jobs after 24 hours
      },
      removeOnFail: {
        count: 50,
        age: 7 * 24 * 60 * 60, // Remove failed jobs after 7 days
      },
    },
  }
);

// Clean up stale jobs periodically (every hour)
setInterval(async () => {
  try {
    // Clean completed jobs older than 24 hours
    await videoProcessingQueue.clean(24 * 60 * 60 * 1000, 100, 'completed');
    
    // Clean failed jobs older than 7 days
    await videoProcessingQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');
    
    // Clean waiting jobs older than 1 hour (stuck jobs)
    await videoProcessingQueue.clean(60 * 60 * 1000, 10, 'wait');
    
    // Clean active jobs older than 30 minutes (likely stuck)
    await videoProcessingQueue.clean(30 * 60 * 1000, 10, 'active');
    
    console.log('[QUEUE CLEANUP] Cleaned stale video processing jobs');
  } catch (error) {
    console.error('[QUEUE CLEANUP] Error cleaning video processing queue:', error);
  }
}, 60 * 60 * 1000); // Run every hour

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
    connection: createRedisConnection(),
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
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 1, // Retry up to 3 times (Requirement 7.7)
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        count: 100,
        age: 24 * 60 * 60, // Remove completed jobs after 24 hours
      },
      removeOnFail: {
        count: 50,
        age: 7 * 24 * 60 * 60, // Remove failed jobs after 7 days
      },
    },
  }
);

// Clean up stale jobs periodically (every hour)
setInterval(async () => {
  try {
    // Clean completed jobs older than 24 hours
    await clipGenerationQueue.clean(24 * 60 * 60 * 1000, 100, 'completed');
    
    // Clean failed jobs older than 7 days
    await clipGenerationQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');
    
    // Clean waiting jobs older than 1 hour (stuck jobs)
    await clipGenerationQueue.clean(60 * 60 * 1000, 10, 'wait');
    
    // Clean active jobs older than 30 minutes (likely stuck)
    await clipGenerationQueue.clean(30 * 60 * 1000, 10, 'active');
    
    console.log('[QUEUE CLEANUP] Cleaned stale clip generation jobs');
  } catch (error) {
    console.error('[QUEUE CLEANUP] Error cleaning clip generation queue:', error);
  }
}, 60 * 60 * 1000); // Run every hour

/**
 * Add a clip generation job to the queue
 * Validates: Requirements 7.5
 */
export async function addClipGenerationJob(data: ClipGenerationJobData) {
  console.log(`[QUEUE] Adding clip generation job for clip: ${data.clipId}`);

  const jobId = `clip-${data.clipId}`;

  // Remove any existing job with the same ID (e.g. from a previous generation)
  // BullMQ silently ignores duplicate job IDs, so we must clean up first
  const existingJob = await clipGenerationQueue.getJob(jobId);
  if (existingJob) {
    console.log(`[QUEUE] Removing existing job ${jobId} (state: ${await existingJob.getState()})`);
    await existingJob.remove();
  }

  const job = await clipGenerationQueue.add("generate-clip", data, {
    jobId,
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
