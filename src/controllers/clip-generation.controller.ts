/**
 * Clip Generation Controller
 * Handles API endpoints for clip generation
 * 
 * Validates: Requirements 7.1, 7.6
 */

import { Context } from "hono";
import { ClipModel } from "../models/clip.model";
import { VideoModel } from "../models/video.model";
import { ClipCaptionModel } from "../models/clip-caption.model";
import { ClipGeneratorService, AspectRatio, VideoQuality } from "../services/clip-generator.service";
import { addClipGenerationJob, getClipJobStatus } from "../jobs/queue";

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

      // Add job to queue
      const job = await addClipGenerationJob({
        clipId,
        videoId: clip.videoId,
        sourceType,
        sourceUrl,
        storageKey,
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio,
        quality,
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

      // Get saved captions from database
      const savedCaptions = await ClipCaptionModel.getByClipId(clipId);
      
      // Build captions object for job
      let captions: any = undefined;
      if (savedCaptions && savedCaptions.words.length > 0) {
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

      // Add job to queue with captions
      const job = await addClipGenerationJob({
        clipId,
        videoId: clip.videoId,
        sourceType,
        sourceUrl,
        storageKey,
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio,
        quality,
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
}
