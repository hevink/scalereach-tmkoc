import { Context } from "hono";
import { nanoid } from "nanoid";
import { VideoModel } from "../models/video.model";
import { ProjectModel } from "../models/project.model";
import { MinutesModel } from "../models/minutes.model";
import { YouTubeService } from "../services/youtube.service";
import { addVideoProcessingJob, getJobStatus, removeVideoJob, removeClipJob, getPlanPriority } from "../jobs/queue";
import { getPlanConfig, calculateMinuteConsumption, formatDuration, getVideoExpiryDate } from "../config/plan-config";
import { canUploadVideo } from "../services/minutes-validation.service";
import { R2Service } from "../services/r2.service";
import { ClipModel } from "../models/clip.model";
import { db } from "../db";
import { videoExport, voiceDubbing, dubbedClipAudio } from "../db/schema";
import { inArray } from "drizzle-orm";

function sanitizeYouTubeError(error: string): string {
  const msg = error.toLowerCase();
  if (msg.includes("sign in") || msg.includes("not a bot") || msg.includes("cookies") || msg.includes("confirm you")) {
    return "YouTube service is temporarily unavailable. Please try again in a few minutes.";
  }
  if (msg.includes("private") || msg.includes("members only")) {
    return "This video is private or members-only and cannot be processed.";
  }
  if (msg.includes("unavailable") || msg.includes("removed") || msg.includes("does not exist")) {
    return "This video is unavailable or has been removed.";
  }
  if (msg.includes("age") || msg.includes("age-restricted")) {
    return "This video is age-restricted and cannot be processed.";
  }
  return "Could not fetch video information. Please try again.";
}

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
      const { projectId, youtubeUrl, workspaceSlug, workspaceId, config } = body;
      const user = c.get("user") as { id: string };

      console.log(`[VIDEO CONTROLLER] SUBMIT_YOUTUBE_URL request:`, {
        projectId,
        youtubeUrl,
        userId: user.id,
        workspaceSlug,
        workspaceId,
        hasConfig: !!config,
      });

      if (!youtubeUrl) {
        return c.json({ error: "YouTube URL is required" }, 400);
      }

      if (!workspaceId) {
        return c.json({ error: "workspaceId is required" }, 400);
      }

      // Verify user has access to this workspace
      const { WorkspaceModel } = await import("../models/workspace.model");
      const member = await WorkspaceModel.getMemberByUserAndWorkspace(user.id, workspaceId);
      if (!member) {
        return c.json({ error: "You don't have access to this workspace" }, 403);
      }

      if (!YouTubeService.isValidYouTubeUrl(youtubeUrl)) {
        return c.json({ error: "Invalid YouTube URL" }, 400);
      }

      // Get video info — proxy to worker if available (yt-dlp only on EC2), fallback to HTTP API
      let videoInfo;
      try {
        const workerUrl = process.env.WORKER_URL;
        let workerSucceeded = false;
        if (workerUrl) {
          try {
            const workerRes = await fetch(
              `${workerUrl}/validate-youtube?url=${encodeURIComponent(youtubeUrl)}`,
              { signal: AbortSignal.timeout(30000) }
            );
            const data = await workerRes.json() as any;
            if (data.valid && data.videoInfo) {
              videoInfo = data.videoInfo;
              workerSucceeded = true;
            } else if (!data.valid) {
              return c.json({ error: data.error || "Failed to retrieve video information. The video may be unavailable or private." }, 400);
            }
          } catch (workerErr: any) {
            console.error(`[VIDEO CONTROLLER] Worker proxy failed, falling back to HTTP API:`, workerErr?.message);
          }
        }
        if (!workerSucceeded) {
          videoInfo = await YouTubeService.getVideoInfo(youtubeUrl);
        }
      } catch (error) {
        console.error(`[VIDEO CONTROLLER] Failed to get video info:`, error);
        return c.json({ error: "Failed to retrieve video information. The video may be unavailable or private." }, 400);
      }

      // Calculate effective processing duration based on timeframe selection
      const timeframeStart = config?.timeframeStart ?? 0;
      const timeframeEnd = config?.timeframeEnd ?? videoInfo.duration;
      const effectiveDuration = timeframeEnd - timeframeStart;

      // Validate video duration against plan limits and check minutes
      const ws = await WorkspaceModel.getById(workspaceId);
      const plan = ws?.plan || "free";
      const planConfig = getPlanConfig(plan);
      const minutesBalance = await MinutesModel.getBalance(workspaceId);

      const uploadValidation = canUploadVideo(
        planConfig,
        videoInfo.duration, // Full duration for plan limit check (e.g. max video length)
        0, // No file size for YouTube
        minutesBalance.minutesRemaining,
        effectiveDuration // Timeframe duration for minutes check
      );

      if (!uploadValidation.allowed) {
        console.log(`[VIDEO CONTROLLER] Upload validation failed: ${uploadValidation.reason}`);

        // Determine if upgrade is available and recommended plan
        const canUpgrade = plan === "free" || plan === "starter";
        const recommendedPlan = plan === "free" ? "starter" : "pro";

        return c.json({
          error: uploadValidation.message,
          reason: uploadValidation.reason,
          upgrade: uploadValidation.upgrade,
          upgradeRequired: canUpgrade && uploadValidation.reason === "VIDEO_TOO_LONG",
          recommendedPlan: canUpgrade && uploadValidation.reason === "VIDEO_TOO_LONG" ? recommendedPlan : undefined,
          currentLimit: uploadValidation.reason === "VIDEO_TOO_LONG" ? formatDuration(planConfig.limits.videoLength) : undefined,
          attemptedValue: uploadValidation.reason === "VIDEO_TOO_LONG" ? formatDuration(videoInfo.duration) : undefined,
          // Add minutes info for insufficient minutes errors
          minutesRemaining: uploadValidation.reason === "INSUFFICIENT_MINUTES" ? minutesBalance.minutesRemaining : undefined,
          minutesNeeded: uploadValidation.reason === "INSUFFICIENT_MINUTES" ? uploadValidation.minutesWillBeDeducted : undefined,
        }, uploadValidation.reason === "INSUFFICIENT_MINUTES" ? 402 : 400);
      }

      // Only validate project if projectId is provided
      if (projectId) {
        const project = await ProjectModel.getById(projectId);
        if (!project) {
          return c.json({ error: "Project not found" }, 404);
        }
      }

      const videoId = nanoid();

      // Create video record with workspaceId
      const videoRecord = await VideoModel.create({
        id: videoId,
        projectId: projectId || null,
        workspaceId: workspaceId,
        userId: user.id,
        sourceType: "youtube",
        sourceUrl: youtubeUrl,
        title: videoInfo.title,
        expiresAt: getVideoExpiryDate(plan),
      });

      // Deduct minutes based on selected timeframe, not full video duration
      const minutesToDeduct = calculateMinuteConsumption(effectiveDuration);
      await MinutesModel.deductMinutes({
        workspaceId,
        userId: user.id,
        videoId,
        amount: minutesToDeduct,
        type: "upload",
      });
      console.log(`[VIDEO CONTROLLER] Deducted ${minutesToDeduct} minutes for YouTube video ${videoId} (timeframe: ${timeframeStart}s-${timeframeEnd}s of ${videoInfo.duration}s total)`);

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
          language: config.language ?? null,
          enableAutoHook: config.enableAutoHook ?? true,
          clipType: config.clipType ?? "viral-clips",
          customPrompt: config.customPrompt ?? "",
          topicKeywords: config.topicKeywords ?? [],
          captionTemplateId: config.captionTemplateId ?? "karaoke",
          aspectRatio: config.aspectRatio ?? "9:16",
          enableWatermark: config.enableWatermark ?? true,
          // Editing Options
          enableCaptions: config.enableCaptions ?? true,
          enableEmojis: config.enableEmojis ?? false,
          enableIntroTitle: config.enableIntroTitle ?? false,
          // Split-Screen Options
          enableSplitScreen: config.enableSplitScreen ?? false,
          splitScreenBgVideoId: config.splitScreenBgVideoId ?? null,
          splitScreenBgCategoryId: config.splitScreenBgCategoryId ?? null,
          splitRatio: config.splitRatio ?? 50,
        });

        // Start processing immediately
        await VideoModel.update(videoId, { status: "downloading" });
        
        await addVideoProcessingJob({
          videoId,
          projectId: projectId || null,
          userId: user.id,
          sourceType: "youtube",
          sourceUrl: youtubeUrl,
        }, getPlanPriority(plan));

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
      return c.json({ error: errorMessage }, 500);
    }
  }

  static async getVideoById(c: Context) {
    const id = c.req.param("id");
    VideoController.logRequest(c, "GET_VIDEO_BY_ID", { id });

    try {
      const user = c.get("user") as { id: string };
      const video = await VideoModel.getById(id);

      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Verify user has access via workspace membership
      if (video.workspaceId) {
        const { WorkspaceModel } = await import("../models/workspace.model");
        const member = await WorkspaceModel.getMemberByUserAndWorkspace(user.id, video.workspaceId);
        if (!member) {
          return c.json({ error: "Forbidden" }, 403);
        }
      } else if (video.userId !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
      }

      return c.json(video);
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] GET_VIDEO_BY_ID error:`, error);
      return c.json({ error: "Failed to fetch video" }, 500);
    }
  }

  static async getVideosByProject(c: Context) {
    const user = c.get("user") as { id: string };
    const projectId = c.req.param("projectId");
    VideoController.logRequest(c, "GET_VIDEOS_BY_PROJECT", { projectId });

    try {
      const proj = await ProjectModel.getById(projectId);
      if (!proj) {
        return c.json({ error: "Project not found" }, 404);
      }

      const { WorkspaceModel } = await import("../models/workspace.model");
      const member = await WorkspaceModel.getMemberByUserAndWorkspace(user.id, proj.workspaceId);
      if (!member) {
        return c.json({ error: "You don't have access to this project" }, 403);
      }

      const videos = await VideoModel.getByProjectId(projectId);
      return c.json(videos);
    } catch (error) {
      console.error(`[VIDEO CONTROLLER] GET_VIDEOS_BY_PROJECT error:`, error);
      return c.json({ error: "Failed to fetch videos" }, 500);
    }
  }

  static async getMyVideos(c: Context) {
    const user = c.get("user") as { id: string };
    const workspaceId = c.req.query("workspaceId");
    const statusFilter = c.req.query("filter");
    VideoController.logRequest(c, "GET_MY_VIDEOS", { userId: user.id, workspaceId, statusFilter });

    try {
      if (!workspaceId) {
        return c.json({ error: "workspaceId query parameter is required" }, 400);
      }

      // Check if user is a member of this workspace
      const { WorkspaceModel } = await import("../models/workspace.model");
      const member = await WorkspaceModel.getMemberByUserAndWorkspace(user.id, workspaceId);
      if (!member) {
        console.log(`[VIDEO CONTROLLER] GET_MY_VIDEOS - user ${user.id} is not a member of workspace: ${workspaceId}`);
        return c.json({ error: "You don't have access to this workspace" }, 403);
      }

      // Get videos for this workspace with optional status filter
      const videos = await VideoModel.getByWorkspaceId(workspaceId, statusFilter);
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
      const user = c.get("user") as { id: string };
      const video = await VideoModel.getById(id);

      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Verify user has access via workspace membership
      if (video.workspaceId) {
        const { WorkspaceModel } = await import("../models/workspace.model");
        const member = await WorkspaceModel.getMemberByUserAndWorkspace(user.id, video.workspaceId);
        if (!member) {
          return c.json({ error: "Forbidden" }, 403);
        }
      } else if (video.userId !== user.id) {
        return c.json({ error: "Forbidden" }, 403);
      }

      // Delete all clip R2 files before DB delete
      const clips = await ClipModel.getByVideoId(id);
      const clipIds = clips.map(c => c.id);

      const exportKeys = clipIds.length > 0
        ? await db.select({ storageKey: videoExport.storageKey }).from(videoExport).where(inArray(videoExport.clipId, clipIds))
        : [];

      const dubbingRows = await db
        .select({ dubbedAudioKey: voiceDubbing.dubbedAudioKey, mixedAudioKey: voiceDubbing.mixedAudioKey, dubbingId: voiceDubbing.id })
        .from(voiceDubbing)
        .where(inArray(voiceDubbing.videoId, [id]));

      const dubbingIds = dubbingRows.map(d => d.dubbingId);
      const clipAudioRows = dubbingIds.length > 0
        ? await db.select({ audioKey: dubbedClipAudio.audioKey }).from(dubbedClipAudio).where(inArray(dubbedClipAudio.dubbingId, dubbingIds))
        : [];

      await Promise.allSettled([
        ...clips.flatMap((clip) =>
          [clip.storageKey, clip.rawStorageKey, clip.thumbnailKey]
            .filter(Boolean)
            .map((key) => R2Service.deleteFile(key as string))
        ),
        ...exportKeys.filter(e => e.storageKey).map(e => R2Service.deleteFile(e.storageKey as string)),
        ...dubbingRows.flatMap(d => [d.dubbedAudioKey, d.mixedAudioKey].filter(Boolean).map(k => R2Service.deleteFile(k as string))),
        ...clipAudioRows.filter(a => a.audioKey).map(a => R2Service.deleteFile(a.audioKey as string)),
      ]);

      // Delete video R2 files
      await Promise.allSettled(
        [video.storageKey, video.audioStorageKey, video.thumbnailKey]
          .filter(Boolean)
          .map((key) => R2Service.deleteFile(key as string))
      );

      // Remove from processing queue if queued/active
      await removeVideoJob(id);

      // Remove any pending clip generation jobs
      await Promise.allSettled(clipIds.map((clipId) => removeClipJob(clipId)));

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
        return c.json({ valid: false, error: "URL is required" }, 400);
      }

      const isValid = YouTubeService.isValidYouTubeUrl(url);
      if (!isValid) {
        return c.json({ valid: false, error: "Invalid YouTube URL format" });
      }

      // Proxy to worker (has yt-dlp installed) — API (Render) does not have yt-dlp
      const workerUrl = process.env.WORKER_URL;
      if (workerUrl) {
        try {
          const workerRes = await fetch(
            `${workerUrl}/validate-youtube?url=${encodeURIComponent(url)}`,
            { signal: AbortSignal.timeout(30000) }
          );
          const data = await workerRes.json() as { valid: boolean; error?: string; videoInfo?: unknown };
          if (!data.valid && data.error) {
            data.error = sanitizeYouTubeError(data.error);
          }
          return c.json(data);
        } catch (proxyErr: any) {
          console.error("[VIDEO CONTROLLER] Worker proxy failed, falling back to HTTP API:", proxyErr?.message);
          // Fall through to direct HTTP API fallback below
        }
      }

      // Fallback: YouTube Data API (works on API server) or yt-dlp (worker only)
      const videoInfo = await YouTubeService.getVideoInfo(url);
      const durationValidation = YouTubeService.validateVideoDuration(videoInfo.duration);
      if (!durationValidation.valid) {
        return c.json({ valid: false, error: durationValidation.error, videoInfo });
      }
      return c.json({ valid: true, videoInfo });

    } catch (error: any) {
      console.error(`[VIDEO CONTROLLER] VALIDATE_YOUTUBE_URL error:`, error);
      const errorMessage = error?.message || "Unknown error";
      return c.json({ valid: false, error: sanitizeYouTubeError(errorMessage) });
    }
  }
}
