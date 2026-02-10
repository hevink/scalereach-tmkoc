import { db } from "../db";
import { clipTextOverlay, TextOverlayData } from "../db/schema/clip-text-overlay.schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export class ClipTextOverlayModel {
  private static log(op: string, details?: any) {
    console.log(`[CLIP_TEXT_OVERLAY_MODEL] ${op}`, details ? JSON.stringify(details) : "");
  }

  static async getByClipId(clipId: string): Promise<{ id: string; clipId: string; overlays: TextOverlayData[] } | null> {
    this.log("GET_BY_CLIP_ID", { clipId });
    const result = await db.select().from(clipTextOverlay).where(eq(clipTextOverlay.clipId, clipId));
    return result[0] || null;
  }

  static async upsert(clipId: string, overlays: TextOverlayData[]) {
    this.log("UPSERT", { clipId, count: overlays.length });
    const existing = await this.getByClipId(clipId);
    if (existing) {
      const result = await db
        .update(clipTextOverlay)
        .set({ overlays, updatedAt: new Date() })
        .where(eq(clipTextOverlay.clipId, clipId))
        .returning();
      return result[0];
    }
    const result = await db
      .insert(clipTextOverlay)
      .values({ id: nanoid(), clipId, overlays })
      .returning();
    return result[0];
  }

  static async delete(clipId: string) {
    this.log("DELETE", { clipId });
    await db.delete(clipTextOverlay).where(eq(clipTextOverlay.clipId, clipId));
  }
}
