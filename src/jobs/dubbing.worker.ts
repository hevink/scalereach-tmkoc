import { Job } from "bullmq";
import { createWorker, createRedisConnection } from "./queue";
import { Queue } from "bullmq";
import { DubbingModel } from "../models/dubbing.model";
import { TranslationModel } from "../models/translation.model";
import { TTSService } from "../services/tts.service";
import { AudioMixingService } from "../services/audio-mixing.service";
import { R2Service } from "../services/r2.service";
import { db } from "../db";
import { video, viralClip } from "../db/schema/project.schema";
import { eq } from "drizzle-orm";

export const DUBBING_QUEUE_NAME = "voice-dubbing";

export interface DubbingJobData {
  dubbingId: string;
  translationId: string;
  videoId: string;
  workspaceId: string;
  targetLanguage: string;
  voiceId: string;
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  ttsProvider: string;
  audioMode: "replace" | "duck";
  duckVolume: number;
}

export const dubbingQueue = new Queue<DubbingJobData>(DUBBING_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 10000,
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
});

export async function addDubbingJob(data: DubbingJobData) {
  console.log(
    `[QUEUE] Adding dubbing job for dubbing: ${data.dubbingId}`
  );

  const job = await dubbingQueue.add("dub-video", data, {
    jobId: `dubbing-${data.dubbingId}`,
  });

  console.log(`[QUEUE] Dubbing job added with ID: ${job.id}`);
  return job;
}

/**
 * Group translated words into sentence segments for TTS.
 * Splits on sentence-ending punctuation or when gap between words > 1s.
 */
function groupIntoSegments(
  words: Array<{ word: string; start: number; end: number }>
): Array<{ text: string; startTime: number; endTime: number }> {
  if (words.length === 0) return [];

  const segments: Array<{ text: string; startTime: number; endTime: number }> = [];
  let currentWords: typeof words = [];

  for (let i = 0; i < words.length; i++) {
    currentWords.push(words[i]);

    const isLast = i === words.length - 1;
    const endsWithPunctuation = /[.!?。！？]$/.test(words[i].word.trim());
    const hasLargeGap =
      !isLast && words[i + 1].start - words[i].end > 1.0;

    if (isLast || endsWithPunctuation || hasLargeGap) {
      if (currentWords.length > 0) {
        segments.push({
          text: currentWords.map((w) => w.word).join(" "),
          startTime: currentWords[0].start,
          endTime: currentWords[currentWords.length - 1].end,
        });
        currentWords = [];
      }
    }
  }

  return segments;
}

/**
 * Dubbing worker processor - full pipeline
 */
