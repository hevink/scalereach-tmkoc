/**
 * Clip Generation Controller
 * Handles API endpoints for clip generation
 *
 * Validates: Requirements 7.1, 7.6
 */

import { Context } from "hono";
import { ClipModel } from "../models/clip.model";
import { VideoModel } from "../models/video.model";
import { ProjectModel } from "../models/project.model";
import { MinutesModel } from "../models/minutes.model";
import { WorkspaceModel } from "../models/workspace.model";
import { ClipCaptionModel } from "../models/clip-caption.model";
import { VideoConfigModel } from "../models/video-config.model";
import { ClipGeneratorService, AspectRatio, VideoQuality } from "../services/clip-generator.service";
import { addClipGenerationJob, getClipJobStatus } from "../jobs/queue";
import { R2Service } from "../services/r2.service";
import { getPlanConfig, calculateMinuteConsumption } from "../config/plan-config";
import { canRegenerateVideo } from "../services/minutes-validation.service";

export class ClipGenerationController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[CLIP GENERATION CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * POST /api/clips/:id/generate
   * Trigger clip generation for a detected clip
   * Validates: Requirements 7.1, 7.6
   */
  static async generateClip(c: Context) {
    const clipId = c.req.param("id");
    ClipGenerationController.logRequest(c, "GENERATE_CLIP", { clipId });

    try {
      // Get the clip
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Check if clip is already being generated or ready
      if (clip.status === "generating") {
        return c.json({ 
          error: "Clip is already being generated",
          status: clip.status,
        }, 400);
      }

      if (clip.status === "ready" || clip.status === "exported") {
        return c.json({ 
          message: "Clip has already been generated",
          clip,
        });
      }

      // Get the video to get source information
      const video = await VideoModel.getById(clip.videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Parse request body for options
      let body: any = {};
      try {
        body = await c.req.json();
      } catch {
        // No body provided, use defaults
      }

      // Get aspect ratio and quality from request or use defaults
      const aspectRatio: AspectRatio = body.aspectRatio || "9:16";
      const quality: VideoQuality = body.quality || "1080p";

      // Validate aspect ratio
      const validAspectRatios: AspectRatio[] = ["9:16", "1:1", "16:9"];
      if (!validAspectRatios.includes(aspectRatio)) {
        return c.json({ 
          error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(", ")}`,
        }, 400);
      }

      // Validate quality
      const validQualities: VideoQuality[] = ["720p", "1080p", "4k"];
      if (!validQualities.includes(quality)) {
        return c.json({ 
          error: `Invalid quality. Must be one of: ${validQualities.join(", ")}`,
        }, 400);
      }

      // Determine source type and URL/key
      const sourceType = video.sourceType as "youtube" | "upload";
      const sourceUrl = video.sourceUrl || undefined;
      const storageKey = video.storageKey || undefined;

      // Validate source configuration
      if (sourceType === "youtube" && !sourceUrl) {
        return c.json({ error: "YouTube source URL not found for video" }, 400);
      }
      if (sourceType === "upload" && !storageKey) {
        return c.json({ error: "Storage key not found for uploaded video" }, 400);
      }

      // Get workspace ID from video -> project relationship
      let workspaceId: string | null = video.workspaceId || null;
      if (!workspaceId && video.projectId) {
        const project = await ProjectModel.getById(video.projectId);
        workspaceId = project?.workspaceId || null;
      }

      // Get current user
      const user = c.get("user");
      const userId = user?.id;

      // Validate clip options
      const validation = ClipGeneratorService.validateOptions({
        videoId: clip.videoId,
        clipId,
        sourceType,
        sourceUrl,
        storageKey,
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio,
        quality,
      });

      if (!validation.valid) {
        return c.json({ error: validation.error }, 400);
      }

      // Determine watermark based on workspace plan
      const ws = workspaceId ? await WorkspaceModel.getById(workspaceId) : null;
      const applyWatermark = getPlanConfig(ws?.plan || "free").limits.watermark;

      // Load video config to check enableCaptions flag
      const videoConfig = await VideoConfigModel.getByVideoId(clip.videoId);
      const captionsEnabled = videoConfig?.enableCaptions ?? true;
      // Emojis and intro title disabled for now
      const introTitleEnabled = false;
      const emojisEnabled = false;

      // Get saved captions from database
      const savedCaptions = await ClipCaptionModel.getByClipId(clipId);

      // Build captions object for job
      let captions: any = undefined;
      if (captionsEnabled && savedCaptions && savedCaptions.words.length > 0) {
        captions = {
          words: savedCaptions.words.map((w: any) => ({
            word: w.word,
            start: w.start,
            end: w.end,
          })),
          style: savedCaptions.styleConfig || undefined,
        };
        console.log(`[CLIP GENERATION CONTROLLER] Using saved captions for generate: ${savedCaptions.words.length} words`);
      }

      // Add job to queue with captions and intro title
      const job = await addClipGenerationJob({
        clipId,
        videoId: clip.videoId,
        workspaceId: workspaceId || "",
        userId: userId || "",
        sourceType,
        sourceUrl,
        storageKey,
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio,
        quality,
        creditCost: 0,
        watermark: applyWatermark,
        emojis: emojisEnabled ? ((clip as any).transcriptWithEmojis || undefined) : undefined,
        introTitle: introTitleEnabled ? ((clip as any).introTitle || undefined) : undefined,
        captions,
      });

      console.log(`[CLIP GENERATION CONTROLLER] Job queued: ${job.id}`);

      return c.json({
        message: "Clip generation started",
        clipId,
        jobId: job.id,
        options: {
          aspectRatio,
          quality,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.endTime - clip.startTime,
        },
      });
    } catch (error) {
      console.error(`[CLIP GENERATION CONTROLLER] GENERATE_CLIP error:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to start clip generation: ${errorMessage}` }, 500);
    }
  }

  /**
   * GET /api/clips/:id/status
   * Get generation status for a clip
   * Validates: Requirements 7.6
   */
  static async getClipStatus(c: Context) {
    const clipId = c.req.param("id");
    ClipGenerationController.logRequest(c, "GET_CLIP_STATUS", { clipId });

    try {
      // Get the clip
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Get job status if available
      const jobId = `clip-${clipId}`;
      const jobStatus = await getClipJobStatus(jobId);

      // Build response
      const response: any = {
        clipId,
        status: clip.status,
        aspectRatio: clip.aspectRatio,
        storageUrl: clip.storageUrl,
        errorMessage: clip.errorMessage,
      };

      // Add job details if available
      if (jobStatus) {
        response.job = {
          id: jobStatus.id,
          state: jobStatus.state,
          progress: jobStatus.progress,
          failedReason: jobStatus.failedReason,
          processedOn: jobStatus.processedOn,
          finishedOn: jobStatus.finishedOn,
        };
      }

      return c.json(response);
    } catch (error) {
      console.error(`[CLIP GENERATION CONTROLLER] GET_CLIP_STATUS error:`, error);
      return c.json({ error: "Failed to get clip status" }, 500);
    }
  }

  /**
   * POST /api/clips/:id/regenerate
   * Regenerate a clip with saved captions burned in
   */
  static async regenerateClip(c: Context) {
    const clipId = c.req.param("id");
    ClipGenerationController.logRequest(c, "REGENERATE_CLIP", { clipId });

    try {
      // Get the clip
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Check if clip is currently being generated
      if (clip.status === "generating") {
        return c.json({ 
          error: "Clip is currently being generated. Please wait for it to complete or fail before regenerating.",
        }, 400);
      }

      // Reset clip status to detected
      await ClipModel.update(clipId, {
        status: "detected", 
        storageKey: undefined,
        storageUrl: undefined,
        aspectRatio: undefined,
        errorMessage: undefined,
      });

      // Get the video to get source information
      const video = await VideoModel.getById(clip.videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Parse request body for options
      let body: any = {};
      try {
        body = await c.req.json();
      } catch {
        // No body provided, use defaults
      }

      // Get aspect ratio and quality from request or use defaults
      const aspectRatio: AspectRatio = body.aspectRatio || clip.aspectRatio || "9:16";
      const quality: VideoQuality = body.quality || "1080p";

      // Determine source type and URL/key
      const sourceType = video.sourceType as "youtube" | "upload";
      const sourceUrl = video.sourceUrl || undefined;
      const storageKey = video.storageKey || undefined;

      // Get workspace ID from video -> project relationship
      let workspaceId: string | null = video.workspaceId || null;
      if (!workspaceId && video.projectId) {
        const project = await ProjectModel.getById(video.projectId);
        workspaceId = project?.workspaceId || null;
      }

      // Get current user
      const user = c.get("user");
      const userId = user?.id;

      // Get saved captions from database
      const savedCaptions = await ClipCaptionModel.getByClipId(clipId);

      // Load video config to check enableCaptions flag
      const videoConfig = await VideoConfigModel.getByVideoId(clip.videoId);
      const captionsEnabled = videoConfig?.enableCaptions ?? true;
      // Emojis and intro title disabled for now
      const introTitleEnabled = false;
      const emojisEnabled = false;

      // Build captions object for job
      let captions: any = undefined;
      if (captionsEnabled && savedCaptions && savedCaptions.words.length > 0) {
        captions = {
          words: savedCaptions.words.map(w => ({
            word: w.word,
            start: w.start,
            end: w.end,
          })),
          style: savedCaptions.styleConfig || undefined,
        };
        console.log(`[CLIP GENERATION CONTROLLER] Using saved captions: ${savedCaptions.words.length} words, isEdited: ${savedCaptions.isEdited}`);
      }

      // Determine watermark based on workspace plan
      const ws = workspaceId ? await WorkspaceModel.getById(workspaceId) : null;
      const applyWatermark = getPlanConfig(ws?.plan || "free").limits.watermark;

      // Add job to queue with captions and intro title
      const job = await addClipGenerationJob({
        clipId,
        videoId: clip.videoId,
        workspaceId: workspaceId || "",
        userId: userId || "",
        sourceType,
        sourceUrl,
        storageKey,
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio,
        quality,
        creditCost: 0,
        watermark: applyWatermark,
        emojis: emojisEnabled ? ((clip as any).transcriptWithEmojis || undefined) : undefined,
        introTitle: introTitleEnabled ? ((clip as any).introTitle || undefined) : undefined,
        captions,
      });

      console.log(`[CLIP GENERATION CONTROLLER] Regeneration job queued: ${job.id}`);

      return c.json({
        message: "Clip regeneration started",
        clipId,
        jobId: job.id,
        options: {
          aspectRatio,
          quality,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.endTime - clip.startTime,
          hasCaptions: !!captions,
          captionWordCount: captions?.words?.length || 0,
        },
      });
    } catch (error) {
      console.error(`[CLIP GENERATION CONTROLLER] REGENERATE_CLIP error:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to regenerate clip: ${errorMessage}` }, 500);
    }
  }

  /**
   * GET /api/clips/:id/download
   * Get a signed download URL for the generated clip
   */
  static async getDownloadUrl(c: Context) {
    const clipId = c.req.param("id");
    ClipGenerationController.logRequest(c, "GET_DOWNLOAD_URL", { clipId });

    try {
      // Get the clip
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Check if clip has been generated
      if (!clip.storageKey) {
        return c.json({ 
          error: "Clip has not been generated yet",
          status: clip.status,
        }, 400);
      }

      // Get expiration from query params (default 1 hour)
      const expiresIn = parseInt(c.req.query("expiresIn") || "3600", 10);
      const maxExpiration = 7 * 24 * 60 * 60; // 7 days max
      const validExpiration = Math.min(Math.max(expiresIn, 60), maxExpiration);

      // Generate signed download URL
      const downloadUrl = await R2Service.getSignedDownloadUrl(clip.storageKey, validExpiration);

      // Update clip status to exported if it was ready
      if (clip.status === "ready") {
        await ClipModel.update(clipId, { status: "exported" });
      }

      return c.json({
        clipId,
        downloadUrl,
        expiresIn: validExpiration,
        filename: `${clip.title || "clip"}-${clipId}.mp4`,
        status: "exported",
      });
    } catch (error) {
      console.error(`[CLIP GENERATION CONTROLLER] GET_DOWNLOAD_URL error:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to get download URL: ${errorMessage}` }, 500);
    }
  }
}
