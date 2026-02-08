import { Context } from "hono";
import { DubbingModel } from "../models/dubbing.model";
import { TranslationModel } from "../models/translation.model";
import { TTSService } from "../services/tts.service";
import { WorkspaceModel } from "../models/workspace.model";
import { MinutesModel } from "../models/minutes.model";
import { getPlanConfig, calculateMinuteConsumption } from "../config/plan-config";
import { addDubbingJob } from "../jobs/dubbing.worker";
import { R2Service } from "../services/r2.service";
import { db } from "../db";
import { video } from "../db/schema/project.schema";
import { eq } from "drizzle-orm";

export class DubbingController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[DUBBING CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  // Start dubbing for a translation
  static async startDubbing(c: Context) {
    const translationId = c.req.param("translationId");
    DubbingController.logRequest(c, "START_DUBBING", { translationId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = await c.req.json();
      const { voiceId, voiceName, voiceSettings, audioMode, duckVolume } = body;

      if (!voiceId) {
        return c.json({ error: "voiceId is required" }, 400);
      }

      if (audioMode && !["replace", "duck"].includes(audioMode)) {
        return c.json({ error: "audioMode must be 'replace' or 'duck'" }, 400);
      }

      // Get translation
      const translation = await TranslationModel.getById(translationId);
      if (!translation) {
        return c.json({ error: "Translation not found" }, 404);
      }

      if (translation.status !== "completed") {
        return c.json({ error: "Translation must be completed before dubbing" }, 400);
      }

      const workspaceId = translation.workspaceId;

      // Check workspace membership
      const members = await WorkspaceModel.getMembers(workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      // Check plan limits for dubbing
      const ws = await WorkspaceModel.getById(workspaceId);
      const plan = ws?.plan || "free";
      const planConfig = getPlanConfig(plan);
      const dubbingLimit = planConfig.limits.dubbingMinutesPerMonth;

      if (dubbingLimit === 0) {
        return c.json(
          {
            error: "Dubbing is not available on your current plan",
            upgrade: true,
          },
          403
        );
      }

      // Get video duration to check minutes
      const videoResult = await db
        .select({ durationSeconds: video.durationSeconds })
        .from(video)
        .where(eq(video.id, translation.videoId));

      const videoData = videoResult[0];
      if (!videoData?.durationSeconds) {
        return c.json({ error: "Video duration not found" }, 400);
      }

      const minutesNeeded = calculateMinuteConsumption(videoData.durationSeconds);

      // Check dubbing minutes (if not unlimited)
      if (dubbingLimit !== -1) {
        const hasMinutes = await MinutesModel.hasMinutes(workspaceId, minutesNeeded);
        if (!hasMinutes) {
          return c.json(
            {
              error: "Insufficient minutes for dubbing",
              minutesNeeded,
              upgrade: true,
            },
            403
          );
        }
      }

      // Check if dubbing already exists for this translation
      const existing = await DubbingModel.getByTranslationId(translationId);
      if (existing) {
        if (existing.status === "completed" || existing.status === "generating_tts" || existing.status === "mixing_audio" || existing.status === "pending") {
          return c.json({ error: "Dubbing already exists for this translation", dubbing: existing }, 409);
        }
        // If failed, delete and retry
        await DubbingModel.delete(existing.id);
      }

      // Deduct minutes
      if (dubbingLimit !== -1) {
        await MinutesModel.deductMinutes({
          workspaceId,
          userId: user.id,
          videoId: translation.videoId,
          amount: minutesNeeded,
          type: "dubbing" as any,
        });
      }

      // Create dubbing record
      const dubbing = await DubbingModel.create({
        translationId,
        videoId: translation.videoId,
        workspaceId,
        targetLanguage: translation.targetLanguage,
        ttsProvider: "elevenlabs",
        voiceId,
        voiceName,
        voiceSettings,
        audioMode: audioMode || "duck",
        duckVolume: duckVolume ?? 0.15,
      });

      // Queue dubbing job
      await addDubbingJob({
        dubbingId: dubbing.id,
        translationId,
        videoId: translation.videoId,
        workspaceId,
        targetLanguage: translation.targetLanguage,
        voiceId,
        voiceSettings,
        ttsProvider: "elevenlabs",
        audioMode: audioMode || "duck",
        duckVolume: duckVolume ?? 0.15,
      });

      return c.json(dubbing, 201);
    } catch (error) {
      console.error(`[DUBBING CONTROLLER] START_DUBBING error:`, error);
      return c.json({ error: "Failed to start dubbing" }, 500);
    }
  }

  // Get all dubbings for a video
  static async getDubbingsByVideo(c: Context) {
    const videoId = c.req.param("videoId");
    DubbingController.logRequest(c, "GET_DUBBINGS_BY_VIDEO", { videoId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check workspace access via video
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

      const dubbings = await DubbingModel.getByVideoId(videoId);
      return c.json(dubbings);
    } catch (error) {
      console.error(`[DUBBING CONTROLLER] GET_DUBBINGS_BY_VIDEO error:`, error);
      return c.json({ error: "Failed to get dubbings" }, 500);
    }
  }

  // Get dubbing details
  static async getDubbing(c: Context) {
    const dubbingId = c.req.param("dubbingId");
    DubbingController.logRequest(c, "GET_DUBBING", { dubbingId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const dubbing = await DubbingModel.getById(dubbingId);
      if (!dubbing) {
        return c.json({ error: "Dubbing not found" }, 404);
      }

      const members = await WorkspaceModel.getMembers(dubbing.workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      return c.json(dubbing);
    } catch (error) {
      console.error(`[DUBBING CONTROLLER] GET_DUBBING error:`, error);
      return c.json({ error: "Failed to get dubbing" }, 500);
    }
  }

  // Delete a dubbing
  static async deleteDubbing(c: Context) {
    const dubbingId = c.req.param("dubbingId");
    DubbingController.logRequest(c, "DELETE_DUBBING", { dubbingId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const dubbing = await DubbingModel.getById(dubbingId);
      if (!dubbing) {
        return c.json({ error: "Dubbing not found" }, 404);
      }

      const members = await WorkspaceModel.getMembers(dubbing.workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      // Delete R2 files
      if (dubbing.dubbedAudioKey) {
        try {
          await R2Service.deleteFile(dubbing.dubbedAudioKey);
        } catch (e) {
          console.warn(`[DUBBING CONTROLLER] Failed to delete TTS audio from R2:`, e);
        }
      }
      if (dubbing.mixedAudioKey) {
        try {
          await R2Service.deleteFile(dubbing.mixedAudioKey);
        } catch (e) {
          console.warn(`[DUBBING CONTROLLER] Failed to delete mixed audio from R2:`, e);
        }
      }

      await DubbingModel.delete(dubbingId);
      return c.json({ success: true });
    } catch (error) {
      console.error(`[DUBBING CONTROLLER] DELETE_DUBBING error:`, error);
      return c.json({ error: "Failed to delete dubbing" }, 500);
    }
  }

  // List TTS voices
  static async listVoices(c: Context) {
    DubbingController.logRequest(c, "LIST_VOICES");

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const provider = c.req.query("provider") || "elevenlabs";
      const language = c.req.query("language");

      const voices = await TTSService.listVoices(provider, language);
      return c.json(voices);
    } catch (error) {
      console.error(`[DUBBING CONTROLLER] LIST_VOICES error:`, error);
      return c.json({ error: "Failed to list voices" }, 500);
    }
  }

  // Get signed URL for audio preview
  static async getPreview(c: Context) {
    const dubbingId = c.req.param("dubbingId");
    DubbingController.logRequest(c, "GET_PREVIEW", { dubbingId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const dubbing = await DubbingModel.getById(dubbingId);
      if (!dubbing) {
        return c.json({ error: "Dubbing not found" }, 404);
      }

      const members = await WorkspaceModel.getMembers(dubbing.workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      if (!dubbing.mixedAudioKey) {
        return c.json({ error: "Dubbed audio not yet available" }, 404);
      }

      const signedUrl = await R2Service.getSignedDownloadUrl(
        dubbing.mixedAudioKey,
        3600
      );

      return c.json({ url: signedUrl });
    } catch (error) {
      console.error(`[DUBBING CONTROLLER] GET_PREVIEW error:`, error);
      return c.json({ error: "Failed to get preview" }, 500);
    }
  }

  // Get dubbed audio for a specific clip
  static async getClipAudio(c: Context) {
    const clipId = c.req.param("clipId");
    const dubbingId = c.req.param("dubbingId");
    DubbingController.logRequest(c, "GET_CLIP_AUDIO", { clipId, dubbingId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const clipAudio = await DubbingModel.getClipAudio(clipId, dubbingId);
      if (!clipAudio) {
        return c.json({ error: "Dubbed clip audio not found" }, 404);
      }

      let signedUrl: string | undefined;
      if (clipAudio.audioKey) {
        signedUrl = await R2Service.getSignedDownloadUrl(
          clipAudio.audioKey,
          3600
        );
      }

      return c.json({ ...clipAudio, signedUrl });
    } catch (error) {
      console.error(`[DUBBING CONTROLLER] GET_CLIP_AUDIO error:`, error);
      return c.json({ error: "Failed to get clip audio" }, 500);
    }
  }
}
