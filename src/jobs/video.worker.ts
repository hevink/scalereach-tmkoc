import { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { video, viralClip } from "../db/schema";
import { YouTubeService } from "../services/youtube.service";
import { R2Service } from "../services/r2.service";
import { DeepgramService } from "../services/deepgram.service";
import { ViralDetectionService } from "../services/viral-detection.service";
import {
  createWorker,
  QUEUE_NAMES,
  VideoProcessingJobData,
} from "./queue";

async function updateVideoStatus(
  videoId: string,
  status: "pending" | "downloading" | "uploading" | "transcribing" | "analyzing" | "completed" | "failed",
  updates: Partial<{
    storageKey: string;
    storageUrl: string;
    title: string;
    duration: number;
    fileSize: number;
    mimeType: string;
    metadata: any;
    errorMessage: string;
    transcript: string;
    transcriptWords: any[];
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

  try {
    await updateVideoStatus(videoId, "downloading");
    await job.updateProgress(10);

    // Get audio stream directly from YouTube
    const { stream, videoInfo, mimeType } = await YouTubeService.streamAudio(sourceUrl);

    await job.updateProgress(30);
    console.log(`[VIDEO WORKER] Audio stream started, uploading to R2...`);

    await updateVideoStatus(videoId, "uploading", {
      title: videoInfo.title,
      duration: videoInfo.duration,
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
    const { url: storageUrl } = await R2Service.uploadFromStream(
      storageKey,
      stream,
      mimeType
    );

    await job.updateProgress(60);

    await updateVideoStatus(videoId, "transcribing", {
      storageKey,
      storageUrl,
    });

    // Get signed URL for Deepgram (R2 files may not be publicly accessible)
    const signedUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);

    // Transcribe audio using Deepgram
    console.log(`[VIDEO WORKER] Starting transcription...`);
    const transcriptResult = await DeepgramService.transcribeFromUrl(signedUrl);

    await job.updateProgress(70);

    await updateVideoStatus(videoId, "analyzing", {
      transcript: transcriptResult.transcript,
      transcriptWords: transcriptResult.words,
    });

    // Detect viral clips using AI
    console.log(`[VIDEO WORKER] Detecting viral clips...`);
    const viralClips = await ViralDetectionService.detectViralClips(
      transcriptResult.transcript,
      transcriptResult.words,
      {
        maxClips: 5,
        minDuration: 15,
        maxDuration: 60,
        videoTitle: videoInfo.title,
      }
    );

    await job.updateProgress(90);

    // Save viral clips to database
    if (viralClips.length > 0) {
      console.log(`[VIDEO WORKER] Saving ${viralClips.length} viral clips...`);

      const clipRecords = viralClips.map((clip) => ({
        id: nanoid(),
        videoId: videoId,
        title: clip.title,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.endTime - clip.startTime,
        transcript: clip.transcript,
        viralityScore: clip.viralityScore,
        viralityReason: clip.viralityReason,
        hooks: clip.hooks,
        emotions: clip.emotions,
        status: "pending" as const,
      }));

      await db.insert(viralClip).values(clipRecords);
    }

    await updateVideoStatus(videoId, "completed", {});

    await job.updateProgress(100);
    console.log(`[VIDEO WORKER] Video processing complete: ${videoId}, found ${viralClips.length} viral clips`);
  } catch (error) {
    console.error(`[VIDEO WORKER] Error processing video ${videoId}:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
      console.log(`[VIDEO WORKER] Direct upload processing not implemented yet`);
      break;
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
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
