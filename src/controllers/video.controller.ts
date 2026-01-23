import { Context } from "hono";
import { nanoid } from "nanoid";
import { VideoModel } from "../models/video.model";
import { ProjectModel } from "../models/project.model";
import { YouTubeService, MAX_VIDEO_DURATION_SECONDS } from "../services/youtube.service";
import { addVideoProcessingJob, getJobStatus } from "../jobs/queue";

export class VideoController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[VIDEO CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  static async submitYouTubeUrl(c: Context) {
    VideoController.logRequest(c, "SUBMIT_YOUTUBE_URL");

    try {
      const body = await c.req.json();
      const { projectId, youtubeUrl, workspaceSlug, config } = body;
      const user = c.get("user") as { id: string };

      console.log(`[VIDEO CONTROLLER] SUBMIT_YOUTUBE_URL request:`, {
        projectId,
        youtubeUrl,
        userId: user.id,
        workspaceSlug,
        hasConfig: !!config,
      });

      if (!youtubeUrl) {
        return c.json({ error: "YouTube URL is required" }, 400);
      }

      if (!YouTubeService.isValidYouTubeUrl(youtubeUrl)) {
        return c.json({ error: "Invalid YouTube URL" }, 400);
      }

      // Get video info to validate duration before processing
      let videoInfo;
      try {
        videoInfo = await YouTubeService.getVideoInfo(youtubeUrl);
      } catch (error) {
        console.error(`[VIDEO CONTROLLER] Failed to get video info:`, error);
        return c.json({ error: "Failed to retrieve video information. The video may be unavailable or private." }, 400);
      }

      // Validate video duration (max 4 hours)
      const durationValidation = YouTubeService.validateVideoDuration(videoInfo.duration);
      if (!durationValidation.valid) {
        console.log(`[VIDEO CONTROLLER] Video duration validation failed: ${durationValidation.error}`);
        return c.json({ error: durationValidation.error }, 400);
      }

      // Only validate project if projectId is provided
      if (projectId) {
        const project = await ProjectModel.getById(projectId);
        if (!project) {
          return c.json({ error: "Project not found" }, 404);
        }
      }

      const videoId = nanoid();

      // Create video record
      const videoRecord = await VideoModel.create({
        id: videoId,
        projectId: projectId || null,
        userId: user.id,
        sourceType: "youtube",
        sourceUrl: youtubeUrl,
        title: videoInfo.title,
      });

      // If config is provided, save it and start processing immediately
      if (config) {
        const { VideoConfigModel } = await import("../models/video-config.model");
        const configId = nanoid();
        
        await VideoConfigModel.upsert(videoId, configId, {
          skipClipping: config.skipClipping ?? false,
          clipModel: config.clipModel ?? "ClipBasic",
          genre: config.genre ?? "Auto",
          clipDurationMin: config.clipDurationMin ?? 15,
          clipDurationMax: config.clipDurationMax ?? 90,
          timeframeStart: config.timeframeStart ?? 0,
          timeframeEnd: config.timeframeEnd ?? null,
          enableAutoHook: config.enableAutoHook ?? true,
          customPrompt: config.customPrompt ?? "",
          topicKeywords: config.topicKeywords ?? [],
          captionTemplateId: config.captionTemplateId ?? "karaoke",
          aspectRatio: config.aspectRatio ?? "9:16",
          enableWatermark: config.enableWatermark ?? true,
        });

        // Start processing immediately
        await VideoModel.update(videoId, { status: "downloading" });
        
        await addVideoProcessingJob({
          videoId,
          projectId: projectId || null,
          userId: user.id,
          sourceType: "youtube",
          sourceUrl: youtubeUrl,
        });

        console.log(
          `[VIDEO CONTROLLER] SUBMIT_YOUTUBE_URL success - created video: ${videoId} with config, processing started`
        );

        return c.json(
          {
            message: "Video submitted for processing",
            video: { ...videoRecord, status: "downloading" },
            videoInfo,
          },
          201
        );
      }

      // No config provided - create with pending_config status
      await VideoModel.update(videoId, { status: "pending_config" as any });

      // Build redirect URL for configuration page
      const redirectUrl = workspaceSlug 
        ? `/${workspaceSlug}/configure/${videoId}`
        : `/configure/${videoId}`;

      console.log(
        `[VIDEO CONTROLLER] SUBMIT_YOUTUBE_URL success - created video: ${videoId} with pending_config status`
      );

      return c.json(
        {
          message: "Video created. Please configure processing options.",
          video: { ...videoRecord, status: "pending_config" },
          videoInfo,
          redirectUrl,
        },
        201
      );
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] SUBMIT_YOUTUBE_URL error:`, error);
      // Return more detailed error message
      const errorMessage = error instanceof Error ? error.message : "Failed to submit video";
      return c.json({ error: errorMessage, details: String(error) }, 500);
    }
  }

  static async getVideoById(c: Context) {
    const id = c.req.param("id");
    VideoController.logRequest(c, "GET_VIDEO_BY_ID", { id });

    try {
      const video = await VideoModel.getById(id);

      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      return c.json(video);
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] GET_VIDEO_BY_ID error:`, error);
      return c.json({ error: "Failed to fetch video" }, 500);
    }
  }

  static async getVideosByProject(c: Context) {
    const projectId = c.req.param("projectId");
    VideoController.logRequest(c, "GET_VIDEOS_BY_PROJECT", { projectId });

    try {
      const videos = await VideoModel.getByProjectId(projectId);
      return c.json(videos);
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] GET_VIDEOS_BY_PROJECT error:`, error);
      return c.json({ error: "Failed to fetch videos" }, 500);
    }
  }

  static async getMyVideos(c: Context) {
    const user = c.get("user") as { id: string };
    VideoController.logRequest(c, "GET_MY_VIDEOS", { userId: user.id });

    try {
      // Use lite version to return only essential fields for grid display
      const videos = await VideoModel.getByUserIdLite(user.id);
      return c.json(videos);
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] GET_MY_VIDEOS error:`, error);
      return c.json({ error: "Failed to fetch videos" }, 500);
    }
  }

  static async getVideoStatus(c: Context) {
    const id = c.req.param("id");
    VideoController.logRequest(c, "GET_VIDEO_STATUS", { id });

    try {
      const video = await VideoModel.getById(id);

      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      const jobStatus = await getJobStatus(`video-${id}`);

      return c.json({
        video,
        job: jobStatus,
      });
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] GET_VIDEO_STATUS error:`, error);
      return c.json({ error: "Failed to fetch video status" }, 500);
    }
  }

  static async deleteVideo(c: Context) {
    const id = c.req.param("id");
    VideoController.logRequest(c, "DELETE_VIDEO", { id });

    try {
      await VideoModel.delete(id);
      return c.json({ message: "Video deleted successfully" });
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] DELETE_VIDEO error:`, error);
      return c.json({ error: "Failed to delete video" }, 500);
    }
  }

  static async validateYouTubeUrl(c: Context) {
    const url = c.req.query("url");
    VideoController.logRequest(c, "VALIDATE_YOUTUBE_URL", { url });

    try {
      if (!url) {
        return c.json({ error: "URL is required" }, 400);
      }

      const isValid = YouTubeService.isValidYouTubeUrl(url);

      if (!isValid) {
        return c.json({ valid: false, error: "Invalid YouTube URL" });
      }

      const videoInfo = await YouTubeService.getVideoInfo(url);

      // Validate video duration (max 4 hours)
      const durationValidation = YouTubeService.validateVideoDuration(videoInfo.duration);
      if (!durationValidation.valid) {
        return c.json({
          valid: false,
          error: durationValidation.error,
          videoInfo,
        });
      }

      return c.json({
        valid: true,
        videoInfo,
      });
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] VALIDATE_YOUTUBE_URL error:`, error);
      return c.json({
        valid: false,
        error: "Failed to validate YouTube URL",
      });
    }
  }
}
