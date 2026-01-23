/**
 * Clip Caption Controller
 * Handles API endpoints for caption editing per clip
 */

import { Context } from "hono";
import { ClipModel } from "../models/clip.model";
import { ClipCaptionModel } from "../models/clip-caption.model";
import { VideoModel } from "../models/video.model";
import { CaptionWord } from "../db/schema/clip-caption.schema";
import { CaptionStyleConfig } from "../db/schema/project.schema";
import { TranscriptWord } from "../services/deepgram.service";
import { nanoid } from "nanoid";

/**
 * Extract words from video transcript for a clip's time range
 */
function extractWordsForClip(
  transcriptWords: TranscriptWord[],
  startTime: number,
  endTime: number
): CaptionWord[] {
  if (!transcriptWords?.length) return [];

  return transcriptWords
    .filter((w) => w.start >= startTime && w.end <= endTime)
    .map((w) => ({
      id: nanoid(8),
      word: w.word,
      start: Number((w.start - startTime).toFixed(3)),
      end: Number((w.end - startTime).toFixed(3)),
    }));
}

export class ClipCaptionController {
  private static log(c: Context, op: string, details?: any) {
    console.log(`[CLIP_CAPTION_CTRL] ${op} - ${c.req.method} ${c.req.url}`, details || "");
  }

  /**
   * GET /api/clips/:id/captions
   * Get caption words and style for a clip (auto-creates if not exists)
   */
  static async getCaptions(c: Context) {
    const clipId = c.req.param("id");
    ClipCaptionController.log(c, "GET_CAPTIONS", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      let caption = await ClipCaptionModel.getByClipId(clipId);

      // Auto-create if not exists
      if (!caption) {
        const video = await VideoModel.getById(clip.videoId);
        const words = extractWordsForClip(
          (video?.transcriptWords as TranscriptWord[]) || [],
          clip.startTime,
          clip.endTime
        );

        caption = await ClipCaptionModel.create({ clipId, words });
      }

      return c.json({
        clipId,
        words: caption.words,
        style: caption.styleConfig,
        templateId: caption.templateId,
        isEdited: caption.isEdited,
      });
    } catch (error) {
      console.error("[CLIP_CAPTION_CTRL] GET_CAPTIONS error:", error);
      return c.json({ error: "Failed to get captions" }, 500);
    }
  }

  /**
   * PUT /api/clips/:id/captions/words
   * Bulk update all words
   */
  static async updateWords(c: Context) {
    const clipId = c.req.param("id");
    ClipCaptionController.log(c, "UPDATE_WORDS", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      const body = await c.req.json<{ words: CaptionWord[] }>();
      if (!Array.isArray(body.words)) {
        return c.json({ error: "words must be an array" }, 400);
      }

      // Validate words
      for (const w of body.words) {
        if (!w.id || typeof w.word !== "string" || typeof w.start !== "number" || typeof w.end !== "number") {
          return c.json({ error: "Invalid word format" }, 400);
        }
        if (w.start < 0 || w.end <= w.start) {
          return c.json({ error: "Invalid word timing" }, 400);
        }
      }

      let caption = await ClipCaptionModel.getByClipId(clipId);
      if (!caption) {
        caption = await ClipCaptionModel.create({ clipId, words: body.words });
      } else {
        caption = await ClipCaptionModel.updateWords(clipId, body.words);
      }

      return c.json({
        clipId,
        words: caption?.words,
        style: caption?.styleConfig,
        templateId: caption?.templateId,
        isEdited: caption?.isEdited,
      });
    } catch (error) {
      console.error("[CLIP_CAPTION_CTRL] UPDATE_WORDS error:", error);
      return c.json({ error: "Failed to update words" }, 500);
    }
  }

  /**
   * PATCH /api/clips/:id/captions/style
   * Update style config only
   */
  static async updateStyle(c: Context) {
    const clipId = c.req.param("id");
    ClipCaptionController.log(c, "UPDATE_STYLE", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      const body = await c.req.json<{ style: CaptionStyleConfig; templateId?: string }>();
      if (!body.style) return c.json({ error: "style is required" }, 400);

      let caption = await ClipCaptionModel.getByClipId(clipId);
      if (!caption) {
        const video = await VideoModel.getById(clip.videoId);
        const words = extractWordsForClip(
          (video?.transcriptWords as TranscriptWord[]) || [],
          clip.startTime,
          clip.endTime
        );
        caption = await ClipCaptionModel.create({
          clipId,
          words,
          styleConfig: body.style,
          templateId: body.templateId,
        });
      } else {
        caption = await ClipCaptionModel.updateStyle(clipId, body.style, body.templateId);
      }

      return c.json({
        clipId,
        words: caption?.words,
        style: caption?.styleConfig,
        templateId: caption?.templateId,
        isEdited: caption?.isEdited,
      });
    } catch (error) {
      console.error("[CLIP_CAPTION_CTRL] UPDATE_STYLE error:", error);
      return c.json({ error: "Failed to update style" }, 500);
    }
  }

