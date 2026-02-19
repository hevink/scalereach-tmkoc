import { db } from "../db";
import {
  voiceDubbing,
  dubbedClipAudio,
} from "../db/schema/dubbing.schema";
import { eq, and, desc } from "drizzle-orm";
import { performance } from "perf_hooks";

export class DubbingModel {
  private static logOperation(operation: string, details?: any) {
    console.log(
      `[DUBBING MODEL] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Create a new dubbing record
  static async create(params: {
    translationId: string;
    videoId: string;
    workspaceId: string;
    targetLanguage: string;
    ttsProvider?: string;
    voiceId: string;
    voiceName?: string;
    voiceSettings?: any;
    audioMode: "replace" | "duck";
    duckVolume?: number;
  }) {
    this.logOperation("CREATE", params);
    const startTime = performance.now();

    try {
      const result = await db
        .insert(voiceDubbing)
        .values({
          id: this.generateId(),
          translationId: params.translationId,
          videoId: params.videoId,
          workspaceId: params.workspaceId,
          targetLanguage: params.targetLanguage,
          ttsProvider: params.ttsProvider || "elevenlabs",
          voiceId: params.voiceId,
          voiceName: params.voiceName,
          voiceSettings: params.voiceSettings,
          audioMode: params.audioMode,
          duckVolume: params.duckVolume ?? 0.15,
          status: "pending",
        })
        .returning();

      const duration = performance.now() - startTime;
      console.log(
        `[DUBBING MODEL] CREATE completed in ${duration.toFixed(2)}ms`
      );

      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[DUBBING MODEL] CREATE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  // Get dubbing by ID
  static async getById(id: string) {
    this.logOperation("GET_BY_ID", { id });

    const result = await db
      .select()
      .from(voiceDubbing)
      .where(eq(voiceDubbing.id, id));

    return result[0] || null;
  }

  // Get all dubbings for a video
  static async getByVideoId(videoId: string) {
    this.logOperation("GET_BY_VIDEO_ID", { videoId });

    return db
      .select()
      .from(voiceDubbing)
      .where(eq(voiceDubbing.videoId, videoId))
      .orderBy(desc(voiceDubbing.createdAt));
  }

  // Get dubbing by translation ID
  static async getByTranslationId(translationId: string) {
    this.logOperation("GET_BY_TRANSLATION_ID", { translationId });

    const result = await db
      .select()
      .from(voiceDubbing)
      .where(eq(voiceDubbing.translationId, translationId));

    return result[0] || null;
  }

  // Update dubbing status and optional fields
  static async updateStatus(
    id: string,
    status: string,
    data?: {
      error?: string;
      progress?: number;
      totalSegments?: number;
      processedSegments?: number;
      dubbedAudioKey?: string;
      dubbedAudioUrl?: string;
      mixedAudioKey?: string;
      mixedAudioUrl?: string;
      durationSeconds?: number;
      ttsCharactersUsed?: number;
    }
  ) {
    this.logOperation("UPDATE_STATUS", { id, status });
    const startTime = performance.now();

    try {
      const updateData: any = { status };
      if (data?.error !== undefined) updateData.error = data.error;
      if (data?.progress !== undefined) updateData.progress = data.progress;
      if (data?.totalSegments !== undefined) updateData.totalSegments = data.totalSegments;
      if (data?.processedSegments !== undefined) updateData.processedSegments = data.processedSegments;
      if (data?.dubbedAudioKey !== undefined) updateData.dubbedAudioKey = data.dubbedAudioKey;
      if (data?.dubbedAudioUrl !== undefined) updateData.dubbedAudioUrl = data.dubbedAudioUrl;
      if (data?.mixedAudioKey !== undefined) updateData.mixedAudioKey = data.mixedAudioKey;
      if (data?.mixedAudioUrl !== undefined) updateData.mixedAudioUrl = data.mixedAudioUrl;
      if (data?.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
      if (data?.ttsCharactersUsed !== undefined) updateData.ttsCharactersUsed = data.ttsCharactersUsed;

      await db
        .update(voiceDubbing)
        .set(updateData)
        .where(eq(voiceDubbing.id, id));

      const duration = performance.now() - startTime;
      console.log(
        `[DUBBING MODEL] UPDATE_STATUS completed in ${duration.toFixed(2)}ms`
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[DUBBING MODEL] UPDATE_STATUS failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  // Update progress only
  static async updateProgress(id: string, progress: number, processedSegments?: number) {
    const updateData: any = { progress };
    if (processedSegments !== undefined) updateData.processedSegments = processedSegments;

    await db
      .update(voiceDubbing)
      .set(updateData)
      .where(eq(voiceDubbing.id, id));
  }

  // Delete a dubbing and its clip audios
  static async delete(id: string) {
    this.logOperation("DELETE", { id });

    await db
      .delete(dubbedClipAudio)
      .where(eq(dubbedClipAudio.dubbingId, id));

    await db
      .delete(voiceDubbing)
      .where(eq(voiceDubbing.id, id));
  }

  // Save dubbed clip audio
  static async saveClipAudio(params: {
    clipId: string;
    dubbingId: string;
    targetLanguage: string;
    audioKey?: string;
    audioUrl?: string;
    durationSeconds?: number;
  }) {
    this.logOperation("SAVE_CLIP_AUDIO", {
      clipId: params.clipId,
      dubbingId: params.dubbingId,
    });

    const result = await db
      .insert(dubbedClipAudio)
      .values({
        id: this.generateId(),
        clipId: params.clipId,
        dubbingId: params.dubbingId,
        targetLanguage: params.targetLanguage,
        audioKey: params.audioKey,
        audioUrl: params.audioUrl,
        durationSeconds: params.durationSeconds,
      })
      .onConflictDoNothing()
      .returning();

    return result[0];
  }

  // Get dubbed audio for a clip + dubbing
  static async getClipAudio(clipId: string, dubbingId: string) {
    this.logOperation("GET_CLIP_AUDIO", { clipId, dubbingId });

    const result = await db
      .select()
      .from(dubbedClipAudio)
      .where(
        and(
          eq(dubbedClipAudio.clipId, clipId),
          eq(dubbedClipAudio.dubbingId, dubbingId)
        )
      );

    return result[0] || null;
  }

  // Get all dubbed audios for a clip
  static async getAllClipAudios(clipId: string) {
    this.logOperation("GET_ALL_CLIP_AUDIOS", { clipId });

    return db
      .select()
      .from(dubbedClipAudio)
      .where(eq(dubbedClipAudio.clipId, clipId));
  }

  static async getClipAudioKeysByDubbingId(dubbingId: string) {
    return db
      .select({ audioKey: dubbedClipAudio.audioKey })
      .from(dubbedClipAudio)
      .where(eq(dubbedClipAudio.dubbingId, dubbingId));
  }
}
