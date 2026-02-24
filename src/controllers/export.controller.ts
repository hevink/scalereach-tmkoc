import { Context } from "hono";
import { nanoid } from "nanoid";
import { ClipModel } from "../models/clip.model";
import { VideoModel } from "../models/video.model";
import { WorkspaceModel } from "../models/workspace.model";
import { ClipCaptionModel } from "../models/clip-caption.model";
import { addClipGenerationJob, getClipJobStatus } from "../jobs/queue";
import { getPlanConfig } from "../config/plan-config";
import { VideoConfigModel } from "../models/video-config.model";
import { BackgroundVideoModel } from "../models/background-video.model";

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
   * Get caption data (words and style) for a clip from clip_caption table
   * This includes any user edits to captions
   */
  private static async getClipCaptionData(clipId: string) {
    const caption = await ClipCaptionModel.getByClipId(clipId);
    if (!caption) return null;
    return {
      words: caption.words || [],
      style: caption.styleConfig,
      isEdited: caption.isEdited,
    };
  }

  /**
   * Extract words for clip time range from video transcript (fallback)
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
   * Uses edited captions from clip_caption table if available
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

      // Get caption data from clip_caption table (includes user edits)
      // Falls back to extracting from video transcript if no clip caption exists
      const captionData = await ExportController.getClipCaptionData(clipId);
      let words: Array<{ word: string; start: number; end: number }>;
      let style: any;

      if (captionData && captionData.words.length > 0) {
        // Use edited captions from clip_caption table
        words = captionData.words.map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        }));
        style = captionData.style;
        console.log(`[EXPORT CONTROLLER] Using edited captions: ${words.length} words, edited: ${captionData.isEdited}`);
      } else {
        // Fallback to extracting from video transcript
        words = ExportController.extractClipWords(
          video.transcriptWords as any[],
          clip.startTime,
          clip.endTime
        );
        style = undefined;
        console.log(`[EXPORT CONTROLLER] Using original transcript: ${words.length} words`);
      }

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

      // Determine watermark based on workspace plan
      const exportWorkspaceId = (video as any).workspaceId || "";
      const ws = exportWorkspaceId ? await WorkspaceModel.getById(exportWorkspaceId) : null;
      const applyWatermark = getPlanConfig(ws?.plan || "free").limits.watermark;

      // Load video config to check enableCaptions flag
      const videoConfig = await VideoConfigModel.getByVideoId(clip.videoId);
      const captionsEnabled = videoConfig?.enableCaptions ?? true;
      // Emojis and intro title disabled for now
      const introTitleEnabled = videoConfig?.enableIntroTitle ?? true;
      const emojisEnabled = false;

      // Resolve split-screen background video if enabled
      let splitScreenData: { backgroundVideoId: string; backgroundStorageKey: string; backgroundDuration: number; splitRatio: number } | undefined;
      if (videoConfig?.enableSplitScreen) {
        try {
          let bgVideo = null;
          if (videoConfig.splitScreenBgVideoId) {
            bgVideo = await BackgroundVideoModel.getById(videoConfig.splitScreenBgVideoId);
          } else if (videoConfig.splitScreenBgCategoryId) {
            bgVideo = await BackgroundVideoModel.getRandomByCategory(videoConfig.splitScreenBgCategoryId);
          }
          if (bgVideo) {
            splitScreenData = {
              backgroundVideoId: bgVideo.id,
              backgroundStorageKey: bgVideo.storageKey,
              backgroundDuration: bgVideo.duration,
              splitRatio: videoConfig.splitRatio ?? 50,
            };
            console.log(`[EXPORT CONTROLLER] Split-screen enabled: bg=${bgVideo.displayName}, ratio=${splitScreenData.splitRatio}`);
          }
        } catch (bgError) {
          console.warn(`[EXPORT CONTROLLER] Failed to resolve split-screen background:`, bgError);
        }
      }

      console.log(`[EXPORT CONTROLLER] Export job data: captionsEnabled=${captionsEnabled}, wordCount=${words.length}, hasStyle=${!!style}`);

      // Add job to queue for clip generation with caption data
      await addClipGenerationJob({
        clipId,
        videoId: clip.videoId,
        workspaceId: exportWorkspaceId,
        userId: video.userId || "",
        creditCost: 0, // Export doesn't cost additional credits
        sourceType: video.sourceType as "youtube" | "upload",
        sourceUrl: video.sourceUrl || undefined,
        storageKey: video.storageKey || undefined,
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio: (clip.aspectRatio as "9:16" | "1:1" | "16:9") || "9:16",
        quality: resolutionToQuality(options?.resolution || "1080p"),
        watermark: applyWatermark,
        emojis: emojisEnabled ? ((clip as any).transcriptWithEmojis || undefined) : undefined,
        introTitle: introTitleEnabled ? ((clip as any).introTitle || undefined) : undefined,
        captions: captionsEnabled && words.length > 0 ? {
          words,
          style: style || undefined,
        } : undefined,
        splitScreen: splitScreenData,
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
      const statusMap: Record<string, string> = {
        "detected": "queued",
        "generating": "processing",
        "ready": "completed",
        "exported": "completed",
        "failed": "failed",
      };

      const exportStatus = statusMap[clip.status] || "processing";

      // Get real progress from BullMQ job
      let progress = 0;
      if (exportStatus === "queued") {
        progress = 0;
      } else if (exportStatus === "completed") {
        progress = 100;
      } else if (exportStatus === "failed") {
        progress = 0;
      } else {
        // Try to get actual job progress from BullMQ
        const jobId = `clip-${exportId}`;
        const jobStatus = await getClipJobStatus(jobId);
        if (jobStatus && typeof jobStatus.progress === "number") {
          progress = jobStatus.progress;
        } else {
          progress = 10; // Minimal progress to show something is happening
        }
      }

      return c.json({
        export: {
          id: exportId,
          clipId: clip.id,
          status: exportStatus,
          progress,
          downloadUrl: exportStatus === "completed" ? (clip.storageUrl || undefined) : undefined,
          error: exportStatus === "failed" ? (clip.errorMessage || "Export failed") : undefined,
          createdAt: clip.createdAt?.toISOString(),
        },
      });
    }

    // Fallback for export IDs that aren't clip IDs
    return c.json({
      export: {
        id: exportId,
        status: "processing",
        progress: 10,
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
   * Uses edited captions from clip_caption table if available
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

      // Batch fetch all clips and videos upfront — avoids N+1 queries in the loop
      const clips = await ClipModel.getByIds(clipIds);
      const clipMap = new Map(clips.map(c => [c.id, c]));

      const videoIds = [...new Set(clips.map(c => c.videoId))];
      const videos = await VideoModel.getByIds(videoIds);
      const videoMap = new Map(videos.map(v => [v.id, v]));

      // Fetch workspace once
      const firstVideo = videos[0];
      const batchWorkspaceId = (firstVideo as any)?.workspaceId || "";
      const batchWs = batchWorkspaceId ? await WorkspaceModel.getById(batchWorkspaceId) : null;
      const batchWatermark = getPlanConfig(batchWs?.plan || "free").limits.watermark;

      // Fetch video configs for all unique videoIds at once
      const videoConfigs = await Promise.all(videoIds.map(id => VideoConfigModel.getByVideoId(id)));
      const videoConfigMap = new Map(videoIds.map((id, i) => [id, videoConfigs[i]]));

      // Pre-resolve split-screen background videos per videoId
      const bgVideoMap = new Map<string, any>();
      for (const [vid, config] of videoConfigMap) {
        if (!config?.enableSplitScreen) continue;
        try {
          let bgVideo = null;
          if (config.splitScreenBgVideoId) {
            bgVideo = await BackgroundVideoModel.getById(config.splitScreenBgVideoId);
          } else if (config.splitScreenBgCategoryId) {
            bgVideo = await BackgroundVideoModel.getRandomByCategory(config.splitScreenBgCategoryId);
          }
          if (bgVideo) bgVideoMap.set(vid, bgVideo);
        } catch (bgError) {
          console.warn(`[EXPORT CONTROLLER] Failed to resolve split-screen background for video ${vid}:`, bgError);
        }
      }

      const exports = [];

      // Map resolution to quality format expected by ClipGenerationJobData
      const resolutionToQuality = (res: string): "720p" | "1080p" | "4k" => {
        if (res === "4k") return "4k";
        if (res === "720p") return "720p";
        return "1080p";
      };

      for (const clipId of clipIds) {
        const clip = clipMap.get(clipId);
        if (!clip) continue;

        const video = videoMap.get(clip.videoId);
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

        // Get caption data from clip_caption table (includes user edits)
        const captionData = await ExportController.getClipCaptionData(clipId);
        let words: Array<{ word: string; start: number; end: number }>;
        let style: any;

        if (captionData && captionData.words.length > 0) {
          words = captionData.words.map((w: any) => ({
            word: w.word,
            start: w.start,
            end: w.end,
          }));
          style = captionData.style;
        } else {
          words = ExportController.extractClipWords(
            video.transcriptWords as any[],
            clip.startTime,
            clip.endTime
          );
          style = undefined;
        }

        // Use pre-fetched video config and background video (avoids per-clip DB queries)
        const batchVideoConfig = videoConfigMap.get(clip.videoId);
        const batchCaptionsEnabled = batchVideoConfig?.enableCaptions ?? true;
        const batchIntroTitleEnabled = batchVideoConfig?.enableIntroTitle ?? true;
        const batchEmojisEnabled = false;

        // Resolve split-screen from pre-fetched map
        let batchSplitScreenData: { backgroundVideoId: string; backgroundStorageKey: string; backgroundDuration: number; splitRatio: number } | undefined;
        if (batchVideoConfig?.enableSplitScreen) {
          const bgVideo = bgVideoMap.get(clip.videoId);
          if (bgVideo) {
            batchSplitScreenData = {
              backgroundVideoId: bgVideo.id,
              backgroundStorageKey: bgVideo.storageKey,
              backgroundDuration: bgVideo.duration,
              splitRatio: batchVideoConfig.splitRatio ?? 50,
            };
          }
        }

        // Add job to queue
        await addClipGenerationJob({
          clipId,
          videoId: clip.videoId,
          workspaceId: batchWorkspaceId,
          userId: video.userId || "",
          creditCost: 0, // Batch export doesn't cost additional credits
          sourceType: video.sourceType as "youtube" | "upload",
          sourceUrl: video.sourceUrl || undefined,
          storageKey: video.storageKey || undefined,
          startTime: clip.startTime,
          endTime: clip.endTime,
          aspectRatio: (clip.aspectRatio as "9:16" | "1:1" | "16:9") || "9:16",
          quality: resolutionToQuality(options?.resolution || "1080p"),
          watermark: batchWatermark,
          emojis: batchEmojisEnabled ? ((clip as any).transcriptWithEmojis || undefined) : undefined,
          introTitle: batchIntroTitleEnabled ? ((clip as any).introTitle || undefined) : undefined,
          captions: batchCaptionsEnabled && words.length > 0 ? {
            words,
            style: style || undefined,
          } : undefined,
          splitScreen: batchSplitScreenData,
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
