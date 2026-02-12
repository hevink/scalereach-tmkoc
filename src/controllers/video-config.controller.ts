import { Context } from "hono";
import { nanoid } from "nanoid";
import { VideoConfigModel, type VideoConfigInput } from "../models/video-config.model";
import { VideoModel } from "../models/video.model";
import { addVideoProcessingJob } from "../jobs/queue";

export class VideoConfigController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[VIDEO CONFIG CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * Get video configuration
   * GET /api/videos/:id/config
   */
  static async getConfig(c: Context) {
    const videoId = c.req.param("id");
    VideoConfigController.logRequest(c, "GET_CONFIG", { videoId });

    try {
      const video = await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      const config = await VideoConfigModel.getByVideoId(videoId);

      return c.json({
        config,
        video: {
          id: video.id,
          title: video.title,
          duration: video.duration,
          status: video.status,
          sourceUrl: video.sourceUrl,
        },
      });
    } catch (error) {
      console.error(`[VIDEO CONFIG CONTROLLER] GET_CONFIG error:`, error);
      return c.json({ error: "Failed to fetch video configuration" }, 500);
    }
  }

  /**
   * Save video configuration and start processing
   * POST /api/videos/:id/configure
   */
  static async configure(c: Context) {
    const videoId = c.req.param("id");
    VideoConfigController.logRequest(c, "CONFIGURE", { videoId });

    try {
      const user = c.get("user") as { id: string };
      const body = await c.req.json();

      // Validate video exists and is in pending_config status
      const video = await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      if (video.userId !== user.id) {
        return c.json({ error: "Unauthorized" }, 403);
      }

      if (video.status !== "pending_config" && video.status !== "pending") {
        return c.json(
          { error: "Video is not in a configurable state" },
          400
        );
      }

      // Validate and extract config
      const configInput: VideoConfigInput = {
        skipClipping: body.skipClipping ?? false,
        clipModel: body.clipModel ?? "ClipBasic",
        genre: body.genre ?? "Auto",
        clipDurationMin: body.clipDurationMin ?? 0,
        clipDurationMax: body.clipDurationMax ?? 180,
        timeframeStart: body.timeframeStart ?? 0,
        timeframeEnd: body.timeframeEnd ?? null,
        enableAutoHook: body.enableAutoHook ?? true,
        clipType: body.clipType ?? "viral-clips",
        customPrompt: body.customPrompt ?? "",
        topicKeywords: body.topicKeywords ?? [],
        captionTemplateId: body.captionTemplateId ?? "classic",
        aspectRatio: body.aspectRatio ?? "9:16",
        enableWatermark: body.enableWatermark ?? true,
        // Editing Options
        enableCaptions: body.enableCaptions ?? true,
        enableEmojis: body.enableEmojis ?? false,
        enableIntroTitle: body.enableIntroTitle ?? false,
      };

      // Save configuration
      const configId = nanoid();
      const config = await VideoConfigModel.upsert(videoId, configId, configInput);

      // Update video status to start processing
      await VideoModel.update(videoId, { status: "downloading" });

      // Add to processing queue
      await addVideoProcessingJob({
        videoId,
        projectId: video.projectId,
        userId: user.id,
        sourceType: video.sourceType as "youtube" | "upload",
        sourceUrl: video.sourceUrl || "",
      });

      console.log(
        `[VIDEO CONFIG CONTROLLER] CONFIGURE success - video ${videoId} queued for processing`
      );

      return c.json({
        message: "Video configuration saved and processing started",
        video: await VideoModel.getById(videoId),
        config,
      });
    } catch (error) {
      console.error(`[VIDEO CONFIG CONTROLLER] CONFIGURE error:`, error);
      return c.json({ error: "Failed to configure video" }, 500);
    }
  }

  /**
   * Update video configuration (without starting processing)
   * PATCH /api/videos/:id/config
   */
  static async updateConfig(c: Context) {
    const videoId = c.req.param("id");
    VideoConfigController.logRequest(c, "UPDATE_CONFIG", { videoId });

    try {
      const user = c.get("user") as { id: string };
      const body = await c.req.json();

      const video = await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      if (video.userId !== user.id) {
        return c.json({ error: "Unauthorized" }, 403);
      }

      const configInput: Partial<VideoConfigInput> = {};
      if (body.skipClipping !== undefined) configInput.skipClipping = body.skipClipping;
      if (body.clipModel !== undefined) configInput.clipModel = body.clipModel;
      if (body.genre !== undefined) configInput.genre = body.genre;
      if (body.clipDurationMin !== undefined) configInput.clipDurationMin = body.clipDurationMin;
      if (body.clipDurationMax !== undefined) configInput.clipDurationMax = body.clipDurationMax;
      if (body.timeframeStart !== undefined) configInput.timeframeStart = body.timeframeStart;
      if (body.timeframeEnd !== undefined) configInput.timeframeEnd = body.timeframeEnd;
      if (body.enableAutoHook !== undefined) configInput.enableAutoHook = body.enableAutoHook;
      if (body.clipType !== undefined) configInput.clipType = body.clipType;
      if (body.customPrompt !== undefined) configInput.customPrompt = body.customPrompt;
      if (body.topicKeywords !== undefined) configInput.topicKeywords = body.topicKeywords;
      if (body.captionTemplateId !== undefined) configInput.captionTemplateId = body.captionTemplateId;
      if (body.aspectRatio !== undefined) configInput.aspectRatio = body.aspectRatio;
      if (body.enableWatermark !== undefined) configInput.enableWatermark = body.enableWatermark;
      // Editing Options
      if (body.enableCaptions !== undefined) configInput.enableCaptions = body.enableCaptions;
      if (body.enableEmojis !== undefined) configInput.enableEmojis = body.enableEmojis;
      if (body.enableIntroTitle !== undefined) configInput.enableIntroTitle = body.enableIntroTitle;

      const configId = nanoid();
      const config = await VideoConfigModel.upsert(videoId, configId, configInput);

      return c.json({
        message: "Configuration updated",
        config,
      });
    } catch (error) {
      console.error(`[VIDEO CONFIG CONTROLLER] UPDATE_CONFIG error:`, error);
      return c.json({ error: "Failed to update configuration" }, 500);
    }
  }
}
