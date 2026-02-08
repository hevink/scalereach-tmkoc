import { db } from "../db";
import {
  videoTranslation,
  translatedClipCaption,
  TranslatedWord,
} from "../db/schema/translation.schema";
import { eq, and, desc } from "drizzle-orm";
import { performance } from "perf_hooks";

export class TranslationModel {
  private static logOperation(operation: string, details?: any) {
    console.log(
      `[TRANSLATION MODEL] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Create a new translation record
  static async create(params: {
    videoId: string;
    workspaceId: string;
    sourceLanguage: string;
    targetLanguage: string;
  }) {
    this.logOperation("CREATE", params);
    const startTime = performance.now();

    try {
      const result = await db
        .insert(videoTranslation)
        .values({
          id: this.generateId(),
          videoId: params.videoId,
          workspaceId: params.workspaceId,
          sourceLanguage: params.sourceLanguage,
          targetLanguage: params.targetLanguage,
          status: "pending",
        })
        .returning();

      const duration = performance.now() - startTime;
      console.log(
        `[TRANSLATION MODEL] CREATE completed in ${duration.toFixed(2)}ms`
      );

      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[TRANSLATION MODEL] CREATE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  // Get translation by ID
  static async getById(id: string) {
    this.logOperation("GET_BY_ID", { id });

    const result = await db
      .select()
      .from(videoTranslation)
      .where(eq(videoTranslation.id, id));

    return result[0] || null;
  }

  // Get all translations for a video
  static async getByVideoId(videoId: string) {
    this.logOperation("GET_BY_VIDEO_ID", { videoId });

    return db
      .select()
      .from(videoTranslation)
      .where(eq(videoTranslation.videoId, videoId))
      .orderBy(desc(videoTranslation.createdAt));
  }

  // Get translation for a specific video + language
  static async getByVideoAndLanguage(videoId: string, targetLanguage: string) {
    this.logOperation("GET_BY_VIDEO_AND_LANGUAGE", {
      videoId,
      targetLanguage,
    });

    const result = await db
      .select()
      .from(videoTranslation)
      .where(
        and(
          eq(videoTranslation.videoId, videoId),
          eq(videoTranslation.targetLanguage, targetLanguage)
        )
      );

    return result[0] || null;
  }

  // Count translations for a video
  static async countByVideoId(videoId: string): Promise<number> {
    const result = await db
      .select()
      .from(videoTranslation)
      .where(eq(videoTranslation.videoId, videoId));

    return result.length;
  }

  // Update translation status
  static async updateStatus(
    id: string,
    status: string,
    data?: {
      translatedTranscript?: string;
      translatedWords?: TranslatedWord[];
      error?: string;
      provider?: string;
      characterCount?: number;
    }
  ) {
    this.logOperation("UPDATE_STATUS", { id, status });
    const startTime = performance.now();

    try {
      const updateData: any = { status };
      if (data?.translatedTranscript !== undefined)
        updateData.translatedTranscript = data.translatedTranscript;
      if (data?.translatedWords !== undefined)
        updateData.translatedWords = data.translatedWords;
      if (data?.error !== undefined) updateData.error = data.error;
      if (data?.provider !== undefined) updateData.provider = data.provider;
      if (data?.characterCount !== undefined)
        updateData.characterCount = data.characterCount;

      await db
        .update(videoTranslation)
        .set(updateData)
        .where(eq(videoTranslation.id, id));

      const duration = performance.now() - startTime;
      console.log(
        `[TRANSLATION MODEL] UPDATE_STATUS completed in ${duration.toFixed(2)}ms`
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[TRANSLATION MODEL] UPDATE_STATUS failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  // Delete a translation and its clip captions
  static async delete(id: string) {
    this.logOperation("DELETE", { id });

    await db
      .delete(translatedClipCaption)
      .where(eq(translatedClipCaption.translationId, id));

    await db
      .delete(videoTranslation)
      .where(eq(videoTranslation.id, id));
  }

  // Delete all translations for a video
  static async deleteByVideoId(videoId: string) {
    this.logOperation("DELETE_BY_VIDEO_ID", { videoId });

    // Get all translation IDs for this video
    const translations = await db
      .select({ id: videoTranslation.id })
      .from(videoTranslation)
      .where(eq(videoTranslation.videoId, videoId));

    for (const t of translations) {
      await db
        .delete(translatedClipCaption)
        .where(eq(translatedClipCaption.translationId, t.id));
    }

    await db
      .delete(videoTranslation)
      .where(eq(videoTranslation.videoId, videoId));
  }

  // Save translated clip captions
  static async saveClipCaptions(params: {
    clipId: string;
    translationId: string;
    targetLanguage: string;
    words: TranslatedWord[];
    styleConfig?: any;
  }) {
    this.logOperation("SAVE_CLIP_CAPTIONS", {
      clipId: params.clipId,
      targetLanguage: params.targetLanguage,
    });

    const result = await db
      .insert(translatedClipCaption)
      .values({
        id: this.generateId(),
        clipId: params.clipId,
        translationId: params.translationId,
        targetLanguage: params.targetLanguage,
        words: params.words,
        styleConfig: params.styleConfig,
      })
      .onConflictDoNothing()
      .returning();

    return result[0];
  }

  // Get translated captions for a clip in a specific language
  static async getClipCaptions(clipId: string, targetLanguage: string) {
    this.logOperation("GET_CLIP_CAPTIONS", { clipId, targetLanguage });

    const result = await db
      .select()
      .from(translatedClipCaption)
      .where(
        and(
          eq(translatedClipCaption.clipId, clipId),
          eq(translatedClipCaption.targetLanguage, targetLanguage)
        )
      );

    return result[0] || null;
  }

  // Get all translated captions for a clip
  static async getAllClipCaptions(clipId: string) {
    this.logOperation("GET_ALL_CLIP_CAPTIONS", { clipId });

    return db
      .select()
      .from(translatedClipCaption)
      .where(eq(translatedClipCaption.clipId, clipId));
  }
}