  /**
   * POST /api/clips/:id/captions/words
   * Add a new word
   */
  static async addWord(c: Context) {
    const clipId = c.req.param("id");
    ClipCaptionController.log(c, "ADD_WORD", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      const body = await c.req.json<{ word: string; start: number; end: number; afterWordId?: string }>();
      if (!body.word || typeof body.start !== "number" || typeof body.end !== "number") {
        return c.json({ error: "word, start, and end are required" }, 400);
      }
      if (body.start < 0 || body.end <= body.start) {
        return c.json({ error: "Invalid timing" }, 400);
      }

      let caption = await ClipCaptionModel.getByClipId(clipId);
      if (!caption) {
        const video = await VideoModel.getById(clip.videoId);
        const words = extractWordsForClip(
          (video?.transcriptWords as TranscriptWord[]) || [],
          clip.startTime,
          clip.endTime
        );
        caption = await ClipCaptionModel.create({ clipId, words });
      }

      const newWord: CaptionWord = {
        id: nanoid(8),
        word: body.word,
        start: body.start,
        end: body.end,
      };

      const words = [...(caption?.words || [])];
      if (body.afterWordId) {
        const idx = words.findIndex((w) => w.id === body.afterWordId);
        if (idx >= 0) {
          words.splice(idx + 1, 0, newWord);
        } else {
          words.push(newWord);
        }
      } else {
        // Insert by timing
        const idx = words.findIndex((w) => w.start > body.start);
        if (idx >= 0) {
          words.splice(idx, 0, newWord);
        } else {
          words.push(newWord);
        }
      }

      caption = await ClipCaptionModel.updateWords(clipId, words);

      return c.json({
        clipId,
        words: caption?.words,
        style: caption?.styleConfig,
        templateId: caption?.templateId,
        isEdited: caption?.isEdited,
        addedWord: newWord,
      });
    } catch (error) {
      console.error("[CLIP_CAPTION_CTRL] ADD_WORD error:", error);
      return c.json({ error: "Failed to add word" }, 500);
    }
  }

  /**
   * PATCH /api/clips/:id/captions/words/:wordId
   * Update a single word
   */
  static async updateWord(c: Context) {
    const clipId = c.req.param("id");
    const wordId = c.req.param("wordId");
    ClipCaptionController.log(c, "UPDATE_WORD", { clipId, wordId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      const caption = await ClipCaptionModel.getByClipId(clipId);
      if (!caption) return c.json({ error: "Captions not found" }, 404);

      const body = await c.req.json<{ word?: string; start?: number; end?: number }>();
      const words = [...caption.words];
      const idx = words.findIndex((w) => w.id === wordId);
      if (idx < 0) return c.json({ error: "Word not found" }, 404);

      if (body.word !== undefined) words[idx].word = body.word;
      if (body.start !== undefined) words[idx].start = body.start;
      if (body.end !== undefined) words[idx].end = body.end;

      if (words[idx].start < 0 || words[idx].end <= words[idx].start) {
        return c.json({ error: "Invalid timing" }, 400);
      }

      const updated = await ClipCaptionModel.updateWords(clipId, words);

      return c.json({
        clipId,
        words: updated?.words,
        style: updated?.styleConfig,
        templateId: updated?.templateId,
        isEdited: updated?.isEdited,
      });
    } catch (error) {
      console.error("[CLIP_CAPTION_CTRL] UPDATE_WORD error:", error);
      return c.json({ error: "Failed to update word" }, 500);
    }
  }

  /**
   * DELETE /api/clips/:id/captions/words/:wordId
   * Remove a word
   */
  static async removeWord(c: Context) {
    const clipId = c.req.param("id");
    const wordId = c.req.param("wordId");
    ClipCaptionController.log(c, "REMOVE_WORD", { clipId, wordId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      const caption = await ClipCaptionModel.getByClipId(clipId);
      if (!caption) return c.json({ error: "Captions not found" }, 404);

      const words = caption.words.filter((w) => w.id !== wordId);
      if (words.length === caption.words.length) {
        return c.json({ error: "Word not found" }, 404);
      }

      const updated = await ClipCaptionModel.updateWords(clipId, words);

      return c.json({
        clipId,
        words: updated?.words,
        style: updated?.styleConfig,
        templateId: updated?.templateId,
        isEdited: updated?.isEdited,
      });
    } catch (error) {
      console.error("[CLIP_CAPTION_CTRL] REMOVE_WORD error:", error);
      return c.json({ error: "Failed to remove word" }, 500);
    }
  }

  /**
   * POST /api/clips/:id/captions/reset
   * Reset captions to original transcript
   */
  static async resetCaptions(c: Context) {
    const clipId = c.req.param("id");
    ClipCaptionController.log(c, "RESET_CAPTIONS", { clipId });

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);

      const video = await VideoModel.getById(clip.videoId);
      if (!video) return c.json({ error: "Video not found" }, 404);

      const words = extractWordsForClip(
        (video.transcriptWords as TranscriptWord[]) || [],
        clip.startTime,
        clip.endTime
      );

      const body = await c.req.json<{ resetStyle?: boolean }>().catch(() => ({ resetStyle: false }));
      const existing = await ClipCaptionModel.getByClipId(clipId);

      const caption = await ClipCaptionModel.upsert({
        clipId,
        words,
        styleConfig: body.resetStyle ? undefined : (existing?.styleConfig ?? undefined),
        templateId: body.resetStyle ? undefined : (existing?.templateId ?? undefined),
      });

      // Reset isEdited flag
      const { db } = await import("../db");
      const { clipCaption } = await import("../db/schema/clip-caption.schema");
      const { eq } = await import("drizzle-orm");
      await db.update(clipCaption).set({ isEdited: false }).where(eq(clipCaption.clipId, clipId));

      return c.json({
        clipId,
        words: caption?.words,
        style: caption?.styleConfig,
        templateId: caption?.templateId,
        isEdited: false,
        message: "Captions reset to original transcript",
      });
    } catch (error) {
      console.error("[CLIP_CAPTION_CTRL] RESET_CAPTIONS error:", error);
      return c.json({ error: "Failed to reset captions" }, 500);
    }
  }
}
