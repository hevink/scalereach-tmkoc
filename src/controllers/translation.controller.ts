import { Context } from "hono";
import { TranslationModel } from "../models/translation.model";
import { TranslationService, TRANSLATION_LANGUAGES } from "../services/translation.service";
import { WorkspaceModel } from "../models/workspace.model";
import { getPlanConfig } from "../config/plan-config";
import { addTranslationJob } from "../jobs/translation.worker";
import { db } from "../db";
import { video } from "../db/schema/project.schema";
import { eq } from "drizzle-orm";

export class TranslationController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[TRANSLATION CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  // Start a translation for a video
  static async startTranslation(c: Context) {
    const videoId = c.req.param("videoId");
    TranslationController.logRequest(c, "START_TRANSLATION", { videoId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = await c.req.json();
      const { targetLanguage } = body;

      if (!targetLanguage) {
        return c.json({ error: "targetLanguage is required" }, 400);
      }

      if (!TranslationService.isSupported(targetLanguage)) {
        return c.json({ error: "Unsupported target language" }, 400);
      }

      // Get video to find workspace and source language
      const videoResult = await db
        .select({
          id: video.id,
          workspaceId: video.workspaceId,
          transcriptLanguage: video.transcriptLanguage,
          status: video.status,
        })
        .from(video)
        .where(eq(video.id, videoId));

      const videoData = videoResult[0];
      if (!videoData) {
        return c.json({ error: "Video not found" }, 404);
      }

      if (videoData.status !== "completed") {
        return c.json({ error: "Video must be fully processed before translation" }, 400);
      }

      const workspaceId = videoData.workspaceId;
      if (!workspaceId) {
        return c.json({ error: "Video has no workspace" }, 400);
      }

      // Check workspace membership
      const members = await WorkspaceModel.getMembers(workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      // Check plan translation limits
      const ws = await WorkspaceModel.getById(workspaceId);
      const plan = ws?.plan || "free";
      const planConfig = getPlanConfig(plan);
      const translationLimit = (planConfig as any).translationsPerVideo ?? 1;

      if (translationLimit !== -1) {
        const existingCount = await TranslationModel.countByVideoId(videoId);
        if (existingCount >= translationLimit) {
          return c.json(
            {
              error: "Translation limit reached for this video",
              limit: translationLimit,
              current: existingCount,
              upgrade: true,
            },
            403
          );
        }
      }

      const sourceLanguage = videoData.transcriptLanguage || "en";

      if (sourceLanguage === targetLanguage) {
        return c.json({ error: "Source and target language cannot be the same" }, 400);
      }

      // Check if translation already exists
      const existing = await TranslationModel.getByVideoAndLanguage(
        videoId,
        targetLanguage
      );
      if (existing) {
        if (existing.status === "completed") {
          return c.json({ error: "Translation already exists for this language" }, 409);
        }
        if (existing.status === "translating" || existing.status === "pending") {
          return c.json({ error: "Translation is already in progress" }, 409);
        }
        // If failed, delete and retry
        await TranslationModel.delete(existing.id);
      }

      // Create translation record
      const translation = await TranslationModel.create({
        videoId,
        workspaceId,
        sourceLanguage,
        targetLanguage,
      });

      // Queue translation job
      await addTranslationJob({
        translationId: translation.id,
        videoId,
        workspaceId,
        sourceLanguage,
        targetLanguage,
      });

      return c.json(translation, 201);
    } catch (error) {
      console.error(`[TRANSLATION CONTROLLER] START_TRANSLATION error:`, error);
      return c.json({ error: "Failed to start translation" }, 500);
    }
  }

  // Get all translations for a video
  static async getTranslations(c: Context) {
    const videoId = c.req.param("videoId");
    TranslationController.logRequest(c, "GET_TRANSLATIONS", { videoId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Get video to check workspace access
      const videoResult = await db
        .select({ workspaceId: video.workspaceId })
        .from(video)
        .where(eq(video.id, videoId));

      const videoData = videoResult[0];
      if (!videoData?.workspaceId) {
        return c.json({ error: "Video not found" }, 404);
      }

      const members = await WorkspaceModel.getMembers(videoData.workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      const translations = await TranslationModel.getByVideoId(videoId);
      return c.json(translations);
    } catch (error) {
      console.error(`[TRANSLATION CONTROLLER] GET_TRANSLATIONS error:`, error);
      return c.json({ error: "Failed to get translations" }, 500);
    }
  }

  // Get a specific translation by video + language
  static async getTranslation(c: Context) {
    const videoId = c.req.param("videoId");
    const lang = c.req.param("lang");
    TranslationController.logRequest(c, "GET_TRANSLATION", { videoId, lang });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const videoResult = await db
        .select({ workspaceId: video.workspaceId })
        .from(video)
        .where(eq(video.id, videoId));

      const videoData = videoResult[0];
      if (!videoData?.workspaceId) {
        return c.json({ error: "Video not found" }, 404);
      }

      const members = await WorkspaceModel.getMembers(videoData.workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      const translation = await TranslationModel.getByVideoAndLanguage(
        videoId,
        lang
      );
      if (!translation) {
        return c.json({ error: "Translation not found" }, 404);
      }

      return c.json(translation);
    } catch (error) {
      console.error(`[TRANSLATION CONTROLLER] GET_TRANSLATION error:`, error);
      return c.json({ error: "Failed to get translation" }, 500);
    }
  }

  // Delete a translation
  static async deleteTranslation(c: Context) {
    const translationId = c.req.param("translationId");
    TranslationController.logRequest(c, "DELETE_TRANSLATION", { translationId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const translation = await TranslationModel.getById(translationId);
      if (!translation) {
        return c.json({ error: "Translation not found" }, 404);
      }

      // Check workspace access
      const members = await WorkspaceModel.getMembers(translation.workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      await TranslationModel.delete(translationId);
      return c.json({ success: true });
    } catch (error) {
      console.error(`[TRANSLATION CONTROLLER] DELETE_TRANSLATION error:`, error);
      return c.json({ error: "Failed to delete translation" }, 500);
    }
  }

  // Get supported languages
  static async getSupportedLanguages(c: Context) {
    TranslationController.logRequest(c, "GET_SUPPORTED_LANGUAGES");

    return c.json(TranslationService.getSupportedLanguages());
  }

  // Get translated captions for a clip
  static async getClipTranslatedCaptions(c: Context) {
    const clipId = c.req.param("clipId");
    const lang = c.req.param("lang");
    TranslationController.logRequest(c, "GET_CLIP_TRANSLATED_CAPTIONS", {
      clipId,
      lang,
    });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const captions = await TranslationModel.getClipCaptions(clipId, lang);
      if (!captions) {
        return c.json({ error: "Translated captions not found" }, 404);
      }

      return c.json(captions);
    } catch (error) {
      console.error(
        `[TRANSLATION CONTROLLER] GET_CLIP_TRANSLATED_CAPTIONS error:`,
        error
      );
      return c.json({ error: "Failed to get translated captions" }, 500);
    }
  }

  // Get all translated caption languages for a clip
  static async getClipTranslationLanguages(c: Context) {
    const clipId = c.req.param("clipId");
    TranslationController.logRequest(c, "GET_CLIP_TRANSLATION_LANGUAGES", {
      clipId,
    });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const captions = await TranslationModel.getAllClipCaptions(clipId);
      const languages = captions.map((cap) => ({
        language: cap.targetLanguage,
        name: TRANSLATION_LANGUAGES[cap.targetLanguage as keyof typeof TRANSLATION_LANGUAGES] || cap.targetLanguage,
      }));

      return c.json(languages);
    } catch (error) {
      console.error(
        `[TRANSLATION CONTROLLER] GET_CLIP_TRANSLATION_LANGUAGES error:`,
        error
      );
      return c.json({ error: "Failed to get translation languages" }, 500);
    }
  }
}
