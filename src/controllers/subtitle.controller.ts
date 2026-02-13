import { Context } from "hono";
import { VideoModel } from "../models/video.model";
import { ClipModel } from "../models/clip.model";
import { ClipCaptionModel } from "../models/clip-caption.model";
import {
  convertToSRT,
  convertToVTT,
  convertToText,
  convertToJSON,
} from "../utils/subtitle-converter";

export class SubtitleController {
  /**
   * Download full video transcript in specified format
   * GET /api/videos/:id/transcript/download?format=srt|vtt|txt|json
   */
  static async downloadVideoTranscript(c: Context) {
    const videoId = c.req.param("id");
    const format = c.req.query("format") || "srt";

    try {
      const video = await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      if (!video.transcriptWords || !Array.isArray(video.transcriptWords)) {
        return c.json({ error: "No transcript available for this video" }, 404);
      }

      // Convert transcript words to requested format
      const words = video.transcriptWords.map((w: any) => ({
        word: w.punctuated_word || w.word,
        start: w.start,
        end: w.end,
      }));

      let content: string;
      let mimeType: string;
      let extension: string;

      switch (format.toLowerCase()) {
        case "srt":
          content = convertToSRT(words);
          mimeType = "application/x-subrip";
          extension = "srt";
          break;
        case "vtt":
          content = convertToVTT(words);
          mimeType = "text/vtt";
          extension = "vtt";
          break;
        case "txt":
          content = convertToText(words);
          mimeType = "text/plain";
          extension = "txt";
          break;
        case "json":
          content = convertToJSON(words);
          mimeType = "application/json";
          extension = "json";
          break;
        default:
          return c.json({ error: "Invalid format. Use: srt, vtt, txt, or json" }, 400);
      }

      // Sanitize filename
      const sanitizedTitle = (video.title || "transcript")
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const filename = `${sanitizedTitle}.${extension}`;

      return c.body(content, 200, {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
    } catch (error) {
      console.error("[SUBTITLE CONTROLLER] Download video transcript error:", error);
      return c.json({ error: "Failed to download transcript" }, 500);
    }
  }

  /**
   * Download clip captions in specified format
   * GET /api/clips/:id/captions/download?format=srt|vtt|txt|json
   */
  static async downloadClipCaptions(c: Context) {
    const clipId = c.req.param("id");
    const format = c.req.query("format") || "srt";

    try {
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Try to get edited captions from clip_caption table
      const clipCaption = await ClipCaptionModel.getByClipId(clipId);
      
      if (!clipCaption || !clipCaption.words || clipCaption.words.length === 0) {
        return c.json({ error: "No captions available for this clip" }, 404);
      }

      const words = clipCaption.words.map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      }));

      let content: string;
      let mimeType: string;
      let extension: string;

      switch (format.toLowerCase()) {
        case "srt":
          content = convertToSRT(words);
          mimeType = "application/x-subrip";
          extension = "srt";
          break;
        case "vtt":
          content = convertToVTT(words);
          mimeType = "text/vtt";
          extension = "vtt";
          break;
        case "txt":
          content = convertToText(words);
          mimeType = "text/plain";
          extension = "txt";
          break;
        case "json":
          content = convertToJSON(words);
          mimeType = "application/json";
          extension = "json";
          break;
        default:
          return c.json({ error: "Invalid format. Use: srt, vtt, txt, or json" }, 400);
      }

      // Sanitize filename
      const sanitizedTitle = (clip.title || "captions")
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const filename = `${sanitizedTitle}.${extension}`;

      return c.body(content, 200, {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
    } catch (error) {
      console.error("[SUBTITLE CONTROLLER] Download clip captions error:", error);
      return c.json({ error: "Failed to download captions" }, 500);
    }
  }
}
