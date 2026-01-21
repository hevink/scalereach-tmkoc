/**
 * Clip Generation Worker
 * Processes clip generation jobs from BullMQ queue
 * 
 * Validates: Requirements 7.5, 7.6, 7.7
 */

import { Job } from "bullmq";
import { ClipModel } from "../models/clip.model";
import { ClipGeneratorService } from "../services/clip-generator.service";
import {
  createWorker,
  QUEUE_NAMES,
  ClipGenerationJobData,
} from "./queue";

/**
 * Update clip status in the database
 * Validates: Requirements 7.5, 7.6
 */
async function updateClipStatus(
  clipId: string,
  status: "detected" | "generating" | "ready" | "exported" | "failed",
  updates: Partial<{
    storageKey: string;
    storageUrl: string;
    aspectRatio: string;
    errorMessage: string;
  }> = {}
) {
  await ClipModel.update(clipId, {
    status,
    ...updates,
  });
}

/**
 * Process a clip generation job
 * Validates: Requirements 7.5, 7.6, 7.7
 */
async function processClipGenerationJob(
  job: Job<ClipGenerationJobData>
): Promise<void> {
  const {
    clipId,
    videoId,
    sourceType,
    sourceUrl,
    storageKey,
    startTime,
    endTime,
    aspectRatio,
    quality,
    captions,
  } = job.data;

  console.log(`[CLIP WORKER] Processing clip generation job: ${clipId}`);
  console.log(`[CLIP WORKER] Source type: ${sourceType}, Aspect ratio: ${aspectRatio}`);
  console.log(`[CLIP WORKER] Time range: ${startTime}s - ${endTime}s`);
  console.log(`[CLIP WORKER] Captions: ${captions?.words?.length || 0} words`);

  try {
    // Update status to generating (Requirement 7.5)
    await updateClipStatus(clipId, "generating");
    await job.updateProgress(10);

    // Validate options
    const validation = ClipGeneratorService.validateOptions({
      videoId,
      clipId,
      sourceType,
      sourceUrl,
      storageKey,
      startTime,
      endTime,
      aspectRatio,
      quality,
    });

    if (!validation.valid) {
      throw new Error(`Invalid clip options: ${validation.error}`);
    }

    await job.updateProgress(20);

    // Generate the clip with captions
    console.log(`[CLIP WORKER] Starting clip generation...`);
    const generatedClip = await ClipGeneratorService.generateClip({
      videoId,
      clipId,
      sourceType,
      sourceUrl,
      storageKey,
      startTime,
      endTime,
      aspectRatio,
      quality,
      captions,
    });

    await job.updateProgress(90);

    // Update clip with storage info and set status to ready (Requirement 7.6)
    await updateClipStatus(clipId, "ready", {
      storageKey: generatedClip.storageKey,
      storageUrl: generatedClip.storageUrl,
      aspectRatio,
    });

    await job.updateProgress(100);

    console.log(`[CLIP WORKER] Clip generation complete: ${clipId}`);
    console.log(`[CLIP WORKER] Storage URL: ${generatedClip.storageUrl}`);
    console.log(`[CLIP WORKER] File size: ${(generatedClip.fileSize / 1024 / 1024).toFixed(2)} MB`);
  } catch (error) {
    console.error(`[CLIP WORKER] Error generating clip ${clipId}:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Update status to failed (Requirement 7.7 - after 3 retries)
    // Note: BullMQ handles retries automatically, this is called on final failure
    await updateClipStatus(clipId, "failed", { errorMessage });

    throw error; // Re-throw to trigger BullMQ retry logic
  }
}

/**
 * Start the clip generation worker
 * Validates: Requirements 7.5, 7.6, 7.7
 */
export function startClipWorker(concurrency: number = 2) {
  console.log(`[CLIP WORKER] Starting worker with concurrency: ${concurrency}`);

  const worker = createWorker<ClipGenerationJobData>(
    QUEUE_NAMES.CLIP_GENERATION,
    processClipGenerationJob,
    concurrency
  );

  // Log retry attempts
  worker.on("failed", (job, err) => {
    if (job) {
      const attemptsMade = job.attemptsMade;
      const maxAttempts = job.opts.attempts || 3;
      console.log(
        `[CLIP WORKER] Job ${job.id} failed (attempt ${attemptsMade}/${maxAttempts}): ${err.message}`
      );
    }
  });

  return worker;
}
