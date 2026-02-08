import { Job } from "bullmq";
import { createWorker, redisConnection } from "./queue";
import { Queue } from "bullmq";
import { TranslationModel } from "../models/translation.model";
import { TranslationService } from "../services/translation.service";
import { db } from "../db";
import { video, viralClip } from "../db/schema/project.schema";
import { eq } from "drizzle-orm";

export const TRANSLATION_QUEUE_NAME = "video-translation";

export interface TranslationJobData {
  translationId: string;
  videoId: string;
  workspaceId: string;
  sourceLanguage: string;
  targetLanguage: string;
}

// Create the translation queue
const redisConfig: any = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

if (
  process.env.REDIS_TLS === "true" ||
  (process.env.REDIS_HOST || "").includes("upstash.io")
) {
  redisConfig.tls = {};
}

export const translationQueue = new Queue<TranslationJobData>(
  TRANSLATION_QUEUE_NAME,
  {
    connection: redisConfig,
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

export async function addTranslationJob(data: TranslationJobData) {
  console.log(
    `[QUEUE] Adding translation job for translation: ${data.translationId}`
  );

  const job = await translationQueue.add("translate-video", data, {
    jobId: `translation-${data.translationId}`,
  });

  console.log(`[QUEUE] Translation job added with ID: ${job.id}`);
  return job;
}

/**
 * Translation worker processor
 */
async function processTranslationJob(job: Job<TranslationJobData>) {
  const { translationId, videoId, sourceLanguage, targetLanguage } = job.data;

  console.log(
    `[TRANSLATION WORKER] Processing translation ${translationId}: ${sourceLanguage} → ${targetLanguage}`
  );

  try {
    // Update status to translating
    await TranslationModel.updateStatus(translationId, "translating");
    await job.updateProgress(10);

    // Fetch video transcript words
    const videoResult = await db
      .select({
        transcript: video.transcript,
        transcriptWords: video.transcriptWords,
        transcriptLanguage: video.transcriptLanguage,
      })
      .from(video)
      .where(eq(video.id, videoId));

    const videoData = videoResult[0];
    if (!videoData?.transcriptWords) {
      throw new Error("Video transcript not found");
    }

    const words = videoData.transcriptWords as Array<{
      word: string;
      start: number;
      end: number;
    }>;

    if (words.length === 0) {
      throw new Error("Video transcript has no words");
    }

    await job.updateProgress(20);

    // Translate the full transcript with timing re-alignment
    const { translatedText, translatedWords } =
      await TranslationService.translateTranscript(
        words,
        sourceLanguage,
        targetLanguage
      );

    await job.updateProgress(60);

    // Save translation result
    await TranslationModel.updateStatus(translationId, "translating", {
      translatedTranscript: translatedText,
      translatedWords,
      provider: "deepl",
      characterCount: translatedText.length,
    });

    await job.updateProgress(70);

    // Get all clips for this video
    const clips = await db
      .select({
        id: viralClip.id,
        startTime: viralClip.startTime,
        endTime: viralClip.endTime,
      })
      .from(viralClip)
      .where(eq(viralClip.videoId, videoId));

    console.log(
      `[TRANSLATION WORKER] Generating translated captions for ${clips.length} clips`
    );

    // Get language-specific style overrides
    const styleOverrides =
      TranslationService.getLanguageStyleOverrides(targetLanguage);

    // Generate translated captions for each clip
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];

      // Filter translated words that fall within this clip's time range
      const clipWords = translatedWords.filter(
        (w) => w.start >= clip.startTime && w.end <= clip.endTime
      );

      if (clipWords.length > 0) {
        await TranslationModel.saveClipCaptions({
          clipId: clip.id,
          translationId,
          targetLanguage,
          words: clipWords,
          styleConfig: Object.keys(styleOverrides).length > 0
            ? styleOverrides
            : undefined,
        });
      }

      // Update progress proportionally
      const clipProgress = 70 + Math.round(((i + 1) / clips.length) * 25);
      await job.updateProgress(clipProgress);
    }

    // Mark translation as completed
    await TranslationModel.updateStatus(translationId, "completed");
    await job.updateProgress(100);

    console.log(
      `[TRANSLATION WORKER] Translation ${translationId} completed successfully`
    );
  } catch (error: any) {
    console.error(
      `[TRANSLATION WORKER] Translation ${translationId} failed:`,
      error.message
    );

    await TranslationModel.updateStatus(translationId, "failed", {
      error: error.message,
    });

    throw error;
  }
}

/**
 * Start the translation worker
 */
export function startTranslationWorker() {
  console.log("[TRANSLATION WORKER] Starting translation worker...");

  const worker = createWorker<TranslationJobData>(
    TRANSLATION_QUEUE_NAME,
    processTranslationJob,
    1 // concurrency: 1 (translation is API-bound, not CPU-bound)
  );

  console.log("[TRANSLATION WORKER] Translation worker started");
  return worker;
}
