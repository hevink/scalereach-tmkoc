/**
 * Clip Generation Worker
 * Processes clip generation jobs from BullMQ queue
 *
 * Validates: Requirements 7.5, 7.6, 7.7
 */

import { Job } from "bullmq";
import { ClipModel } from "../models/clip.model";
import { CreditModel } from "../models/credit.model";
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
    workspaceId,
    userId,
    sourceType,
    sourceUrl,
    storageKey,
    startTime,
    endTime,
    aspectRatio,
    quality,
    creditCost,
    captions,
  } = job.data;

  console.log(`[CLIP WORKER] Processing clip generation job: ${clipId}`);
  console.log(`[CLIP WORKER] Source type: ${sourceType}, Aspect ratio: ${aspectRatio}`);
  console.log(`[CLIP WORKER] Time range: ${startTime}s - ${endTime}s`);
  console.log(`[CLIP WORKER] Captions: ${captions?.words?.length || 0} words`);
  console.log(`[CLIP WORKER] Credit cost: ${creditCost}, Workspace: ${workspaceId}`);

  let creditsConsumed = false;

  try {
    // Update status to generating (Requirement 7.5)
    await updateClipStatus(clipId, "generating");
    await job.updateProgress(10);

    // Consume credits before starting generation
    if (workspaceId && creditCost > 0) {
      try {
        await CreditModel.useCredits({
          workspaceId,
          userId,
          amount: creditCost,
          description: `Clip generation - ${aspectRatio} ${quality}`,
          metadata: {
            clipId,
            videoId,
            aspectRatio,
            quality,
          },
        });
        creditsConsumed = true;
        console.log(`[CLIP WORKER] Credits consumed: ${creditCost} for workspace ${workspaceId}`);
      } catch (creditError: any) {
        console.error(`[CLIP WORKER] Failed to consume credits:`, creditError);
        throw new Error(`Insufficient credits: ${creditError.message}`);
      }
    }

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

    // Refund credits on failure if they were consumed
    if (creditsConsumed && workspaceId && creditCost > 0) {
      try {
        await CreditModel.addCredits({
          workspaceId,
          userId,
          amount: creditCost,
          type: "refund",
          description: `Refund for failed clip generation - ${clipId}`,
          metadata: {
            clipId,
            videoId,
            reason: errorMessage,
          },
        });
        console.log(`[CLIP WORKER] Credits refunded: ${creditCost} for workspace ${workspaceId}`);
      } catch (refundError) {
        console.error(`[CLIP WORKER] Failed to refund credits:`, refundError);
      }
    }

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
