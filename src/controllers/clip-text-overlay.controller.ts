import { Context } from "hono";
import { ClipTextOverlayModel } from "../models/clip-text-overlay.model";

export class ClipTextOverlayController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[CLIP_TEXT_OVERLAY CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * GET /api/clips/:id/text-overlays
   */
  static async getTextOverlays(c: Context) {
    const clipId = c.req.param("id");
    ClipTextOverlayController.logRequest(c, "GET_TEXT_OVERLAYS", { clipId });

    try {
      const record = await ClipTextOverlayModel.getByClipId(clipId);
      return c.json({
        clipId,
        overlays: record?.overlays ?? [],
      });
    } catch (error) {
      console.error("[CLIP_TEXT_OVERLAY CONTROLLER] GET error:", error);
      return c.json({ error: "Failed to get text overlays" }, 500);
    }
  }

  /**
   * PUT /api/clips/:id/text-overlays
   */
  static async updateTextOverlays(c: Context) {
    const clipId = c.req.param("id");
    ClipTextOverlayController.logRequest(c, "UPDATE_TEXT_OVERLAYS", { clipId });

    try {
      const body = await c.req.json();
      const { overlays } = body;

      if (!Array.isArray(overlays)) {
        return c.json({ error: "overlays must be an array" }, 400);
      }

      // If empty array, delete the record
      if (overlays.length === 0) {
        await ClipTextOverlayModel.delete(clipId);
        return c.json({ clipId, overlays: [] });
      }

      const record = await ClipTextOverlayModel.upsert(clipId, overlays);
      return c.json({
        clipId,
        overlays: record.overlays,
      });
    } catch (error) {
      console.error("[CLIP_TEXT_OVERLAY CONTROLLER] PUT error:", error);
      return c.json({ error: "Failed to update text overlays" }, 500);
    }
  }
}
