import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { video, viralClip } from "../db/schema";
import { YouTubeService, MAX_VIDEO_DURATION_SECONDS } from "../services/youtube.service";
import { R2Service } from "../services/r2.service";
import { DeepgramService } from "../services/deepgram.service";
import { ViralDetectionService } from "../services/viral-detection.service";
import { FFmpegService } from "../services/ffmpeg.service";
import { CLASSIC_TEMPLATE, getTemplateById } from "../data/caption-templates";
import { VideoConfigModel } from "../models/video-config.model";
import { ClipCaptionModel } from "../models/clip-caption.model";
import { UserModel } from "../models/user.model";
import { MinutesModel } from "../models/minutes.model";
import { WorkspaceModel } from "../models/workspace.model";
import { emailService } from "../services/email.service";
import { getPlanConfig, calculateMinuteConsumption } from "../config/plan-config";
import { canUploadVideo } from "../services/minutes-validation.service";
import { captureException } from "../lib/sentry";
import {
  createWorker,
  QUEUE_NAMES,
  VideoProcessingJobData,
  addClipGenerationJob,
} from "./queue";

async function updateVideoStatus(
  videoId: string,
  status: "pending" | "downloading" | "uploading" | "transcribing" | "analyzing" | "completed" | "failed",
  updates: Partial<{
    storageKey: string;
    storageUrl: string;
    audioStorageKey: string;
    audioStorageUrl: string;
    title: string;
    duration: number;
    fileSize: number;
    mimeType: string;
    metadata: any;
    errorMessage: string;
    transcript: string;
    transcriptWords: any[];
    transcriptLanguage: string;
    transcriptConfidence: number;
  }> = {}
) {
  await db
    .update(video)
    .set({
      status,
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(video.id, videoId));
}

async function processYouTubeVideo(
  job: Job<VideoProcessingJobData>
): Promise<void> {
  const { videoId, projectId, userId, sourceUrl } = job.data;

  console.log(`[VIDEO WORKER] Processing YouTube video: ${videoId}`);
  console.log(`[VIDEO WORKER] Source URL: ${sourceUrl}`);

  // Track minutes for refund on failure
  let minutesDeducted = 0;
  let workspaceId: string | undefined;

  try {
    // Get workspace ID from video record for potential refund
    const videoRecord = await db.select().from(video).where(eq(video.id, videoId));
    workspaceId = videoRecord[0]?.workspaceId || undefined;
    minutesDeducted = videoRecord[0]?.minutesConsumed || 0;

    // Fetch video configuration
    const videoConfig = await VideoConfigModel.getByVideoId(videoId);
    console.log(`[VIDEO WORKER] Video config loaded:`, videoConfig ? {
      skipClipping: videoConfig.skipClipping,
      clipModel: videoConfig.clipModel,
      genre: videoConfig.genre,
      captionTemplateId: videoConfig.captionTemplateId,
      aspectRatio: videoConfig.aspectRatio,
      timeframeStart: videoConfig.timeframeStart,
      timeframeEnd: videoConfig.timeframeEnd,
    } : 'No config found, using defaults');

    await updateVideoStatus(videoId, "downloading");
    await job.updateProgress(10);

    // Get audio stream directly from YouTube
    let streamResult;
    try {
      streamResult = await YouTubeService.streamAudio(sourceUrl);
    } catch (error: any) {
      console.error(`[VIDEO WORKER] Failed to start YouTube stream: ${error.message}`);
      throw new Error(`YouTube download failed: ${error.message}`);
    }
    
    const { stream, videoInfo, mimeType } = streamResult;

    await job.updateProgress(30);
    console.log(`[VIDEO WORKER] Audio stream started, uploading to R2...`);

    await updateVideoStatus(videoId, "uploading", {
      title: videoInfo.title,
      duration: Math.round(videoInfo.duration),
      mimeType: mimeType,
      metadata: {
        youtubeId: videoInfo.id,
        thumbnail: videoInfo.thumbnail,
        channelName: videoInfo.channelName,
      },
    });

    const filename = `${videoInfo.id}.m4a`;
    // Use projectId if available, otherwise use userId for storage path
    const storagePath = projectId || `user-${userId}`;
    const storageKey = R2Service.generateVideoKey(storagePath, filename);

    // Stream directly to R2 without saving to disk
    // Wrap in promise to catch stream errors
    let storageUrl: string;
    try {
      const uploadResult = await new Promise<{ url: string }>((resolve, reject) => {
        // Listen for stream errors
        stream.on("error", (err) => {
          console.error(`[VIDEO WORKER] Stream error during upload: ${err.message}`);
          reject(new Error(`Stream failed: ${err.message}`));
        });

        R2Service.uploadFromStream(storageKey, stream, mimeType)
          .then(resolve)
          .catch(reject);
      });
      storageUrl = uploadResult.url;
    } catch (error: any) {
      console.error(`[VIDEO WORKER] Upload failed: ${error.message}`);
      // Try to clean up partial upload
      try {
        await R2Service.deleteFile(storageKey);
      } catch (deleteError) {
        console.warn(`[VIDEO WORKER] Failed to clean up partial upload: ${storageKey}`);
      }
      throw new Error(`Failed to upload audio: ${error.message}`);
    }

    await job.updateProgress(60);

    await updateVideoStatus(videoId, "transcribing", {
      storageKey,
      storageUrl,
    });

    // Get signed URL for Deepgram (R2 files may not be publicly accessible)
    const signedUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);

    // Transcribe audio using Deepgram
    // Pass language from config if specified (null or 'auto' = auto-detect)
    const transcriptionLanguage = videoConfig?.language && videoConfig.language !== 'auto' 
      ? videoConfig.language as any 
      : undefined;
    console.log(`[VIDEO WORKER] Starting transcription... (language: ${transcriptionLanguage || 'auto-detect'})`);
    const transcriptResult = await DeepgramService.transcribeFromUrl(signedUrl, {
      language: transcriptionLanguage,
    });

    await job.updateProgress(70);

    // Store transcript with language and confidence metadata
    // Validates: Requirements 3.4, 3.8
    await updateVideoStatus(videoId, "analyzing", {
      transcript: transcriptResult.transcript,
      transcriptWords: transcriptResult.words,
      transcriptLanguage: transcriptResult.language,
      transcriptConfidence: transcriptResult.confidence,
    });

    console.log(`[VIDEO WORKER] Transcript stored with language: ${transcriptResult.language}, confidence: ${transcriptResult.confidence.toFixed(3)}`);

    // Check if clipping is disabled
    if (videoConfig?.skipClipping) {
      console.log(`[VIDEO WORKER] Clipping disabled, skipping viral detection`);
      await updateVideoStatus(videoId, "completed", {});
      await job.updateProgress(100);
      console.log(`[VIDEO WORKER] Video processing complete (no clipping): ${videoId}`);
      return;
    }

    // Detect viral clips using AI
    console.log(`[VIDEO WORKER] Detecting viral clips...`);
    
    // Apply timeframe filtering if configured
    const timeframeStart = videoConfig?.timeframeStart ?? 0;
    const timeframeEnd = videoConfig?.timeframeEnd ?? videoInfo.duration;
    
    // Filter transcript words to the configured timeframe
    const filteredWords = transcriptResult.words.filter(
      (w) => w.start >= timeframeStart && w.end <= timeframeEnd
    );
    
    // Build filtered transcript text
    const filteredTranscript = filteredWords.map((w) => w.word).join(" ");
    
    console.log(`[VIDEO WORKER] Processing timeframe: ${timeframeStart}s - ${timeframeEnd}s`);
    
    const viralClips = await ViralDetectionService.detectViralClips(
      filteredTranscript,
      filteredWords,
      {
        maxClips: 5,
        minDuration: videoConfig?.clipDurationMin ?? 15,
        maxDuration: videoConfig?.clipDurationMax ?? 60,
        videoTitle: videoInfo.title,
        genre: videoConfig?.genre ?? "Auto",
        customPrompt: videoConfig?.customPrompt ?? undefined,
        // Editing options from video config
        enableEmojis: false,
        enableIntroTitle: false,
      }
    );

    await job.updateProgress(90);

    // Save viral clips to database and queue clip generation with captions
    // Validates: Requirements 5.3, 5.4, 5.5, 5.8, 5.9
    if (viralClips.length > 0) {
      console.log(`[VIDEO WORKER] Saving ${viralClips.length} viral clips and queuing generation with captions...`);

      const clipRecords = viralClips.map((clip) => ({
        id: nanoid(),
        videoId: videoId,
        title: clip.title,
        introTitle: clip.introTitle,
        startTime: Math.round(clip.startTime), // Store as integer seconds
        endTime: Math.round(clip.endTime),     // Store as integer seconds
        duration: Math.round(clip.endTime - clip.startTime), // Calculate and store duration
        transcript: clip.transcript,
        transcriptWithEmojis: clip.transcriptWithEmojis,
        score: clip.viralityScore,             // Map viralityScore to score column
        viralityReason: clip.viralityReason,   // Store detailed viral reason
        hooks: clip.hooks,                     // Store hooks array as JSONB
        emotions: clip.emotions,               // Store emotions array as JSONB
        recommendedPlatforms: clip.recommendedPlatforms, // Store recommended platforms
        status: "detected" as const,           // Initial status is 'detected'
      }));

      await db.insert(viralClip).values(clipRecords);

      // Auto-generate clips with captions burned in
      // Extract words for each clip's time range and queue generation
      for (const clipRecord of clipRecords) {
        const clipWords = transcriptResult.words.filter(
          (w) => w.start >= clipRecord.startTime && w.end <= clipRecord.endTime
        );

        // Adjust word timings to be relative to clip start
        const adjustedWords = clipWords.map((w) => ({
          id: nanoid(8),
          word: w.word,
          start: Number((w.start - clipRecord.startTime).toFixed(3)),
          end: Number((w.end - clipRecord.startTime).toFixed(3)),
        }));

        // Get caption template from config or use default
        const templateId = videoConfig?.captionTemplateId ?? "classic";
        const template = getTemplateById(templateId) ?? CLASSIC_TEMPLATE;
        
        const captionStyle = {
          fontFamily: template.style.fontFamily,
          fontSize: template.style.fontSize,
          textColor: template.style.textColor,
          backgroundColor: template.style.backgroundColor,
          backgroundOpacity: template.style.backgroundOpacity,
          position: template.style.position,
          x: template.style.x,
          y: template.style.y,
          alignment: template.style.alignment,
          animation: template.style.animation,
          highlightColor: template.style.highlightColor,
          highlightEnabled: template.style.highlightEnabled,
          shadow: template.style.shadow,
          outline: template.style.outline,
          outlineColor: template.style.outlineColor,
          outlineWidth: template.style.outlineWidth,
          glowEnabled: template.style.glowEnabled,
          glowColor: template.style.glowColor,
          glowIntensity: template.style.glowIntensity,
          highlightScale: template.style.highlightScale,
          textTransform: template.style.textTransform,
          wordsPerLine: template.style.wordsPerLine,
        };

        // Save caption data to database for editing
        await ClipCaptionModel.create({
          clipId: clipRecord.id,
          words: adjustedWords,
          styleConfig: captionStyle,
          templateId: templateId,
        });

        // Get aspect ratio from config or use default
        const aspectRatio = (videoConfig?.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1";

        // Queue clip generation with captions and intro title
        const ws = workspaceId ? await WorkspaceModel.getById(workspaceId) : null;
        const applyWatermark = getPlanConfig(ws?.plan || "free").limits.watermark;

        const captionsEnabled = videoConfig?.enableCaptions ?? true;
        // Emojis and intro title disabled for now
        const introTitleEnabled = false;
        const emojisEnabled = false;

        await addClipGenerationJob({
          clipId: clipRecord.id,
          videoId: videoId,
          workspaceId: "", // Will be populated from video record
          userId: userId,
          creditCost: 0, // Minutes already deducted at video level
          sourceType: "youtube",
          sourceUrl: sourceUrl,
          startTime: clipRecord.startTime,
          endTime: clipRecord.endTime,
          aspectRatio: aspectRatio,
          quality: "1080p",
          watermark: applyWatermark,
          emojis: emojisEnabled ? (clipRecord.transcriptWithEmojis ?? undefined) : undefined,
          introTitle: introTitleEnabled ? (clipRecord.introTitle ?? undefined) : undefined,
          captions: captionsEnabled ? {
            words: adjustedWords,
            style: captionStyle,
          } : undefined,
        });

        console.log(`[VIDEO WORKER] Queued clip generation with captions: ${clipRecord.id}${clipRecord.introTitle ? ' (with intro title)' : ''}`);
      }
    }

    await updateVideoStatus(videoId, "completed", {});

    await job.updateProgress(100);
    console.log(`[VIDEO WORKER] Video processing complete: ${videoId}, found ${viralClips.length} viral clips (generation queued)`);

    // Send email notification when video processing is done
    try {
      const user = await UserModel.getById(userId);
      if (user?.email) {
        await emailService.sendVideoProcessedNotification({
          to: user.email,
          userName: user.name || user.email.split("@")[0],
          videoTitle: videoInfo.title,
          clipCount: viralClips.length,
          videoId: videoId,
        });
        console.log(`[VIDEO WORKER] Email notification sent to: ${user.email}`);
      }
    } catch (emailError) {
      console.error(`[VIDEO WORKER] Failed to send email notification:`, emailError);
    }
  } catch (error) {
    console.error(`[VIDEO WORKER] Error processing video ${videoId}:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Report to Sentry with context
    if (error instanceof Error) {
      captureException(error, { videoId, sourceUrl, sourceType: "youtube" });
    }

    // Refund minutes if they were deducted (YouTube minutes are deducted in controller)
    if (minutesDeducted > 0 && workspaceId) {
      try {
        await MinutesModel.refundMinutes({
          workspaceId,
          userId,
          videoId,
          amount: minutesDeducted,
          reason: `Refund for failed YouTube video processing - ${errorMessage}`,
        });
        console.log(`[VIDEO WORKER] Refunded ${minutesDeducted} minutes for workspace ${workspaceId}`);
      } catch (refundError) {
        console.error(`[VIDEO WORKER] Failed to refund minutes:`, refundError);
      }
    }

    await updateVideoStatus(videoId, "failed", { errorMessage });

    throw error;
  }
}

async function processVideoJob(job: Job<VideoProcessingJobData>): Promise<void> {
  const { sourceType } = job.data;

  console.log(`[VIDEO WORKER] Processing job ${job.id}, type: ${sourceType}`);

  switch (sourceType) {
    case "youtube":
      await processYouTubeVideo(job);
      break;
    case "upload":
      await processUploadedVideo(job);
      break;
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
}

async function processUploadedVideo(
  job: Job<VideoProcessingJobData>
): Promise<void> {
  const { videoId, projectId, userId, sourceUrl } = job.data;

  console.log(`[VIDEO WORKER] Processing uploaded video: ${videoId}`);
  console.log(`[VIDEO WORKER] Source URL: ${sourceUrl}`);

  let minutesDeducted = 0;
  let workspaceId: string | undefined;

  try {
    // Fetch video configuration
    const videoConfig = await VideoConfigModel.getByVideoId(videoId);
    console.log(`[VIDEO WORKER] Video config loaded:`, videoConfig ? {
      skipClipping: videoConfig.skipClipping,
      clipModel: videoConfig.clipModel,
      genre: videoConfig.genre,
      captionTemplateId: videoConfig.captionTemplateId,
      aspectRatio: videoConfig.aspectRatio,
      timeframeStart: videoConfig.timeframeStart,
      timeframeEnd: videoConfig.timeframeEnd,
    } : 'No config found, using defaults');

    // Get the video record to get the storage key
    const videoRecord = await db.select().from(video).where(eq(video.id, videoId));
    if (!videoRecord[0]) {
      throw new Error(`Video record not found: ${videoId}`);
    }

    const storageKey = videoRecord[0].storageKey;
    if (!storageKey) {
      throw new Error(`Video storage key not found for: ${videoId}`);
    }

    workspaceId = videoRecord[0].workspaceId || undefined;

    await updateVideoStatus(videoId, "uploading");
    await job.updateProgress(10);

    // Get video metadata using FFprobe
    console.log(`[VIDEO WORKER] Getting video metadata...`);
    const signedVideoUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);
    
    let videoMetadata;
    try {
      videoMetadata = await FFmpegService.getVideoMetadata(signedVideoUrl);
      console.log(`[VIDEO WORKER] Video duration: ${videoMetadata.duration} seconds`);

      // Validate video duration and minutes against plan limits
      if (workspaceId) {
        const { WorkspaceModel } = await import("../models/workspace.model");
        const ws = await WorkspaceModel.getById(workspaceId);
        const plan = ws?.plan || "free";
        const planConfig = getPlanConfig(plan);
        const minutesBalance = await MinutesModel.getBalance(workspaceId);

        // Calculate effective processing duration based on timeframe
        const timeframeStart = videoConfig?.timeframeStart ?? 0;
        const timeframeEnd = videoConfig?.timeframeEnd ?? videoMetadata.duration;
        const effectiveDuration = timeframeEnd - timeframeStart;

        const uploadValidation = canUploadVideo(
          planConfig,
          videoMetadata.duration, // Full duration for plan limit check
          0,
          minutesBalance.minutesRemaining,
          effectiveDuration // Timeframe duration for minutes check
        );

        if (!uploadValidation.allowed) {
          throw new Error(uploadValidation.message || `Upload validation failed: ${uploadValidation.reason}`);
        }

        // Deduct minutes based on selected timeframe, not full video duration
        const minutesToDeduct = calculateMinuteConsumption(effectiveDuration);
        await MinutesModel.deductMinutes({
          workspaceId,
          userId,
          videoId,
          amount: minutesToDeduct,
          type: "upload",
        });
        minutesDeducted = minutesToDeduct;
        console.log(`[VIDEO WORKER] Deducted ${minutesToDeduct} minutes for uploaded video ${videoId} (timeframe: ${timeframeStart}s-${timeframeEnd}s of ${videoMetadata.duration}s total)`);
      }
    } catch (metadataError) {
      console.warn(`[VIDEO WORKER] Could not get video metadata: ${metadataError}`);
      // If it's a validation error, re-throw to fail the job
      if (metadataError instanceof Error && (
        metadataError.message.includes("VIDEO_TOO_LONG") ||
        metadataError.message.includes("INSUFFICIENT_MINUTES") ||
        metadataError.message.includes("Upload validation failed")
      )) {
        throw metadataError;
      }
      // Continue without metadata - we'll try to process anyway
    }

    await job.updateProgress(20);

    // Extract audio from the uploaded video
    console.log(`[VIDEO WORKER] Extracting audio from uploaded video...`);
    const audioStorageKey = FFmpegService.generateAudioStorageKey(storageKey);

    const audioResult = await FFmpegService.extractAudioToR2(
      storageKey,
      audioStorageKey
    );

    await job.updateProgress(50);

    await updateVideoStatus(videoId, "transcribing", {
      audioStorageKey: audioResult.audioStorageKey,
      audioStorageUrl: audioResult.audioStorageUrl,
      duration: videoMetadata?.duration ? Math.round(videoMetadata.duration) : undefined,
    });

    // Get signed URL for Deepgram
    const signedAudioUrl = await R2Service.getSignedDownloadUrl(
      audioResult.audioStorageKey,
      3600
    );

    // Transcribe audio using Deepgram
    // Pass language from config if specified (null or 'auto' = auto-detect)
    const transcriptionLanguage = videoConfig?.language && videoConfig.language !== 'auto' 
      ? videoConfig.language as any 
      : undefined;
    console.log(`[VIDEO WORKER] Starting transcription... (language: ${transcriptionLanguage || 'auto-detect'})`);
    const transcriptResult = await DeepgramService.transcribeFromUrl(signedAudioUrl, {
      language: transcriptionLanguage,
    });

    await job.updateProgress(70);

    // Store transcript with language and confidence metadata
    // Validates: Requirements 3.4, 3.8
    await updateVideoStatus(videoId, "analyzing", {
      transcript: transcriptResult.transcript,
      transcriptWords: transcriptResult.words,
      transcriptLanguage: transcriptResult.language,
      transcriptConfidence: transcriptResult.confidence,
    });

    console.log(`[VIDEO WORKER] Transcript stored with language: ${transcriptResult.language}, confidence: ${transcriptResult.confidence.toFixed(3)}`);

    // Check if clipping is disabled
    if (videoConfig?.skipClipping) {
      console.log(`[VIDEO WORKER] Clipping disabled, skipping viral detection`);
      await updateVideoStatus(videoId, "completed", {});
      await job.updateProgress(100);
      console.log(`[VIDEO WORKER] Uploaded video processing complete (no clipping): ${videoId}`);
      return;
    }

    // Detect viral clips using AI
    console.log(`[VIDEO WORKER] Detecting viral clips...`);
    
    // Apply timeframe filtering if configured
    const videoDuration = videoMetadata?.duration ?? 300;
    const timeframeStart = videoConfig?.timeframeStart ?? 0;
    const timeframeEnd = videoConfig?.timeframeEnd ?? videoDuration;
    
    // Filter transcript words to the configured timeframe
    const filteredWords = transcriptResult.words.filter(
      (w) => w.start >= timeframeStart && w.end <= timeframeEnd
    );
    
    // Build filtered transcript text
    const filteredTranscript = filteredWords.map((w) => w.word).join(" ");
    
    console.log(`[VIDEO WORKER] Processing timeframe: ${timeframeStart}s - ${timeframeEnd}s`);
    
    const viralClips = await ViralDetectionService.detectViralClips(
      filteredTranscript,
      filteredWords,
      {
        maxClips: 5,
        minDuration: videoConfig?.clipDurationMin ?? 15,
        maxDuration: videoConfig?.clipDurationMax ?? 60,
        videoTitle: videoRecord[0].title || undefined,
        genre: videoConfig?.genre ?? "Auto",
        customPrompt: videoConfig?.customPrompt ?? undefined,
        // Editing options from video config
        enableEmojis: false,
        enableIntroTitle: false,
      }
    );

    await job.updateProgress(90);

    // Save viral clips to database and queue clip generation with captions
    // Validates: Requirements 5.3, 5.4, 5.5, 5.8, 5.9
    if (viralClips.length > 0) {
      console.log(`[VIDEO WORKER] Saving ${viralClips.length} viral clips and queuing generation with captions...`);

      const clipRecords = viralClips.map((clip) => ({
        id: nanoid(),
        videoId: videoId,
        title: clip.title,
        introTitle: clip.introTitle,
        startTime: Math.round(clip.startTime), // Store as integer seconds
        endTime: Math.round(clip.endTime),     // Store as integer seconds
        duration: Math.round(clip.endTime - clip.startTime), // Calculate and store duration
        transcript: clip.transcript,
        transcriptWithEmojis: clip.transcriptWithEmojis,
        score: clip.viralityScore,             // Map viralityScore to score column
        viralityReason: clip.viralityReason,   // Store detailed viral reason
        hooks: clip.hooks,                     // Store hooks array as JSONB
        emotions: clip.emotions,               // Store emotions array as JSONB
        recommendedPlatforms: clip.recommendedPlatforms, // Store recommended platforms
        status: "detected" as const,           // Initial status is 'detected'
      }));

      await db.insert(viralClip).values(clipRecords);

      // Auto-generate clips with captions burned in
      // Extract words for each clip's time range and queue generation
      for (const clipRecord of clipRecords) {
        const clipWords = transcriptResult.words.filter(
          (w) => w.start >= clipRecord.startTime && w.end <= clipRecord.endTime
        );

        // Adjust word timings to be relative to clip start
        const adjustedWords = clipWords.map((w) => ({
          id: nanoid(8),
          word: w.word,
          start: Number((w.start - clipRecord.startTime).toFixed(3)),
          end: Number((w.end - clipRecord.startTime).toFixed(3)),
        }));

        // Get caption template from config or use default
        const templateId = videoConfig?.captionTemplateId ?? "classic";
        const template = getTemplateById(templateId) ?? CLASSIC_TEMPLATE;
        
        const captionStyle = {
          fontFamily: template.style.fontFamily,
          fontSize: template.style.fontSize,
          textColor: template.style.textColor,
          backgroundColor: template.style.backgroundColor,
          backgroundOpacity: template.style.backgroundOpacity,
          position: template.style.position,
          x: template.style.x,
          y: template.style.y,
          alignment: template.style.alignment,
          animation: template.style.animation,
          highlightColor: template.style.highlightColor,
          highlightEnabled: template.style.highlightEnabled,
          shadow: template.style.shadow,
          outline: template.style.outline,
          outlineColor: template.style.outlineColor,
          outlineWidth: template.style.outlineWidth,
          glowEnabled: template.style.glowEnabled,
          glowColor: template.style.glowColor,
          glowIntensity: template.style.glowIntensity,
          highlightScale: template.style.highlightScale,
          textTransform: template.style.textTransform,
          wordsPerLine: template.style.wordsPerLine,
        };

        // Save caption data to database for editing
        await ClipCaptionModel.create({
          clipId: clipRecord.id,
          words: adjustedWords,
          styleConfig: captionStyle,
          templateId: templateId,
        });

        // Get aspect ratio from config or use default
        const aspectRatio = (videoConfig?.aspectRatio ?? "9:16") as "9:16" | "16:9" | "1:1";

        // Queue clip generation with captions and intro title
        const ws = workspaceId ? await WorkspaceModel.getById(workspaceId) : null;
        const applyWatermark = getPlanConfig(ws?.plan || "free").limits.watermark;

        const captionsEnabled = videoConfig?.enableCaptions ?? true;
        // Emojis and intro title disabled for now
        const introTitleEnabled = false;
        const emojisEnabled = false;

        await addClipGenerationJob({
          clipId: clipRecord.id,
          videoId: videoId,
          workspaceId: "", // Will be populated from video record
          userId: userId,
          creditCost: 0, // Minutes already deducted at video level
          sourceType: "upload",
          storageKey: storageKey,
          startTime: clipRecord.startTime,
          endTime: clipRecord.endTime,
          aspectRatio: aspectRatio,
          quality: "1080p",
          watermark: applyWatermark,
          emojis: emojisEnabled ? (clipRecord.transcriptWithEmojis ?? undefined) : undefined,
          introTitle: introTitleEnabled ? (clipRecord.introTitle ?? undefined) : undefined,
          captions: captionsEnabled ? {
            words: adjustedWords,
            style: captionStyle,
          } : undefined,
        });

        console.log(`[VIDEO WORKER] Queued clip generation with captions: ${clipRecord.id}${clipRecord.introTitle ? ' (with intro title)' : ''}`);
      }
    }

    await updateVideoStatus(videoId, "completed", {});

    await job.updateProgress(100);
    console.log(
      `[VIDEO WORKER] Uploaded video processing complete: ${videoId}, found ${viralClips.length} viral clips (generation queued)`
    );

    // Send email notification when video processing is done
    try {
      const user = await UserModel.getById(userId);
      if (user?.email) {
        await emailService.sendVideoProcessedNotification({
          to: user.email,
          userName: user.name || user.email.split("@")[0],
          videoTitle: videoRecord[0].title || "Your video",
          clipCount: viralClips.length,
          videoId: videoId,
        });
        console.log(`[VIDEO WORKER] Email notification sent to: ${user.email}`);
      }
    } catch (emailError) {
      console.error(`[VIDEO WORKER] Failed to send email notification:`, emailError);
    }
  } catch (error) {
    console.error(`[VIDEO WORKER] Error processing uploaded video ${videoId}:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Report to Sentry with context
    if (error instanceof Error) {
      captureException(error, { videoId, sourceUrl, sourceType: "upload" });
    }

    // Refund minutes if they were deducted
    if (minutesDeducted > 0 && workspaceId) {
      try {
        await MinutesModel.refundMinutes({
          workspaceId,
          userId,
          videoId,
          amount: minutesDeducted,
          reason: `Refund for failed video processing - ${errorMessage}`,
        });
        console.log(`[VIDEO WORKER] Refunded ${minutesDeducted} minutes for workspace ${workspaceId}`);
      } catch (refundError) {
        console.error(`[VIDEO WORKER] Failed to refund minutes:`, refundError);
      }
    }

    await updateVideoStatus(videoId, "failed", { errorMessage });

    throw error;
  }
}

export function startVideoWorker(concurrency: number = 2) {
  console.log(`[VIDEO WORKER] Starting worker with concurrency: ${concurrency}`);

  const worker = createWorker<VideoProcessingJobData>(
    QUEUE_NAMES.VIDEO_PROCESSING,
    processVideoJob,
    concurrency
  );

  return worker;
}
