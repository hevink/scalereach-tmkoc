import { Context } from "hono";
import { nanoid } from "nanoid";
import { VideoModel } from "../models/video.model";
import { ClipModel, ClipFilters } from "../models/clip.model";
import { MinutesModel } from "../models/minutes.model";
import {
  ViralDetectionService,
  ViralDetectionOptions,
  MIN_DURATION_LIMIT,
  MAX_DURATION_LIMIT,
  DEFAULT_MIN_DURATION,
  DEFAULT_MAX_DURATION,
  DEFAULT_MAX_CLIPS,
} from "../services/viral-detection.service";
import { R2Service } from "../services/r2.service";
import { getPlanConfig, calculateMinuteConsumption } from "../config/plan-config";
import { canRegenerateVideo } from "../services/minutes-validation.service";
import { db } from "../db";
import { videoExport, dubbedClipAudio } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Controller for viral detection API endpoints
 * Validates: Requirements 5.1, 5.2
 */
export class ViralDetectionController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[VIRAL DETECTION CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * POST /api/videos/:id/analyze
   * Trigger viral detection analysis for a video
   * Validates: Requirements 5.1, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
   */
  static async analyzeVideo(c: Context) {
    const videoId = c.req.param("id");
    ViralDetectionController.logRequest(c, "ANALYZE_VIDEO", { videoId });

    try {
      // Get the video
      const video = await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Check if video has transcript
      if (!video.transcript || !video.transcriptWords) {
        return c.json({
          error: "Video must be transcribed before viral detection can be performed"
        }, 400);
      }

      // Validate regeneration limits and minutes
      if (video.workspaceId && video.duration) {
        const { WorkspaceModel } = await import("../models/workspace.model");
        const ws = await WorkspaceModel.getById(video.workspaceId);
        const plan = ws?.plan || "free";
        const planConfig = getPlanConfig(plan);
        const minutesBalance = await MinutesModel.getBalance(video.workspaceId);
        const regenerationCount = await MinutesModel.getRegenerationCount(videoId);

        const regenValidation = canRegenerateVideo(
          planConfig,
          video.duration,
          regenerationCount,
          minutesBalance.minutesRemaining
        );

        if (!regenValidation.allowed) {
          return c.json({
            error: regenValidation.message,
            reason: regenValidation.reason,
            upgrade: regenValidation.upgrade,
          }, regenValidation.reason === "INSUFFICIENT_MINUTES" ? 402 : 400);
        }

        // Deduct minutes and increment regeneration count
        const minutesToDeduct = calculateMinuteConsumption(video.duration);
        await MinutesModel.deductMinutes({
          workspaceId: video.workspaceId,
          videoId,
          amount: minutesToDeduct,
          type: "regenerate",
        });
        await MinutesModel.incrementRegenerationCount(videoId);
        console.log(`[VIRAL DETECTION CONTROLLER] Deducted ${minutesToDeduct} minutes for re-analysis of video ${videoId}`);
      }

      // Parse request body for options
      let body: any = {};
      try {
        body = await c.req.json();
      } catch {
        // No body provided, use defaults
      }

      // Build detection options with validation
      const options: ViralDetectionOptions = {
        minDuration: body.minDuration ?? DEFAULT_MIN_DURATION,
        maxDuration: body.maxDuration ?? DEFAULT_MAX_DURATION,
        maxClips: body.maxClips ?? DEFAULT_MAX_CLIPS,
        videoTitle: video.title || undefined,
        // Editing options
        enableEmojis: false,
        enableIntroTitle: body.enableIntroTitle ?? true,
      };

      // Validate options
      const validation = ViralDetectionService.validateOptions(options);
      if (!validation.valid) {
        return c.json({ 
          error: validation.error,
          constraints: {
            minDurationLimit: MIN_DURATION_LIMIT,
            maxDurationLimit: MAX_DURATION_LIMIT,
          }
        }, 400);
      }

      console.log(`[VIRAL DETECTION CONTROLLER] Starting analysis with options:`, options);

      // Delete existing clips for this video (re-analysis)
      await ClipModel.deleteByVideoId(videoId);

      // Run viral detection
      const viralClips = await ViralDetectionService.detectViralClips(
        video.transcript,
        video.transcriptWords as { word: string; start: number; end: number }[],
        options
      );

      // Save clips to database
      if (viralClips.length > 0) {
        const clipRecords = viralClips.map((clip) => ({
          id: nanoid(),
          videoId: videoId,
          title: clip.title,
          introTitle: clip.introTitle,
          startTime: Math.round(clip.startTime),
          endTime: Math.round(clip.endTime),
          duration: Math.round(clip.endTime - clip.startTime),
          transcript: clip.transcript,
          transcriptWithEmojis: clip.transcriptWithEmojis,
          score: clip.viralityScore,
          viralityReason: clip.viralityReason,
          hooks: clip.hooks,
          emotions: clip.emotions,
          recommendedPlatforms: clip.recommendedPlatforms,
          status: "detected" as const,
        }));

        await ClipModel.createMany(clipRecords);
      }

      // Update video status to completed if it was analyzing
      if (video.status === "analyzing" || video.status === "transcribing") {
        await VideoModel.update(videoId, { status: "completed" });
      }

      console.log(`[VIRAL DETECTION CONTROLLER] Analysis complete, found ${viralClips.length} clips`);

      return c.json({
        message: "Viral detection analysis complete",
        videoId,
        clipsFound: viralClips.length,
        options: {
          minDuration: options.minDuration,
          maxDuration: options.maxDuration,
          maxClips: options.maxClips,
        },
      });
    } catch (error) {
      console.error(`[VIRAL DETECTION CONTROLLER] ANALYZE_VIDEO error:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to analyze video: ${errorMessage}` }, 500);
    }
  }

  /**
   * GET /api/videos/:id/clips
   * Get detected clips for a video with optional filters
   * Validates: Requirements 5.2, 5.9, 22.6
   */
  static async getVideoClips(c: Context) {
    const videoId = c.req.param("id");
    ViralDetectionController.logRequest(c, "GET_VIDEO_CLIPS", { videoId });

    try {
      // Verify video exists
      const video = await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Parse query parameters for filters
      const query = c.req.query();
      const filters: ClipFilters = {};

      // Score filters
      if (query.minScore) {
        const minScore = parseInt(query.minScore, 10);
        if (!isNaN(minScore) && minScore >= 0 && minScore <= 100) {
          filters.minScore = minScore;
        }
      }
      if (query.maxScore) {
        const maxScore = parseInt(query.maxScore, 10);
        if (!isNaN(maxScore) && maxScore >= 0 && maxScore <= 100) {
          filters.maxScore = maxScore;
        }
      }

      // Status filter
      if (query.status) {
        filters.status = query.status;
      }

      // Favorited filter
      if (query.favorited !== undefined) {
        filters.favorited = query.favorited === "true";
      }

      // Sorting
      if (query.sortBy && ["score", "duration", "createdAt"].includes(query.sortBy)) {
        filters.sortBy = query.sortBy as "score" | "duration" | "createdAt";
      }
      if (query.sortOrder && ["asc", "desc"].includes(query.sortOrder)) {
        filters.sortOrder = query.sortOrder as "asc" | "desc";
      }

      // Get clips with filters (default sorted by score descending)
      const clips = await ClipModel.getByVideoId(videoId, filters);

      // Generate presigned URLs for clips that have been generated
      const clipsWithUrls = await Promise.all(
        clips.map(async (clip) => {
          let downloadUrl: string | null = null;
          let thumbnailDownloadUrl: string | null = null;
          
          if (clip.storageKey) {
            downloadUrl = await R2Service.getSignedDownloadUrl(clip.storageKey, 3600);
          }
          
          // Generate signed URL for thumbnail if it exists
          if (clip.thumbnailKey) {
            thumbnailDownloadUrl = await R2Service.getSignedDownloadUrl(clip.thumbnailKey, 3600);
          }
          
          return { 
            ...clip, 
            downloadUrl,
            // Use signed thumbnail URL if available, otherwise use stored public URL
            thumbnailUrl: thumbnailDownloadUrl || clip.thumbnailUrl,
          };
        })
      );

      return c.json({
        videoId,
        clips: clipsWithUrls,
        count: clipsWithUrls.length,
        filters: {
          minScore: filters.minScore,
          maxScore: filters.maxScore,
          status: filters.status,
          favorited: filters.favorited,
          sortBy: filters.sortBy || "score",
          sortOrder: filters.sortOrder || "desc",
        },
      });
    } catch (error) {
      console.error(`[VIRAL DETECTION CONTROLLER] GET_VIDEO_CLIPS error:`, error);
      return c.json({ error: "Failed to fetch video clips" }, 500);
    }
  }

  /**
   * GET /api/clips/:id
   * Get a single clip by ID
   */
  static async getClipById(c: Context) {
    const clipId = c.req.param("id");
    ViralDetectionController.logRequest(c, "GET_CLIP_BY_ID", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Generate presigned URL if clip has been generated
      let downloadUrl: string | null = null;
      let thumbnailDownloadUrl: string | null = null;
      
      if (clip.storageKey) {
        downloadUrl = await R2Service.getSignedDownloadUrl(clip.storageKey, 3600); // 1 hour
      }
      
      // Generate signed URL for thumbnail if it exists
      if (clip.thumbnailKey) {
        thumbnailDownloadUrl = await R2Service.getSignedDownloadUrl(clip.thumbnailKey, 3600);
      }

      return c.json({
        ...clip,
        downloadUrl,
        // Use signed thumbnail URL if available, otherwise use stored public URL
        thumbnailUrl: thumbnailDownloadUrl || clip.thumbnailUrl,
      });
    } catch (error) {
      console.error(`[VIRAL DETECTION CONTROLLER] GET_CLIP_BY_ID error:`, error);
      return c.json({ error: "Failed to fetch clip" }, 500);
    }
  }

  /**
   * PATCH /api/clips/:id
   * Update clip metadata (title, introTitle)
   */
  static async updateClip(c: Context) {
    const clipId = c.req.param("id");
    ViralDetectionController.logRequest(c, "UPDATE_CLIP", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      const body = await c.req.json();
      const updates: Record<string, any> = {};
      if (typeof body.title === "string") updates.title = body.title;
      if (typeof body.introTitle === "string") updates.introTitle = body.introTitle;

      if (Object.keys(updates).length === 0) {
        return c.json({ error: "No valid fields to update" }, 400);
      }

      const updated = await ClipModel.update(clipId, updates);
      return c.json(updated);
    } catch (error) {
      console.error(`[VIRAL DETECTION CONTROLLER] UPDATE_CLIP error:`, error);
      return c.json({ error: "Failed to update clip" }, 500);
    }
  }

  /**
   * DELETE /api/clips/:id
   * Delete a clip
   */
  static async deleteClip(c: Context) {
    const clipId = c.req.param("id");
    ViralDetectionController.logRequest(c, "DELETE_CLIP", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Delete clip R2 files + export R2 files + dubbed audio
      const exportKeys = await db
        .select({ storageKey: videoExport.storageKey })
        .from(videoExport)
        .where(eq(videoExport.clipId, clipId));

      const clipAudioRows = await db
        .select({ audioKey: dubbedClipAudio.audioKey })
        .from(dubbedClipAudio)
        .where(eq(dubbedClipAudio.clipId, clipId));

      await Promise.allSettled(
        [
          clip.storageKey, clip.rawStorageKey, clip.thumbnailKey,
          ...exportKeys.map(e => e.storageKey),
          ...clipAudioRows.map(a => a.audioKey),
        ]
          .filter(Boolean)
          .map((key) => R2Service.deleteFile(key as string))
      );

      await ClipModel.delete(clipId);

      return c.json({ message: "Clip deleted successfully" });
    } catch (error) {
      console.error(`[VIRAL DETECTION CONTROLLER] DELETE_CLIP error:`, error);
      return c.json({ error: "Failed to delete clip" }, 500);
    }
  }

  /**
   * POST /api/clips/:id/favorite
   * Toggle favorite status for a clip
   * Validates: Requirements 22.5
   */
  static async toggleFavorite(c: Context) {
    const clipId = c.req.param("id");
    ViralDetectionController.logRequest(c, "TOGGLE_FAVORITE", { clipId });

    try {
      const clip = await ClipModel.toggleFavorite(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      return c.json({
        message: clip.favorited ? "Clip favorited" : "Clip unfavorited",
        clip,
      });
    } catch (error) {
      console.error(`[VIRAL DETECTION CONTROLLER] TOGGLE_FAVORITE error:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("not found")) {
        return c.json({ error: "Clip not found" }, 404);
      }
      return c.json({ error: "Failed to toggle favorite" }, 500);
    }
  }
}
