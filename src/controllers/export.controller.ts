import { Context } from "hono";
import { nanoid } from "nanoid";
import { ClipModel } from "../models/clip.model";
import { VideoModel } from "../models/video.model";
import { addClipGenerationJob } from "../jobs/queue";
import { db } from "../db";
import { captionStyle } from "../db/schema";
import { eq } from "drizzle-orm";

export class ExportController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[EXPORT CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * Get caption style for a clip
   */
  private static async getCaptionStyle(clipId: string) {
    const result = await db.select().from(captionStyle).where(eq(captionStyle.clipId, clipId));
    return result[0]?.config;
  }

  /**
   * Extract words for clip time range from video transcript
   */
  private static extractClipWords(
    transcriptWords: any[],
    startTime: number,
    endTime: number
  ): Array<{ word: string; start: number; end: number }> {
    if (!transcriptWords || !Array.isArray(transcriptWords)) {
      return [];
    }

    return transcriptWords
      .filter((w: any) => w.start >= startTime && w.end <= endTime)
      .map((w: any) => ({
        word: w.punctuated_word || w.word,
        start: w.start - startTime, // Normalize to clip start
        end: w.end - startTime,
      }));
  }

  /**
   * POST /api/clips/:id/export
   * Initiate export for a single clip
   */
  static async initiateExport(c: Context) {
    const clipId = c.req.param("id");
    ExportController.logRequest(c, "INITIATE_EXPORT", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      const body = await c.req.json();
      const { options } = body;

      // Get the video to access the source and transcript
      const video = await VideoModel.getById(clip.videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Map resolution to quality format expected by ClipGenerationJobData
      const resolutionToQuality = (res: string): "720p" | "1080p" | "4k" => {
        if (res === "4k") return "4k";
        if (res === "720p") return "720p";
        return "1080p";
      };

      // Get caption style and words for this clip
      const style = await ExportController.getCaptionStyle(clipId);
      const words = ExportController.extractClipWords(
        video.transcriptWords as any[],
        clip.startTime,
        clip.endTime
      );

      console.log(`[EXPORT CONTROLLER] Caption data: ${words.length} words, style: ${style ? 'yes' : 'no'}`);

      // Create export record
      const exportId = nanoid();
      const exportRecord = {
        id: exportId,
        clipId,  // Include clipId so frontend can track
        format: options?.format || "mp4",
        resolution: options?.resolution || "1080p",
        status: "queued" as const,
        progress: 0,
        createdAt: new Date().toISOString(),
      };

      // Add job to queue for clip generation with caption data
      await addClipGenerationJob({
        clipId,
        videoId: clip.videoId,
        workspaceId: (video as any).workspaceId || "",
        userId: video.userId || "",
        creditCost: 0, // Export doesn't cost additional credits
        sourceType: video.sourceType as "youtube" | "upload",
        sourceUrl: video.sourceUrl || undefined,
        storageKey: video.storageKey || undefined,
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio: (clip.aspectRatio as "9:16" | "1:1" | "16:9") || "9:16",
        quality: resolutionToQuality(options?.resolution || "1080p"),
        introTitle: (clip as any).introTitle || undefined,
        captions: words.length > 0 ? {
          words,
          style: style || undefined,
        } : undefined,
      });

      // Update clip status to generating
      await ClipModel.update(clipId, { status: "generating" });

      console.log(`[EXPORT CONTROLLER] Export initiated: ${exportId} for clip ${clipId}`);

      return c.json({
        message: "Export initiated",
        export: exportRecord,
      }, 201);
    } catch (error) {
      console.error(`[EXPORT CONTROLLER] INITIATE_EXPORT error:`, error);
      return c.json({ error: "Failed to initiate export" }, 500);
    }
  }

  /**
   * GET /api/exports/:id
   * Get export status - uses clipId to check actual clip status
   */
  static async getExportStatus(c: Context) {
    const exportId = c.req.param("id");
    ExportController.logRequest(c, "GET_EXPORT_STATUS", { exportId });

    // The exportId might be the clipId or a separate export ID
    // Try to find the clip to get real status
    const clip = await ClipModel.getById(exportId);
    
    if (clip) {
      // Map clip status to export status
      const statusMap: Record<string, { status: string; progress: number }> = {
        "detected": { status: "queued", progress: 0 },
        "generating": { status: "processing", progress: 50 },
        "ready": { status: "completed", progress: 100 },
        "exported": { status: "completed", progress: 100 },
        "failed": { status: "failed", progress: 0 },
      };

      const exportStatus = statusMap[clip.status] || { status: "processing", progress: 50 };

      return c.json({
        export: {
          id: exportId,
          clipId: clip.id,
          status: exportStatus.status,
          progress: exportStatus.progress,
          downloadUrl: clip.storageUrl || undefined,
          createdAt: clip.createdAt?.toISOString(),
        },
      });
    }

    // Fallback for export IDs that aren't clip IDs
    return c.json({
      export: {
        id: exportId,
        status: "processing",
        progress: 50,
      },
    });
  }

  /**
   * GET /api/clips/:id/exports
   * Get export history for a clip
   */
  static async getExportsByClip(c: Context) {
    const clipId = c.req.param("id");
    ExportController.logRequest(c, "GET_EXPORTS_BY_CLIP", { clipId });

    // For now, return empty array since we don't have an exports table
    return c.json([]);
  }

  /**
   * POST /api/exports/batch
   * Initiate batch export for multiple clips
   */
  static async initiateBatchExport(c: Context) {
    ExportController.logRequest(c, "INITIATE_BATCH_EXPORT");

    try {
      const body = await c.req.json();
      const { clipIds, options } = body;

      if (!clipIds || !Array.isArray(clipIds) || clipIds.length === 0) {
        return c.json({ error: "clipIds array is required" }, 400);
      }

      const batchId = nanoid();
      const exports = [];

      // Map resolution to quality format expected by ClipGenerationJobData
      const resolutionToQuality = (res: string): "720p" | "1080p" | "4k" => {
        if (res === "4k") return "4k";
        if (res === "720p") return "720p";
        return "1080p";
      };

      for (const clipId of clipIds) {
        const clip = await ClipModel.getById(clipId);
        if (!clip) continue;

        const video = await VideoModel.getById(clip.videoId);
        if (!video) continue;

        const exportId = nanoid();
        exports.push({
          id: exportId,
          clipId,
          format: options?.format || "mp4",
          resolution: options?.resolution || "1080p",
          status: "queued",
          progress: 0,
          createdAt: new Date().toISOString(),
        });

        // Get caption style and words for this clip
        const style = await ExportController.getCaptionStyle(clipId);
        const words = ExportController.extractClipWords(
          video.transcriptWords as any[],
          clip.startTime,
          clip.endTime
        );

        // Add job to queue
        await addClipGenerationJob({
          clipId,
          videoId: clip.videoId,
          workspaceId: (video as any).workspaceId || "",
          userId: video.userId || "",
          creditCost: 0, // Batch export doesn't cost additional credits
          sourceType: video.sourceType as "youtube" | "upload",
          sourceUrl: video.sourceUrl || undefined,
          storageKey: video.storageKey || undefined,
          startTime: clip.startTime,
          endTime: clip.endTime,
          aspectRatio: (clip.aspectRatio as "9:16" | "1:1" | "16:9") || "9:16",
          quality: resolutionToQuality(options?.resolution || "1080p"),
          introTitle: (clip as any).introTitle || undefined,
          captions: words.length > 0 ? {
            words,
            style: style || undefined,
          } : undefined,
        });

        await ClipModel.update(clipId, { status: "generating" });
      }

      console.log(`[EXPORT CONTROLLER] Batch export initiated: ${batchId} with ${exports.length} clips`);

      return c.json({
        message: "Batch export initiated",
        batchExport: {
          id: batchId,
          totalClips: exports.length,
          completedClips: 0,
          failedClips: 0,
          status: "processing",
          exports,
        },
      }, 201);
    } catch (error) {
      console.error(`[EXPORT CONTROLLER] INITIATE_BATCH_EXPORT error:`, error);
      return c.json({ error: "Failed to initiate batch export" }, 500);
    }
  }
}
