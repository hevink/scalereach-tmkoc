import { Context } from "hono";
import { ClipModel } from "../models/clip.model";
import { VideoModel } from "../models/video.model";
import { addClipGenerationJob, getClipJobStatus } from "../jobs/queue";

export class SmartCropController {
  private static logRequest(c: Context, operation: string, details?: any) {
    console.log(
      `[SMART CROP CONTROLLER] ${operation} - ${c.req.method} ${c.req.url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * POST /api/clips/:id/smart-crop
   * Trigger smart crop by adding a clip generation job with smartCropEnabled
   */
  static async trigger(c: Context) {
    const clipId = c.req.param("id");
    SmartCropController.logRequest(c, "TRIGGER", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      // Clip must be ready before smart crop can run
      if (clip.status !== "ready" && clip.status !== "exported") {
        return c.json({ error: "Clip must be generated first before creating a vertical version" }, 400);
      }

      const smartCropStatus = (clip as any).smartCropStatus;

      // Idempotent: already done
      if (smartCropStatus === "done") {
        return c.json({
          status: "done",
          smartCropStorageUrl: (clip as any).smartCropStorageUrl,
        });
      }

      // Idempotent: already in progress
      if (smartCropStatus === "processing" || smartCropStatus === "pending") {
        return c.json({ status: smartCropStatus, jobId: `clip-${clipId}` });
      }

      const video = await VideoModel.getById(clip.videoId);
      if (!video) return c.json({ error: "Video not found" }, 404);

      // Use the clip's storageKey (already trimmed clip)
      const storageKey = clip.storageKey || clip.rawStorageKey;
      if (!storageKey) {
        return c.json({ error: "Clip has no video file. Generate the clip first." }, 400);
      }

      // Add to clip generation queue with smartCropEnabled flag
      await addClipGenerationJob({
        clipId,
        videoId: clip.videoId,
        workspaceId: (video as any).workspaceId || "",
        userId: video.userId || "",
        sourceType: (video as any).sourceType || "upload",
        storageKey,
        startTime: clip.startTime,
        endTime: clip.endTime,
        aspectRatio: "9:16",
        quality: "1080p",
        creditCost: 0, // smart crop re-generation doesn't cost credits
        smartCropEnabled: true,
        isRegenerate: true,
      });

      console.log(`[SMART CROP CONTROLLER] Job enqueued on clip queue for clip: ${clipId}`);
      return c.json({ status: "pending", jobId: `clip-${clipId}` }, 201);
    } catch (error) {
      console.error(`[SMART CROP CONTROLLER] TRIGGER error:`, error);
      return c.json({ error: "Failed to start smart crop" }, 500);
    }
  }

  /**
   * GET /api/clips/:id/smart-crop/status
   * Poll smart crop job status (uses clip generation queue)
   */
  static async status(c: Context) {
    const clipId = c.req.param("id");
    SmartCropController.logRequest(c, "STATUS", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      const smartCropStatus = (clip as any).smartCropStatus || "not_started";
      const jobStatus = await getClipJobStatus(`clip-${clipId}`);
      const progress = typeof jobStatus?.progress === "number" ? jobStatus.progress : 0;

      return c.json({
        status: smartCropStatus,
        progress,
        smartCropStorageUrl: (clip as any).smartCropStorageUrl || null,
      });
    } catch (error) {
      console.error(`[SMART CROP CONTROLLER] STATUS error:`, error);
      return c.json({ error: "Failed to get status" }, 500);
    }
  }
}
