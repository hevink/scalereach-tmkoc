/**
 * Clip Generation Worker
 * Processes clip generation jobs from BullMQ queue
 *
 * Validates: Requirements 7.5, 7.6, 7.7
 */

import { Job } from "bullmq";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { ClipModel } from "../models/clip.model";
import { UserModel } from "../models/user.model";
import { VideoModel } from "../models/video.model";
import { WorkspaceModel } from "../models/workspace.model";
import { TranslationModel } from "../models/translation.model";
import { TranslationService } from "../services/translation.service";
import { ClipGeneratorService } from "../services/clip-generator.service";
import { FFmpegService } from "../services/ffmpeg.service";
import { R2Service } from "../services/r2.service";
import { emailService } from "../services/email.service";
import { captureException } from "../lib/sentry";
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
    rawStorageKey: string;
    rawStorageUrl: string;
    thumbnailKey: string;
    thumbnailUrl: string;
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
 * Check if all clips for a video are ready and send email notification
 */
async function checkAndNotifyAllClipsReady(
  videoId: string,
  userId: string,
  workspaceId?: string
): Promise<void> {
  try {
    // Get all clips for this video
    const allClips = await ClipModel.getByVideoId(videoId);

    if (!allClips || allClips.length === 0) {
      return;
    }

    // Check if all clips are ready (or exported)
    const allReady = allClips.every(
      (clip) => clip.status === "ready" || clip.status === "exported"
    );

    if (!allReady) {
      const pendingCount = allClips.filter(
        (clip) => clip.status !== "ready" && clip.status !== "exported"
      ).length;
      console.log(`[CLIP WORKER] ${pendingCount} clips still pending for video ${videoId}`);
      return;
    }

    console.log(`[CLIP WORKER] All ${allClips.length} clips ready for video ${videoId}, sending notification...`);

    // Get user and video info for email
    const [user, video] = await Promise.all([
      UserModel.getById(userId),
      VideoModel.getById(videoId),
    ]);

    if (!user?.email) {
      console.warn(`[CLIP WORKER] No email found for user ${userId}, skipping notification`);
      return;
    }

    // Get workspace slug if available
    let workspaceSlug: string | undefined;
    if (workspaceId) {
      try {
        const workspace = await WorkspaceModel.getById(workspaceId);
        workspaceSlug = workspace?.slug;
      } catch (err) {
        console.warn(`[CLIP WORKER] Could not fetch workspace ${workspaceId}:`, err);
      }
    }

    // Send email notification
    await emailService.sendAllClipsReadyNotification({
      to: user.email,
      userName: user.name || user.email.split("@")[0],
      videoTitle: video?.title || "Untitled Video",
      clipCount: allClips.length,
      videoId,
      workspaceSlug,
    });

    console.log(`[CLIP WORKER] All clips ready notification sent to ${user.email}`);
  } catch (error) {
    // Don't fail the job if email notification fails
    console.error(`[CLIP WORKER] Failed to send all clips ready notification:`, error);
  }
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
    introTitle,
    captions,
    watermark,
    emojis,
    targetLanguage,
    splitScreen,
    backgroundStyle,
    smartCropEnabled,
  } = job.data;

  const jobStartTime = Date.now();
  console.log(`[CLIP WORKER] Processing clip generation job: ${clipId}`);
  console.log(`[CLIP WORKER] Source type: ${sourceType}, Aspect ratio: ${aspectRatio}`);
  console.log(`[CLIP WORKER] Time range: ${startTime}s - ${endTime}s`);
  console.log(`[CLIP WORKER] Captions: ${captions?.words?.length || 0} words`);
  console.log(`[CLIP WORKER] Intro title: ${introTitle ? 'yes' : 'no'}`);
  console.log(`[CLIP WORKER] Emojis: ${emojis ? 'yes' : 'no'}`);
  console.log(`[CLIP WORKER] Target language: ${targetLanguage || 'original'}`);
  console.log(`[CLIP WORKER] Split-screen: ${splitScreen ? `ratio=${splitScreen.splitRatio}` : 'no'}`);

  try {
    // Update status to generating (Requirement 7.5)
    await updateClipStatus(clipId, "generating");
    await job.updateProgress(10);

    // If targetLanguage is set, fetch translated captions
    let effectiveCaptions = captions;
    if (targetLanguage) {
      console.log(`[CLIP WORKER] Fetching translated captions for language: ${targetLanguage}`);
      const translatedCaptions = await TranslationModel.getClipCaptions(clipId, targetLanguage);
      if (translatedCaptions) {
        const styleOverrides = TranslationService.getLanguageStyleOverrides(targetLanguage);
        effectiveCaptions = {
          words: translatedCaptions.words,
          style: {
            ...captions?.style,
            ...styleOverrides,
          },
        };
        console.log(`[CLIP WORKER] Using ${translatedCaptions.words.length} translated words`);
      } else {
        console.warn(`[CLIP WORKER] No translated captions found for ${targetLanguage}, using original`);
      }
    }

    // Validate options
    const validation = ClipGeneratorService.validateOptions({
      userId,
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

    // Generate the clip with captions and intro title
    const generateStart = Date.now();
    console.log(`[CLIP WORKER] Starting clip generation...`);
    const generatedClip = await ClipGeneratorService.generateClip({
      userId,
      videoId,
      clipId,
      sourceType,
      sourceUrl,
      storageKey,
      startTime,
      endTime,
      aspectRatio,
      quality,
      watermark,
      introTitle,
      captions: effectiveCaptions,
      emojis,
      backgroundStyle,
      splitScreen: splitScreen ? {
        backgroundStorageKey: splitScreen.backgroundStorageKey,
        backgroundDuration: splitScreen.backgroundDuration,
        splitRatio: splitScreen.splitRatio,
      } : undefined,
    }, async (percent) => {
      // Map service progress (25-85) into job progress (20-80)
      const jobProgress = 20 + Math.round((percent / 100) * 60);
      await job.updateProgress(jobProgress);
    });

    await job.updateProgress(85);

    // Smart AI Reframing — run face detection + crop on raw clip before thumbnail
    let smartCropStorageKey: string | undefined;
    let smartCropStorageUrl: string | undefined;

    if (smartCropEnabled && generatedClip.rawStorageKey) {
      try {
        console.log(`[CLIP WORKER] Smart crop enabled — starting reframe for ${clipId}`);
        await ClipModel.update(clipId, { smartCropStatus: "processing" });

        const PYTHON_PATH = process.env.PYTHON_PATH || "python3";
        const SMART_CROP_SCRIPT = path.join(__dirname, "../scripts/smart_crop.py");
        const TMP_DIR = process.env.SMART_CROP_TMP_DIR || "/tmp";

        // Get signed URL for raw clip
        const rawVideoUrl = await R2Service.getSignedDownloadUrl(generatedClip.rawStorageKey, 3600);

        // Run Python sidecar
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(PYTHON_PATH, [SMART_CROP_SCRIPT, rawVideoUrl, clipId, TMP_DIR]);
          proc.stdout?.on("data", (d) => process.stdout.write(`[SMART CROP PY] ${d}`));
          proc.stderr?.on("data", (d) => process.stderr.write(`[SMART CROP PY] ${d}`));
          proc.on("error", (err) => reject(new Error(`Python spawn failed: ${err.message}`)));
          proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Python exited ${code}`)));
        });

        // Read coords
        const coordsPath = `${TMP_DIR}/${clipId}_coords.json`;
        const result = JSON.parse(await fs.readFile(coordsPath, "utf-8"));
        await fs.unlink(coordsPath).catch(() => {});

        // Apply FFmpeg crop → stream to R2
        const outputKey = `${workspaceId}/${videoId}/${clipId}-vertical.mp4`;
        if (result.mode === "skip") {
          // No face detected — skip reframing, keep original 16:9
          console.log(`[CLIP WORKER] Smart crop: no face detected, skipping reframe for ${clipId}`);
          await ClipModel.update(clipId, { smartCropStatus: "skipped" });
        } else if (result.mode === "split") {
          ({ storageKey: smartCropStorageKey, storageUrl: smartCropStorageUrl } =
            await FFmpegService.applySplitScreen(rawVideoUrl, result, outputKey, TMP_DIR));
        } else if (result.mode === "mixed") {
          ({ storageKey: smartCropStorageKey, storageUrl: smartCropStorageUrl } =
            await FFmpegService.applyMixedCrop(rawVideoUrl, result.segments, result.crop_w, result.crop_h, outputKey, TMP_DIR));
        } else {
          ({ storageKey: smartCropStorageKey, storageUrl: smartCropStorageUrl } =
            await FFmpegService.applySmartCrop(rawVideoUrl, result.coords, outputKey, TMP_DIR));
        }

        if (result.mode !== "skip") {
          await ClipModel.update(clipId, {
            smartCropStatus: "done",
            smartCropStorageKey,
            smartCropStorageUrl,
          });
          console.log(`[CLIP WORKER] Smart crop done: ${smartCropStorageUrl}`);
        }
      } catch (scErr) {
        console.error(`[CLIP WORKER] Smart crop failed (non-fatal):`, scErr);
        await ClipModel.update(clipId, { smartCropStatus: "failed" });
      }
    }

    // Generate thumbnail from the clip (at 1 second)
    const thumbnailStart = Date.now();
    console.log(`[CLIP WORKER] Generating thumbnail...`);
    let thumbnailKey: string | undefined;
    let thumbnailUrl: string | undefined;
    
    try {
      const thumbnail = await ClipGeneratorService.generateThumbnail(
        generatedClip.storageKey,
        aspectRatio,
        quality
      );
      thumbnailKey = thumbnail.thumbnailKey;
      thumbnailUrl = thumbnail.thumbnailUrl;
      console.log(`[CLIP WORKER] Thumbnail generated: ${thumbnailKey}`);
    } catch (thumbError) {
      // Log but don't fail the job if thumbnail generation fails
      console.warn(`[CLIP WORKER] Thumbnail generation failed (non-fatal):`, thumbError);
    }

    await job.updateProgress(90);

    // Update clip with storage info and set status to ready (Requirement 7.6)
    await updateClipStatus(clipId, "ready", {
      storageKey: generatedClip.storageKey,
      storageUrl: generatedClip.storageUrl,
      rawStorageKey: generatedClip.rawStorageKey,
      rawStorageUrl: generatedClip.rawStorageUrl,
      thumbnailKey,
      thumbnailUrl,
      aspectRatio,
    });

    await job.updateProgress(100);

    const totalMs = Date.now() - jobStartTime;
    const generateMs = thumbnailStart - generateStart;
    const thumbnailMs = Date.now() - thumbnailStart;
    const clipDurationSec = endTime - startTime;

    console.log(`[CLIP WORKER] TIMING | clipId=${clipId} total=${(totalMs/1000).toFixed(1)}s generate=${(generateMs/1000).toFixed(1)}s thumbnail=${(thumbnailMs/1000).toFixed(1)}s clipDuration=${clipDurationSec}s ratio=${(totalMs/1000/clipDurationSec).toFixed(2)}x`);
    console.log(`[CLIP WORKER] Clip generation complete: ${clipId}`);
    console.log(`[CLIP WORKER] Storage URL: ${generatedClip.storageUrl}`);
    console.log(`[CLIP WORKER] File size: ${(generatedClip.fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Check if all clips for this video are ready and send email notification
    await checkAndNotifyAllClipsReady(videoId, userId, workspaceId);
  } catch (error) {
    console.error(`[CLIP WORKER] Error generating clip ${clipId}:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Report to Sentry with context
    if (error instanceof Error) {
      captureException(error, { clipId, videoId, aspectRatio, quality });
    }

    // Only mark as failed on the last attempt — BullMQ retries before reaching here
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
    if (isLastAttempt) {
      await updateClipStatus(clipId, "failed", { errorMessage });
    }

    throw error; // Re-throw to trigger BullMQ retry logic
  }
}

/**
 * Start the clip generation worker
 * Validates: Requirements 7.5, 7.6, 7.7
 * 
 * Note: Default concurrency is 2. Higher values (3-4) may cause FFmpeg exit code 202 errors
 * when multiple yt-dlp processes with --force-keyframes-at-cuts run concurrently.
 * Retry logic in clip-generator.service.ts handles transient failures.
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