async function processDubbingJob(job: Job<DubbingJobData>) {
  const {
    dubbingId,
    translationId,
    videoId,
    targetLanguage,
    voiceId,
    voiceSettings,
    ttsProvider,
    audioMode,
    duckVolume,
  } = job.data;

  console.log(
    `[DUBBING WORKER] Processing dubbing ${dubbingId}: ${targetLanguage}`
  );

  try {
    // [0-5%] Set status to generating_tts
    await DubbingModel.updateStatus(dubbingId, "generating_tts", { progress: 0 });
    await job.updateProgress(2);

    // Fetch translated words from translation
    const translation = await TranslationModel.getById(translationId);
    if (!translation?.translatedWords) {
      throw new Error("Translation has no translated words");
    }

    const translatedWords = translation.translatedWords as Array<{
      word: string;
      start: number;
      end: number;
    }>;

    // [5-10%] Group into sentence segments
    const segments = groupIntoSegments(translatedWords);
    if (segments.length === 0) {
      throw new Error("No segments could be generated from translated words");
    }

    console.log(
      `[DUBBING WORKER] Generated ${segments.length} segments for TTS`
    );

    await DubbingModel.updateStatus(dubbingId, "generating_tts", {
      progress: 5,
      totalSegments: segments.length,
      processedSegments: 0,
    });
    await job.updateProgress(5);

    // Get video duration for total track length
    const videoResult = await db
      .select({
        durationSeconds: video.duration,
        audioStorageKey: video.audioStorageKey,
      })
      .from(video)
      .where(eq(video.id, videoId));

    const videoData = videoResult[0];
    if (!videoData?.durationSeconds) {
      throw new Error("Video duration not found");
    }

    // [10-70%] Generate TTS for each segment
    let totalCharacters = 0;
    const ttsSegments: Array<{
      audio: Buffer;
      startTime: number;
      endTime: number;
    }> = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      console.log(
        `[DUBBING WORKER] Generating TTS segment ${i + 1}/${segments.length}: "${seg.text.slice(0, 50)}..."`
      );

      // Generate TTS audio
      const ttsAudio = await TTSService.generateSegment(ttsProvider, {
        text: seg.text,
        voiceId,
        voiceSettings,
        language: targetLanguage,
      });

      totalCharacters += seg.text.length;

      // Get TTS audio duration
      const ttsDuration = await AudioMixingService.getAudioDuration(ttsAudio);
      const targetDuration = seg.endTime - seg.startTime;

      // Time-stretch to match original segment timing
      let stretchedAudio: Buffer;
      if (ttsDuration > 0 && targetDuration > 0) {
        stretchedAudio = await AudioMixingService.timeStretch(
          ttsAudio,
          ttsDuration,
          targetDuration
        );
      } else {
        stretchedAudio = ttsAudio;
      }

      ttsSegments.push({
        audio: stretchedAudio,
        startTime: seg.startTime,
        endTime: seg.endTime,
      });

      // Update progress proportionally (10-70%)
      const segProgress = 10 + Math.round(((i + 1) / segments.length) * 60);
      await DubbingModel.updateProgress(dubbingId, segProgress, i + 1);
      await job.updateProgress(segProgress);
    }

    // [70-80%] Concatenate all segments with silence padding
    console.log(`[DUBBING WORKER] Concatenating ${ttsSegments.length} TTS segments`);
    const concatenatedTTS = await AudioMixingService.concatenateWithTiming(
      ttsSegments,
      videoData.durationSeconds
    );

    // Upload TTS-only track to R2
    const ttsKey = `dubbing/${videoId}/${dubbingId}-tts.mp3`;
    const ttsUpload = await R2Service.uploadFile(
      ttsKey,
      concatenatedTTS,
      "audio/mpeg"
    );

    await DubbingModel.updateStatus(dubbingId, "mixing_audio", {
      progress: 75,
      dubbedAudioKey: ttsUpload.key,
      dubbedAudioUrl: ttsUpload.url,
      ttsCharactersUsed: totalCharacters,
    });
    await job.updateProgress(75);

    // [80-90%] Mix with original audio
    console.log(`[DUBBING WORKER] Mixing audio (mode: ${audioMode})`);
    let mixedAudio: Buffer;

    if (audioMode === "duck" && videoData.audioStorageKey) {
      // Download original audio from R2
      const originalAudioUrl = R2Service.getPublicUrl(videoData.audioStorageKey);
      const originalResponse = await fetch(originalAudioUrl);
      if (!originalResponse.ok) {
        throw new Error(`Failed to download original audio: ${originalResponse.status}`);
      }
      const originalAudio = Buffer.from(await originalResponse.arrayBuffer());

      mixedAudio = await AudioMixingService.mixAudio({
        originalAudio,
        dubbedAudio: concatenatedTTS,
        mode: "duck",
        duckVolume,
      });
    } else {
      // Replace mode or no original audio available
      mixedAudio = concatenatedTTS;
    }

    // Upload mixed track to R2
    const mixedKey = `dubbing/${videoId}/${dubbingId}-mixed.aac`;
    const mixedUpload = await R2Service.uploadFile(
      mixedKey,
      mixedAudio,
      "audio/aac"
    );

    await DubbingModel.updateStatus(dubbingId, "mixing_audio", {
      progress: 85,
      mixedAudioKey: mixedUpload.key,
      mixedAudioUrl: mixedUpload.url,
    });
    await job.updateProgress(85);

    // [90-95%] Slice mixed audio for each clip
    console.log(`[DUBBING WORKER] Generating clip audio slices`);
    const clips = await db
      .select({
        id: viralClip.id,
        startTime: viralClip.startTime,
        endTime: viralClip.endTime,
      })
      .from(viralClip)
      .where(eq(viralClip.videoId, videoId));

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      try {
        const clipAudio = await AudioMixingService.sliceAudio(
          mixedAudio,
          clip.startTime,
          clip.endTime
        );

        const clipAudioKey = `dubbing/${videoId}/clips/${clip.id}-${dubbingId}.aac`;
        const clipUpload = await R2Service.uploadFile(
          clipAudioKey,
          clipAudio,
          "audio/aac"
        );

        await DubbingModel.saveClipAudio({
          clipId: clip.id,
          dubbingId,
          targetLanguage,
          audioKey: clipUpload.key,
          audioUrl: clipUpload.url,
          durationSeconds: clip.endTime - clip.startTime,
        });
      } catch (clipError) {
        console.warn(
          `[DUBBING WORKER] Failed to generate clip audio for ${clip.id}:`,
          clipError
        );
      }

      const clipProgress = 90 + Math.round(((i + 1) / clips.length) * 5);
      await job.updateProgress(clipProgress);
    }

    // [95-100%] Mark as completed
    await DubbingModel.updateStatus(dubbingId, "completed", {
      progress: 100,
      durationSeconds: videoData.durationSeconds,
      ttsCharactersUsed: totalCharacters,
    });
    await job.updateProgress(100);

    console.log(
      `[DUBBING WORKER] Dubbing ${dubbingId} completed successfully (${totalCharacters} chars, ${segments.length} segments)`
    );
  } catch (error: any) {
    console.error(
      `[DUBBING WORKER] Dubbing ${dubbingId} failed:`,
      error.message
    );

    await DubbingModel.updateStatus(dubbingId, "failed", {
      error: error.message,
    });

    throw error;
  }
}

/**
 * Start the dubbing worker
 */
export function startDubbingWorker(concurrency: number = 1) {
  console.log(`[DUBBING WORKER] Starting dubbing worker with concurrency: ${concurrency}`);

  const worker = createWorker<DubbingJobData>(
    DUBBING_QUEUE_NAME,
    processDubbingJob,
    concurrency
  );

  console.log("[DUBBING WORKER] Dubbing worker started");
  return worker;
}
