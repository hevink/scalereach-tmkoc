import { db } from "../db";
import { clipCaption, CaptionWord } from "../db/schema/clip-caption.schema";
import { CaptionStyleConfig } from "../db/schema/project.schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export class ClipCaptionModel {
  private static log(op: string, details?: any) {
    console.log(`[CLIP_CAPTION_MODEL] ${op}`, details ? JSON.stringify(details) : "");
  }

  static async getByClipId(clipId: string) {
    this.log("GET_BY_CLIP_ID", { clipId });
    const result = await db.select().from(clipCaption).where(eq(clipCaption.clipId, clipId));
    return result[0] || null;
  }

  static async create(data: {
    clipId: string;
    words: CaptionWord[];
    styleConfig?: CaptionStyleConfig;
    templateId?: string;
  }) {
    this.log("CREATE", { clipId: data.clipId, wordCount: data.words.length });
    const result = await db
      .insert(clipCaption)
      .values({
        id: nanoid(),
        clipId: data.clipId,
        words: data.words,
        styleConfig: data.styleConfig,
        templateId: data.templateId,
        isEdited: false,
      })
      .returning();
    return result[0];
  }

  static async updateWords(clipId: string, words: CaptionWord[]) {
    this.log("UPDATE_WORDS", { clipId, wordCount: words.length });
    const result = await db
      .update(clipCaption)
      .set({ words, isEdited: true, updatedAt: new Date() })
      .where(eq(clipCaption.clipId, clipId))
      .returning();
    return result[0];
  }

  static async updateStyle(clipId: string, styleConfig: CaptionStyleConfig, templateId?: string) {
    this.log("UPDATE_STYLE", { clipId, templateId });
    const result = await db
      .update(clipCaption)
      .set({ styleConfig, templateId, updatedAt: new Date() })
      .where(eq(clipCaption.clipId, clipId))
      .returning();
    return result[0];
  }

  static async upsert(data: {
    clipId: string;
    words: CaptionWord[];
    styleConfig?: CaptionStyleConfig;
    templateId?: string;
  }) {
    const existing = await this.getByClipId(data.clipId);
    if (existing) {
      const result = await db
        .update(clipCaption)
        .set({
          words: data.words,
          styleConfig: data.styleConfig,
          templateId: data.templateId,
          updatedAt: new Date(),
        })
        .where(eq(clipCaption.clipId, data.clipId))
        .returning();
      return result[0];
    }
    return this.create(data);
  }

  static async delete(clipId: string) {
    this.log("DELETE", { clipId });
    await db.delete(clipCaption).where(eq(clipCaption.clipId, clipId));
  }
}
