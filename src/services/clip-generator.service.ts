/**
 * Clip Generator Service
 * Handles video segment extraction and aspect ratio conversion using FFmpeg and yt-dlp
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { spawn } from "child_process";
import { R2Service } from "./r2.service";
import { SplitScreenCompositorService } from "./split-screen-compositor.service";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { nanoid } from "nanoid";
import sharp from "sharp";
import { extractEmojiTimings } from "../utils/emoji-timing";

// Path to bundled fonts for ASS subtitle rendering
const FONTS_DIR = path.resolve(__dirname, "../../assets/fonts");

export type AspectRatio = "9:16" | "1:1" | "16:9";
export type VideoQuality = "720p" | "1080p" | "2k" | "4k";

export interface ClipGenerationOptions {
  userId: string;
  videoId: string;
  clipId: string;
  sourceType: "youtube" | "upload";
  sourceUrl?: string;
  storageKey?: string;
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  watermark?: boolean;
  emojis?: string;
  introTitle?: string;
  backgroundStyle?: "blur" | "black" | "white";
  splitScreen?: {
    backgroundStorageKey: string;
    backgroundDuration: number;
    splitRatio: number;
  };
  captions?: {
    words: Array<{ word: string; start: number; end: number }>;
    style?: {
      fontFamily?: string;
      fontSize?: number;
      textColor?: string;
      backgroundColor?: string;
      backgroundOpacity?: number;
      position?: "top" | "center" | "bottom";
      x?: number;  // 0-100 horizontal position percentage
      y?: number;  // 0-100 vertical position percentage
      maxWidth?: number; // 20-100 caption container width percentage
      alignment?: "left" | "center" | "right";
      animation?: "none" | "word-by-word" | "karaoke" | "bounce" | "fade";
      highlightColor?: string;
      highlightEnabled?: boolean;
      shadow?: boolean;
      outline?: boolean;
      outlineColor?: string;
      // Enhanced options for viral caption rendering
      outlineWidth?: number;        // 1-8, default 3
      highlightScale?: number;      // 100-150, default 125
      textTransform?: "none" | "uppercase";
      wordsPerLine?: number;        // 3-7, default 5
      glowEnabled?: boolean;
      glowColor?: string;
      glowIntensity?: number;       // 1-20, default 8
    };
  };
}

export interface GeneratedClip {
  storageKey: string;
  storageUrl: string;
  // Raw clip without captions (for editing)
  rawStorageKey?: string;
  rawStorageUrl?: string;
  duration: number;
  width: number;
  height: number;
  fileSize: number;
}

/**
 * Get output dimensions for a given aspect ratio and quality
 * Validates: Requirements 8.1, 8.2, 8.3, 8.5
 */
function getOutputDimensions(
  aspectRatio: AspectRatio,
  quality: VideoQuality
): { width: number; height: number } {
  const qualityMap: Record<VideoQuality, number> = {
    "720p": 720,
    "1080p": 1080,
    "2k": 1440,   // actual encode — shown as "4K" in UI
    "4k": 2160,
  };

  const baseSize = qualityMap[quality];

  switch (aspectRatio) {
    case "9:16": // Vertical (TikTok, Reels, Shorts) — baseSize is the WIDTH (e.g. 1080→1080×1920)
      return { width: baseSize, height: Math.round(baseSize * (16 / 9)) };
    case "1:1": // Square (Instagram feed)
      return { width: baseSize, height: baseSize };
    case "16:9": // Horizontal (YouTube) — baseSize is the HEIGHT (e.g. 1080→1920×1080)
      return { width: Math.round(baseSize * (16 / 9)), height: baseSize };
    default:
      return { width: 1920, height: 1080 };
  }
}

/**
 * Get FFmpeg encoding params based on quality.
 * Pro plan (2k/4k) → medium preset + CRF 18 for high quality with reasonable CPU.
 * Free/Starter (720p/1080p) → ultrafast + CRF 22 to minimize CPU usage.
 *
 * NOTE: Social media platforms (TikTok, YouTube, Instagram) re-encode all uploads
 * to ~5-8 Mbps, so CRF differences below ~23 are invisible to end viewers.
 * Using medium instead of slow is 3-4x faster with virtually identical visual quality.
 */
function getEncodingParams(quality: VideoQuality): { preset: string; crf: string } {
  if (quality === "2k" || quality === "4k") {
    return { preset: "medium", crf: "18" };
  }
  return { preset: "ultrafast", crf: "22" };
}

/**
 * Format seconds to HH:MM:SS.mmm format for FFmpeg
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

/**
 * Format seconds to yt-dlp download-sections format (*start-end)
 */
function formatYtDlpTimestamp(start: number, end: number): string {
  return `*${formatTimestamp(start)}-${formatTimestamp(end)}`;
}

export class ClipGeneratorService {
  private static logOperation(operation: string, details?: any) {
    console.log(
      `[CLIP GENERATOR] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * Get the absolute path to the watermark logo PNG.
   * Converts from SVG on first call and caches the result.
   */
  private static watermarkPngPath: string | null = null;
  private static async getWatermarkLogoPath(): Promise<string> {
    if (this.watermarkPngPath && fs.existsSync(this.watermarkPngPath)) {
      return this.watermarkPngPath;
    }
    const svgPath = path.resolve(__dirname, "../assets/watermark-logo.svg");
    const pngPath = path.resolve(os.tmpdir(), "scalereach-watermark-logo.png");
    const svgBuffer = await fs.promises.readFile(svgPath);
    await sharp(svgBuffer, { density: 300 }).resize(512, 512).png().toFile(pngPath);
    this.watermarkPngPath = pngPath;
    this.logOperation("WATERMARK_LOGO_CONVERTED", { pngPath });
    return pngPath;
  }

  /**
   * Build watermark filter config for FFmpeg.
   * Layout (top-right, logo centered): "Made With" → [logo] → "ScaleReach"
   */
  private static getWatermarkFilterConfig(
    videoWidth: number,
    videoHeight: number,
    logoPath: string
  ): {
    extraInputArgs: string[];
    filterFragment: string;
  } {
    const logoHeight = Math.max(Math.round(videoHeight * 0.064), 38);
    const padding = Math.round(videoHeight * 0.03);
    const madeWithSize = Math.max(Math.round(logoHeight * 0.4), 10);
    const scaleReachSize = Math.max(Math.round(logoHeight * 0.44), 11);
    const gap = Math.round(madeWithSize * 0.4);

    // Positions from top
    const madeWithY = padding;
    const logoY = madeWithY + madeWithSize + gap;
    const scaleReachY = logoY + logoHeight + gap;

    // Center all three elements (Made With, logo, ScaleReach) around a common
    // center X in the top-right area. Use the wider "ScaleReach" text width as
    // reference and place the block so its right edge sits at W-padding.
    const estTextWidth = Math.round(scaleReachSize * 10 * 0.55);
    const blockCenterX = `W-${padding}-${Math.round(estTextWidth / 2)}`;

    return {
      extraInputArgs: ["-i", logoPath],
      filterFragment:
        `[1:v]scale=-1:${logoHeight},format=rgba,` +
        `colorchannelmixer=aa=0.6[wm];` +
        `[pre_wm]drawtext=text='Made With':` +
        `fontsize=${madeWithSize}:fontcolor=white@0.6:` +
        `borderw=1:bordercolor=black@0.3:` +
        `x=${blockCenterX}-tw/2:y=${madeWithY}[txt1];` +
        `[txt1][wm]overlay=${blockCenterX}-w/2:${logoY}[logo_out];` +
        `[logo_out]drawtext=text='ScaleReach':` +
        `fontsize=${scaleReachSize}:fontcolor=white@0.6:` +
        `borderw=1:bordercolor=black@0.3:` +
        `x=${blockCenterX}-tw/2:y=${scaleReachY}`,
    };
  }

  /**
   * Generate a clip from a video source
   * Creates TWO versions:
   * 1. storageUrl - clip WITH captions (for download/share)
   * 2. rawStorageUrl - clip WITHOUT captions (for editing)
   *
   * OPTIMIZED PIPELINE (v2):
   * - Downloads/extracts source segment ONCE, reuses for both versions
   * - Split-screen + captions merged into single FFmpeg pass where possible
   * - Reduces FFmpeg encode passes from up to 7 → 2-3 per clip
   *
   * Validates: Requirements 7.1, 7.3
   */
  static async generateClip(options: ClipGenerationOptions, onProgress?: (percent: number) => void): Promise<GeneratedClip> {
    this.logOperation("GENERATE_CLIP_V2", {
      clipId: options.clipId,
      sourceType: options.sourceType,
      aspectRatio: options.aspectRatio,
      quality: options.quality,
      startTime: options.startTime,
      endTime: options.endTime,
      hasCaptions: !!options.captions?.words?.length,
      hasIntroTitle: !!options.introTitle,
      hasSplitScreen: !!options.splitScreen,
    });

    const { width, height } = getOutputDimensions(options.aspectRatio, options.quality);
    const duration = options.endTime - options.startTime;

    const storageKey = R2Service.generateClipStorageKey(options.userId, options.videoId, options.clipId, options.aspectRatio, false);
    const rawStorageKey = R2Service.generateClipStorageKey(options.userId, options.videoId, options.clipId, options.aspectRatio, true);

    const tempDir = os.tmpdir();
    const tempId = nanoid();
    // Shared temp paths for the single-download approach
    const rawSourcePath = path.join(tempDir, `src-${tempId}.mp4`);
    const captionedOutputPath = path.join(tempDir, `cap-${tempId}.mp4`);
    const rawOutputPath = path.join(tempDir, `raw-${tempId}.mp4`);
    const tempPaths: string[] = [rawSourcePath, captionedOutputPath, rawOutputPath];

    let clipWithCaptionsBuffer: Buffer;
    let clipWithoutCaptionsBuffer: Buffer;

    try {
      // ── STEP 1: Download/extract source segment ONCE ──
      onProgress?.(10);
      if (options.sourceType === "youtube" && options.sourceUrl) {
        await this.downloadYouTubeSegmentToFile(
          options.sourceUrl, options.startTime, options.endTime, rawSourcePath, options.quality
        );
      } else if (options.sourceType === "upload" && options.storageKey) {
        await this.downloadUploadedSegmentToFile(
          options.storageKey, options.startTime, options.endTime, rawSourcePath
        );
      } else {
        throw new Error("Invalid source configuration: missing sourceUrl or storageKey");
      }
      this.logOperation("SOURCE_DOWNLOADED_ONCE", { path: rawSourcePath });

      // ── STEP 2: Determine split-screen setup ──
      let bgTempPath: string | undefined;
      const hasSplitScreen = !!options.splitScreen;
      const hasCaptions = !!(options.captions?.words?.length || options.introTitle || options.emojis);

      if (hasSplitScreen) {
        bgTempPath = await SplitScreenCompositorService.downloadBackground(
          options.splitScreen!.backgroundStorageKey
        );
        tempPaths.push(bgTempPath);
      }

      // ── STEP 3: Generate RAW clip (no captions, no emojis, no intro) ──
      // This is always a single FFmpeg pass: aspect ratio conversion (+ split-screen if enabled)
      onProgress?.(30);
      if (hasSplitScreen && bgTempPath) {
        // Single-pass: aspect ratio + split-screen composition
        await this.convertWithSplitScreen(
          rawSourcePath, rawOutputPath, bgTempPath,
          width, height, duration,
          options.splitScreen!.splitRatio,
          options.splitScreen!.backgroundDuration,
          undefined, // no subtitles
          options.watermark, options.quality
        );
      } else {
        // Single-pass: aspect ratio conversion only
        await this.convertAspectRatioFile(
          rawSourcePath, rawOutputPath, width, height,
          undefined, // no subtitles
          options.watermark, options.quality,
          options.backgroundStyle
        );
      }
      clipWithoutCaptionsBuffer = await fs.promises.readFile(rawOutputPath);

      if (clipWithoutCaptionsBuffer.length < 10000) {
        throw new Error(`FFmpeg produced an empty or corrupt clip (${clipWithoutCaptionsBuffer.length} bytes). The segment may be outside the video's duration.`);
      }

      // ── STEP 4: Generate CAPTIONED clip ──
      onProgress?.(55);
      if (!hasCaptions) {
        // No captions needed — reuse the raw buffer (zero extra encoding)
        clipWithCaptionsBuffer = clipWithoutCaptionsBuffer;
      } else {
        // Prepare ASS subtitles
        let captionsForASS = options.captions;
        // For split-screen, position captions at the split line
        if (hasSplitScreen && captionsForASS?.words?.length) {
          const splitRatio = options.splitScreen!.splitRatio;
          const captionY = splitRatio - 5;
          captionsForASS = {
            ...captionsForASS,
            style: {
              ...captionsForASS.style,
              position: "center" as const,
              y: captionY,
              x: captionsForASS.style?.x ?? 50,
            },
          };
        }

        const assContent = this.generateASSSubtitles(
          captionsForASS?.words || [],
          captionsForASS?.style,
          width, height,
          options.introTitle,
          options.emojis
        );
        const tempSubsPath = path.join(tempDir, `subs-${tempId}.ass`);
        tempPaths.push(tempSubsPath);
        await fs.promises.writeFile(tempSubsPath, assContent);

        if (hasSplitScreen && bgTempPath) {
          // Single-pass: aspect ratio + split-screen + captions all in one FFmpeg command
          await this.convertWithSplitScreen(
            rawSourcePath, captionedOutputPath, bgTempPath,
            width, height, duration,
            options.splitScreen!.splitRatio,
            options.splitScreen!.backgroundDuration,
            tempSubsPath,
            options.watermark, options.quality
          );
        } else {
          // Single-pass: aspect ratio + captions
          await this.convertAspectRatioFile(
            rawSourcePath, captionedOutputPath, width, height,
            tempSubsPath,
            options.watermark, options.quality,
            options.backgroundStyle
          );
        }

        clipWithCaptionsBuffer = await fs.promises.readFile(captionedOutputPath);

        if (clipWithCaptionsBuffer.length < 10000) {
          throw new Error(`FFmpeg produced an empty or corrupt captioned clip (${clipWithCaptionsBuffer.length} bytes).`);
        }
      }

      this.logOperation("CLIP_GENERATION_COMPLETE", {
        clipId: options.clipId,
        captionedSize: clipWithCaptionsBuffer.length,
        rawSize: clipWithoutCaptionsBuffer.length,
      });

      // ── STEP 5: Upload both versions to R2 ──
      onProgress?.(70);
      this.logOperation("UPLOADING_CLIP_WITH_CAPTIONS", { storageKey, size: clipWithCaptionsBuffer.length });
      const { url: storageUrl } = await R2Service.uploadFile(storageKey, clipWithCaptionsBuffer, "video/mp4");

      onProgress?.(85);
      this.logOperation("UPLOADING_RAW_CLIP", { rawStorageKey, size: clipWithoutCaptionsBuffer.length });
      const { url: rawStorageUrl } = await R2Service.uploadFile(rawStorageKey, clipWithoutCaptionsBuffer, "video/mp4");

      return {
        storageKey,
        storageUrl,
        rawStorageKey,
        rawStorageUrl,
        duration,
        width,
        height,
        fileSize: clipWithCaptionsBuffer.length,
      };
    } catch (error) {
      // If split-screen failed, try fallback without split-screen
      if (options.splitScreen && error instanceof Error && error.message.includes("Split-screen")) {
        console.warn(`[CLIP GENERATOR] Split-screen failed, falling back to single-video pipeline:`, error.message);
        const fallbackOptions = { ...options, splitScreen: undefined };
        return this.generateClip(fallbackOptions, onProgress);
      }
      throw error;
    } finally {
      await SplitScreenCompositorService.cleanup(tempPaths);
    }
  }

  /**
   * Burn ASS subtitles onto an existing video buffer using FFmpeg.
   * Used to apply captions after split-screen composition.
   */
  private static async burnSubtitlesOnBuffer(
    videoBuffer: Buffer,
    captions: NonNullable<ClipGenerationOptions["captions"]>,
    width: number,
    height: number,
    introTitle?: string,
    emojis?: string,
    quality: VideoQuality = "1080p"
  ): Promise<Buffer> {
    const tempId = nanoid();
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `burn-in-${tempId}.mp4`);
    const outputPath = path.join(tempDir, `burn-out-${tempId}.mp4`);
    const subsPath = path.join(tempDir, `burn-subs-${tempId}.ass`);

    const cleanup = async () => {
      for (const p of [inputPath, outputPath, subsPath]) {
        try { if (fs.existsSync(p)) await fs.promises.unlink(p); } catch {}
      }
    };

    // Write input video and ASS file
    const assContent = this.generateASSSubtitles(
      captions.words || [],
      captions.style,
      width,
      height,
      introTitle,
      emojis
    );
    await Promise.all([
      fs.promises.writeFile(inputPath, videoBuffer),
      fs.promises.writeFile(subsPath, assContent),
    ]);

    this.logOperation("BURN_SUBTITLES_START", {
      inputSize: videoBuffer.length,
      wordCount: captions.words?.length || 0,
      assLength: assContent.length,
    });

    const escapedSubsPath = subsPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedFontsDir = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");

    const { preset, crf } = getEncodingParams(quality);
    const args = [
      "-i", inputPath,
      "-vf", `ass=${escapedSubsPath}:fontsdir=${escapedFontsDir}`,
      "-c:v", "libx264",
      "-preset", preset,
      "-crf", crf,
      "-c:a", "copy",
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", args);
      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", async (code) => {
        try {
          if (code === 0) {
            const result = await fs.promises.readFile(outputPath);
            this.logOperation("BURN_SUBTITLES_COMPLETE", { outputSize: result.length });
            await cleanup();
            resolve(result);
          } else {
            await cleanup();
            reject(new Error(`burnSubtitlesOnBuffer failed (code ${code}): ${stderr.slice(-500)}`));
          }
        } catch (err) {
          await cleanup();
          reject(err);
        }
      });
      proc.on("error", async (err) => {
        await cleanup();
        reject(err);
      });
    });
  }

  /**
   * Generate ASS subtitle content from caption words
   * Supports word-by-word karaoke effect with scaling animation
   * Optionally includes intro title overlay for first 3 seconds
   */
  private static generateASSSubtitles(
    words: Array<{ word: string; start: number; end: number }>,
    style: NonNullable<ClipGenerationOptions["captions"]>["style"] | undefined,
    width: number,
    height: number,
    introTitle?: string,
    emojis?: string
  ): string {
    // Default style values
    const fontFamily = style?.fontFamily || "Arial";
    
    // Scale font size from frontend design space to actual output resolution.
    // Use 700 as the reference height so that font sizes chosen in the editor
    // look correct at typical output resolutions (720p, 1080p, etc.).
    const DESIGN_HEIGHT = 700;
    const scaleFactor = height / DESIGN_HEIGHT;
    const fontSize = Math.round((style?.fontSize || 32) * scaleFactor);

    this.logOperation("ASS_FONT_SCALING", {
      inputFontSize: style?.fontSize || 32,
      scaledFontSize: fontSize,
      scaleFactor: scaleFactor.toFixed(3),
      outputResolution: `${width}x${height}`,
    });
    
    const textColor = this.hexToASSColor(style?.textColor || "#FFFFFF");
    const outlineColor = this.hexToASSColor(style?.outlineColor || "#000000");
    const highlightColor = this.hexToASSColor(style?.highlightColor || "#FFFF00");
    const glowColor = this.hexToASSColor(style?.glowColor || style?.textColor || "#FFFFFF");
    const glowIntensity = style?.glowIntensity ?? 8;
    const glowEnabled = style?.glowEnabled ?? false;

    // Match frontend rendering:
    // - shadow=true → 8-direction 2px black stroke (acts as outline, not drop shadow)
    // - outline=true → WebkitTextStroke at ~3px
    // In ASS, \bord is the outline thickness, \shad is drop shadow.
    // Frontend has no drop shadow, so \shad=0 always.
    // Use outlineWidth from style if set, otherwise: outline=true uses 3px, shadow=true uses 2px
    // NOTE: Don't scale outline by full scaleFactor — ASS \bord renders thicker than CSS stroke.
    // Use a dampened scale to keep it visually close to the frontend preview.
    let rawOutline = 0;
    if (style?.outline) rawOutline = style?.outlineWidth ?? 3;
    else if (style?.shadow) rawOutline = 2;
    const outline = Math.round(rawOutline * Math.sqrt(scaleFactor));
    const shadow = 0; // Frontend has no drop shadow

    // Enhanced style options — match frontend exactly
    // Frontend defaults to 110%: (style.highlightScale ?? 110) / 100
    const highlightScale = style?.highlightScale ?? 110;
    const maxWordsPerLine = style?.wordsPerLine ?? 5;

    // Helper — apply textTransform from style (matching frontend)
    const transformWord = (word: string) => 
      style?.textTransform === "uppercase" ? word.toUpperCase() : word;

    // Determine positioning from x/y percentages or fallback to position preset
    // Frontend: x (0-100) = horizontal center, y (0-100) = vertical center
    // maxWidth (20-100) = caption container width as percentage
    const hasXY = typeof style?.x === "number" && typeof style?.y === "number";
    const xPct = style?.x ?? 50;
    const yPct = style?.y ?? 85; // Default near bottom
    const captionMaxWidth = style?.maxWidth ?? 90; // Default 90% width

    let alignment: number;
    let marginV: number;
    let marginL: number;
    let marginR: number;

    if (hasXY) {
      // Calculate horizontal margins from x position and maxWidth
      // Caption container spans from (x - maxWidth/2) to (x + maxWidth/2)
      const leftEdgePct = Math.max(0, xPct - captionMaxWidth / 2);
      const rightEdgePct = Math.max(0, 100 - xPct - captionMaxWidth / 2);
      marginL = Math.round((leftEdgePct / 100) * width);
      marginR = Math.round((rightEdgePct / 100) * width);

      // Text alignment within the container
      const textAlign = style?.alignment || "center";
      const hAlign = textAlign === "left" ? 1 : textAlign === "right" ? 3 : 2;

      // Vertical positioning: ASS alignment numpad
      // 7 8 9 = top row, 4 5 6 = middle row, 1 2 3 = bottom row
      if (yPct <= 33) {
        // Top zone — alignment 7/8/9, marginV = distance from top
        alignment = 6 + hAlign;
        marginV = Math.round((yPct / 100) * height);
      } else if (yPct >= 66) {
        // Bottom zone — alignment 1/2/3, marginV = distance from bottom
        alignment = hAlign;
        marginV = Math.round(((100 - yPct) / 100) * height);
      } else {
        // Center zone — alignment 4/5/6, marginV = offset from center
        alignment = 3 + hAlign;
        // ASS center alignment: marginV shifts text away from exact center
        const offsetFromCenter = yPct - 50; // positive = below center
        marginV = Math.round(Math.abs(offsetFromCenter) / 100 * height);
        // If below center, we need to push down — ASS MarginV for center alignment
        // pushes toward bottom when positive, which matches our need
        if (offsetFromCenter < 0) {
          // Above center — flip to top alignment
          alignment = 6 + hAlign;
          marginV = Math.round((yPct / 100) * height);
        }
      }
    } else {
      // Fallback to legacy position preset — scale margins proportionally with height
      const textAlign = style?.alignment || "center";
      const hAlign = textAlign === "left" ? 1 : textAlign === "right" ? 3 : 2;
      alignment = style?.position === "top" ? (6 + hAlign) : style?.position === "center" ? (3 + hAlign) : hAlign;
      marginV = style?.position === "center" ? 0 : style?.position === "top" ? Math.round(height * 0.055) : Math.round(height * 0.11);
      // Apply maxWidth even in legacy mode
      const halfGap = Math.max(0, (100 - captionMaxWidth) / 2);
      marginL = Math.round((halfGap / 100) * width);
      marginR = marginL;
    }

    // Intro title style - slightly larger than captions, positioned at 25% from top
    const introFontSize = Math.round(fontSize * 1.2);
    // To position at 25% from top: use center alignment (5) with MarginV to push up
    // MarginV pushes text away from center, so we need (height/2 - height*0.25) = height*0.25
    const introMarginV = Math.round(height * 0.25);

    // Emoji overlay style - large, centered above captions
    const emojiFontSize = Math.round(fontSize * 3);
    const emojiMarginV = style?.position === "top" ? Math.round(height * 0.55) : Math.round(height * 0.35);

    // ASS header with styles for normal, highlighted, intro title, and emoji overlay text
    // NOTE: ASS format uses commas as field delimiters, so font name must be a single name.
    // libass/fontconfig handles font fallback automatically for emoji characters.
    
    // Calculate BackColour from backgroundOpacity (ASS alpha: 00=opaque, FF=transparent)
    const bgOpacity = style?.backgroundOpacity ?? 0;
    const bgColor = style?.backgroundColor?.replace("#", "") || "000000";
    // Convert 0-100 opacity to ASS alpha (inverted: 0% opacity = FF, 100% opacity = 00)
    const assAlpha = Math.round(((100 - bgOpacity) / 100) * 255).toString(16).toUpperCase().padStart(2, "0");
    // ASS BackColour format: &HAABBGGRR
    const bgR = bgColor.substring(0, 2);
    const bgG = bgColor.substring(2, 4);
    const bgB = bgColor.substring(4, 6);
    const backColour = `&H${assAlpha}${bgB}${bgG}${bgR}`;
    // BorderStyle: 1 = outline+shadow (no box), 3 = opaque box behind text
    const borderStyle = bgOpacity > 0 ? 3 : 1;
    
    let ass = `[Script Info]
Title: Generated Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${textColor},${textColor},${outlineColor},${backColour},1,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${marginL},${marginR},${marginV},1
Style: Highlight,${fontFamily},${fontSize},${highlightColor},${highlightColor},${outlineColor},${backColour},1,0,0,0,${highlightScale},${highlightScale},0,0,${borderStyle},${outline},${shadow},${alignment},${marginL},${marginR},${marginV},1
Style: IntroTitle,${fontFamily},${introFontSize},${textColor},${textColor},${outlineColor},${backColour},1,0,0,0,100,100,0,0,1,${Math.round(4 * scaleFactor)},${Math.round(3 * scaleFactor)},8,${Math.round(20 * scaleFactor)},${Math.round(20 * scaleFactor)},${introMarginV},1
Style: EmojiOverlay,Noto Color Emoji,${emojiFontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,0,0,0,5,20,20,${emojiMarginV},1
Style: Glow,${fontFamily},${fontSize},${glowColor},${glowColor},${glowColor},&H00000000,1,0,0,0,100,100,0,0,1,${Math.round(glowIntensity * scaleFactor)},0,${alignment},${marginL},${marginR},${marginV},1
`;

    ass += `
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // // Add intro title for first 3 seconds if provided
    // if (introTitle) {
    //   // Fade in effect: {\fad(300,300)} - 300ms fade in, 300ms fade out
    //   ass += `Dialogue: 1,0:00:00.00,0:00:03.00,IntroTitle,,0,0,0,,{\\fad(300,300)}${transformWord(introTitle)}\n`;
    // }

    // Group words into lines based on wordsPerLine setting
    const lines: Array<{ words: typeof words; start: number; end: number }> = [];
    let currentLine: typeof words = [];

    for (const word of words) {
      currentLine.push(word);
      if (currentLine.length >= maxWordsPerLine || word.word.endsWith('.') || word.word.endsWith('?') || word.word.endsWith('!')) {
        lines.push({
          words: currentLine,
          start: currentLine[0].start,
          end: currentLine[currentLine.length - 1].end,
        });
        currentLine = [];
      }
    }
    if (currentLine.length > 0) {
      lines.push({
        words: currentLine,
        start: currentLine[0].start,
        end: currentLine[currentLine.length - 1].end,
      });
    }

    // Generate dialogue lines based on animation type
    const animation = style?.animation || "none";

    // Build ASS override tags for highlighted words
    const highlightOpen = `{\\fscx${highlightScale}\\fscy${highlightScale}\\c${highlightColor}}`;
    const highlightClose = `{\\fscx100\\fscy100\\c${textColor}}`;

    // Helper: emit a glow layer (Layer -1) for a given line of text
    const addGlowLine = (startTime: string, endTime: string, text: string) => {
      if (!glowEnabled) return;
      // Strip existing override tags from text for the glow layer, keep plain text
      const plainText = text.replace(/\{[^}]*\}/g, "");
      const blurAmount = Math.round(glowIntensity * scaleFactor * 0.8);
      ass += `Dialogue: -1,${startTime},${endTime},Glow,,0,0,0,,{\\blur${blurAmount}}${plainText}\n`;
    };

    if (style?.highlightEnabled && animation === "karaoke") {
      // Karaoke style: word-by-word highlighting
      // Each word gets its own dialogue line that shows highlighted during its time
      for (const line of lines) {
        for (let i = 0; i < line.words.length; i++) {
          const word = line.words[i];
          const wordStart = this.formatASSTime(word.start);
          const wordEnd = this.formatASSTime(word.end);

          // Build the line text with current word highlighted (scaled + colored)
          let text = "";
          for (let j = 0; j < line.words.length; j++) {
            const w = line.words[j];
            const transformedWord = transformWord(w.word);
            if (j === i) {
              text += `${highlightOpen}${transformedWord}${highlightClose} `;
            } else {
              text += `${transformedWord} `;
            }
          }

          ass += `Dialogue: 0,${wordStart},${wordEnd},Default,,0,0,0,,${text.trim()}\n`;
          addGlowLine(wordStart, wordEnd, text.trim());
        }
      }
    } else if (style?.highlightEnabled && animation === "word-by-word") {
      // Word-by-word: fade in each word sequentially with highlight on current
      for (const line of lines) {
        for (let i = 0; i < line.words.length; i++) {
          const word = line.words[i];
          const wordStart = this.formatASSTime(word.start);
          const wordEnd = this.formatASSTime(word.end);

          // Show all words up to current, with current word highlighted
          let text = "";
          for (let j = 0; j <= i; j++) {
            const w = line.words[j];
            const transformedWord = transformWord(w.word);
            if (j === i) {
              text += `${highlightOpen}${transformedWord}${highlightClose} `;
            } else {
              text += `${transformedWord} `;
            }
          }

          ass += `Dialogue: 0,${wordStart},${wordEnd},Default,,0,0,0,,${text.trim()}\n`;
          addGlowLine(wordStart, wordEnd, text.trim());
        }
      }
    } else if (animation === "bounce") {
      // Bounce: scale animation on each word as it appears
      for (const line of lines) {
        for (let i = 0; i < line.words.length; i++) {
          const word = line.words[i];
          const wordStart = this.formatASSTime(word.start);
          const wordEnd = this.formatASSTime(word.end);

          // Build line with bounce effect on current word using \t transform
          let text = "";
          for (let j = 0; j <= i; j++) {
            const w = line.words[j];
            const transformedWord = transformWord(w.word);
            if (j === i) {
              // Bounce: scale up then back down using transform
              const bounceColor = style?.highlightEnabled ? highlightColor : textColor;
              const bounceScale = Math.round(highlightScale * 0.92); // Slightly less than highlight scale
              text += `{\\fscx100\\fscy100\\t(0,80,\\fscx${bounceScale}\\fscy${bounceScale})\\t(80,160,\\fscx100\\fscy100)\\c${bounceColor}}${transformedWord}{\\c${textColor}} `;
            } else {
              text += `${transformedWord} `;
            }
          }

          ass += `Dialogue: 0,${wordStart},${wordEnd},Default,,0,0,0,,${text.trim()}\n`;
          addGlowLine(wordStart, wordEnd, text.trim());
        }
      }
    } else if (animation === "fade") {
      // Fade: each line fades in
      for (const line of lines) {
        const startTime = this.formatASSTime(line.start);
        const endTime = this.formatASSTime(line.end);
        const text = line.words.map(w => transformWord(w.word)).join(" ");
        // Fade in over 200ms, no fade out
        ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,{\\fad(200,0)}${text}\n`;
        addGlowLine(startTime, endTime, text);
      }
    } else if (style?.highlightEnabled) {
      // Default highlight without specific animation (legacy karaoke behavior)
      for (const line of lines) {
        for (let i = 0; i < line.words.length; i++) {
          const word = line.words[i];
          const wordStart = this.formatASSTime(word.start);
          const wordEnd = this.formatASSTime(word.end);

          let text = "";
          for (let j = 0; j < line.words.length; j++) {
            const w = line.words[j];
            const transformedWord = transformWord(w.word);
            if (j === i) {
              text += `${highlightOpen}${transformedWord}${highlightClose} `;
            } else {
              text += `${transformedWord} `;
            }
          }

          ass += `Dialogue: 0,${wordStart},${wordEnd},Default,,0,0,0,,${text.trim()}\n`;
          addGlowLine(wordStart, wordEnd, text.trim());
        }
      }
    } else {
      // Simple text display without word highlighting
      for (const line of lines) {
        const startTime = this.formatASSTime(line.start);
        const endTime = this.formatASSTime(line.end);
        const text = line.words.map(w => transformWord(w.word)).join(" ");
        ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
        addGlowLine(startTime, endTime, text);
      }
    }

    // // Add emoji overlays if transcriptWithEmojis is provided
    // if (emojis && words.length > 0) {
    //   const emojiOverlays = extractEmojiTimings(emojis, words);
    //   for (const overlay of emojiOverlays) {
    //     const emojiStart = this.formatASSTime(overlay.timestamp);
    //     const emojiEnd = this.formatASSTime(overlay.timestamp + overlay.duration);
    //     // Pop-in animation: scale from 200% to 100% over 200ms, then fade out over last 300ms
    //     ass += `Dialogue: 2,${emojiStart},${emojiEnd},EmojiOverlay,,0,0,0,,{\\fscx200\\fscy200\\t(0,200,\\fscx100\\fscy100)\\fad(0,300)}${overlay.emoji}\n`;
    //   }
    // }

    this.logOperation("ASS_CONTENT_SUMMARY", {
      wordCount: words.length,
      lineCount: lines.length,
      animation: style?.animation || "none",
      hasIntroTitle: !!introTitle,
      hasEmojis: !!emojis,
      totalLength: ass.length,
    });

    return ass;
  }

  /**
   * Convert hex color to ASS color format (&HAABBGGRR)
   */
  private static hexToASSColor(hex: string): string {
    const clean = hex.replace("#", "");
    const r = clean.substring(0, 2);
    const g = clean.substring(2, 4);
    const b = clean.substring(4, 6);
    return `&H00${b}${g}${r}`.toUpperCase();
  }

  /**
   * Format seconds to ASS time format (H:MM:SS.cc)
   */
  private static formatASSTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds % 1) * 100);
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
  }

  /**
   * Download a video segment from YouTube using yt-dlp with --download-sections
   * Validates: Requirements 7.1, 7.2
   */
  static async downloadYouTubeSegment(
    url: string,
    startTime: number,
    endTime: number,
    aspectRatio: AspectRatio,
    quality: VideoQuality,
    captions?: ClipGenerationOptions["captions"],
    introTitle?: string,
    watermark?: boolean,
    emojis?: string
  ): Promise<Buffer> {
    this.logOperation("DOWNLOAD_YOUTUBE_SEGMENT", {
      url,
      startTime,
      endTime,
      aspectRatio,
      quality,
      hasCaptions: !!captions?.words?.length,
      hasIntroTitle: !!introTitle,
    });

    const { width, height } = getOutputDimensions(aspectRatio, quality);
    const tempDir = os.tmpdir();
    const tempId = nanoid();
    const tempVideoPath = path.join(tempDir, `yt-segment-${tempId}.mp4`);
    const tempOutputPath = path.join(tempDir, `clip-output-${tempId}.mp4`);
    const tempSubsPath = path.join(tempDir, `captions-${tempId}.ass`);

    try {
      // Step 1: Download the segment using yt-dlp with --download-sections
      await this.downloadYouTubeSegmentToFile(url, startTime, endTime, tempVideoPath, quality);

      // Step 2: Generate ASS subtitles if captions, intro title, or emojis provided
      if (captions?.words?.length || introTitle || emojis) {
        const assContent = this.generateASSSubtitles(
          captions?.words || [],
          captions?.style,
          width,
          height,
          introTitle,
          emojis
        );
        await fs.promises.writeFile(tempSubsPath, assContent);
        this.logOperation("GENERATED_ASS_SUBTITLES", {
          path: tempSubsPath,
          wordCount: captions?.words?.length || 0,
          hasIntroTitle: !!introTitle,
          hasEmojis: !!emojis
        });
      }

      // Step 3: Apply aspect ratio conversion and burn captions/intro title using FFmpeg
      await this.convertAspectRatioFile(
        tempVideoPath,
        tempOutputPath,
        width,
        height,
        (captions?.words?.length || introTitle || emojis) ? tempSubsPath : undefined,
        watermark,
        quality
      );

      // Step 4: Read the output file
      const clipBuffer = await fs.promises.readFile(tempOutputPath);

      // Validate output — an MP4 with only headers (~1-2KB) means no frames were encoded
      if (clipBuffer.length < 10000) {
        throw new Error(`FFmpeg produced an empty or corrupt clip (${clipBuffer.length} bytes). The segment may be outside the video's duration.`);
      }

      this.logOperation("YOUTUBE_SEGMENT_COMPLETE", {
        size: clipBuffer.length,
        duration: endTime - startTime,
      });

      return clipBuffer;
    } finally {
      // Cleanup temp files
      await this.cleanupTempFile(tempVideoPath);
      await this.cleanupTempFile(tempOutputPath);
      await this.cleanupTempFile(tempSubsPath);
    }
  }

  /**
   * Download YouTube segment to a file using yt-dlp --download-sections
   * Includes retry logic to handle FFmpeg exit code 202 errors that can occur
   * due to resource contention when multiple downloads run concurrently.
   * Validates: Requirements 7.1, 7.2
   */
  private static async downloadYouTubeSegmentToFile(
    url: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    quality: VideoQuality,
    maxRetries: number = 3
  ): Promise<void> {
    let lastError: Error | null = null;
    let forceKeyframes = true;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.executeYtDlpDownload(url, startTime, endTime, outputPath, forceKeyframes);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isCode222 = lastError.message.includes("ffmpeg exited with code 222");
        const isRetryableError = isCode222 ||
                                  lastError.message.includes("ffmpeg exited with code 202") ||
                                  lastError.message.includes("ffmpeg exited with code 1") ||
                                  lastError.message.includes("Interrupted by user") ||
                                  lastError.message.includes("yt-dlp failed with code 1");

        if (isRetryableError && attempt < maxRetries) {
          // code 222 is caused by --force-keyframes-at-cuts on certain streams — disable it on retry
          if (isCode222) forceKeyframes = false;

          // "Interrupted by user" means the process was killed mid-download (e.g. worker restart)
          // Use a longer delay to let the system settle before retrying
          const isInterrupted = lastError.message.includes("Interrupted by user");
          const delayMs = isInterrupted ? 5000 : Math.pow(2, attempt) * 1000;
          this.logOperation("YT_DLP_RETRY", {
            attempt,
            maxRetries,
            delayMs,
            forceKeyframes,
            error: lastError.message,
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
          await this.cleanupTempFile(outputPath);
        } else if (!isRetryableError) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error("yt-dlp download failed after all retries");
  }

  /**
   * Execute the actual yt-dlp download command
   */
  private static async executeYtDlpDownload(
    url: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    forceKeyframes = true
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const formatSelector = "bestvideo+bestaudio/best";
      const downloadSection = formatYtDlpTimestamp(startTime, endTime);
      const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;

      const args = [
        "-f", formatSelector,
        "--download-sections", downloadSection,
        ...(forceKeyframes ? ["--force-keyframes-at-cuts"] : []),
        "--merge-output-format", "mp4",
        "-o", outputPath,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        "--no-post-overwrites",
        "--js-runtimes", "deno",
        "--extractor-args", "youtube:player_client=android_vr,web,android",
        url,
      ];

      if (cookiesPath) {
        args.unshift("--cookies", cookiesPath);
      }

      this.logOperation("YT_DLP_DOWNLOAD", { args: args.join(" ") });

      // Print clickable terminal link to the exact YouTube timestamp being downloaded
      const startHMS = formatTimestamp(startTime);
      const youtubeTimestampUrl = `${url}&t=${Math.floor(startTime)}`;
      const termLink = `\u001b]8;;${youtubeTimestampUrl}\u001b\\${url} [${startHMS} → ${formatTimestamp(endTime)}]\u001b]8;;\u001b\\`;
      console.log(`[CLIP GENERATOR] Downloading segment: ${termLink}`);

      const ytdlpProcess = spawn("yt-dlp", args);

      let stderr = "";

      ytdlpProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      ytdlpProcess.on("error", (err) => {
        reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Make sure yt-dlp is installed.`));
      });

      ytdlpProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Extract a video segment from an uploaded file stored in R2
   * Validates: Requirements 7.3
   */
  static async extractSegmentFromFile(
    storageKey: string,
    startTime: number,
    endTime: number,
    aspectRatio: AspectRatio,
    quality: VideoQuality,
    captions?: ClipGenerationOptions["captions"],
    introTitle?: string,
    watermark?: boolean,
    emojis?: string
  ): Promise<Buffer> {
    this.logOperation("EXTRACT_SEGMENT_FROM_FILE", {
      storageKey,
      startTime,
      endTime,
      aspectRatio,
      quality,
      hasCaptions: !!captions?.words?.length,
      hasIntroTitle: !!introTitle,
    });

    const { width, height } = getOutputDimensions(aspectRatio, quality);
    const duration = endTime - startTime;
    const tempDir = os.tmpdir();
    const tempId = nanoid();
    const tempSubsPath = path.join(tempDir, `captions-upload-${tempId}.ass`);

    // Get signed URL for the source video
    const videoUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);

    // Generate ASS subtitles if captions, intro title, or emojis provided
    let subsPathToUse: string | undefined;
    if (captions?.words?.length || introTitle || emojis) {
      const assContent = this.generateASSSubtitles(
        captions?.words || [],
        captions?.style,
        width,
        height,
        introTitle,
        emojis
      );
      await fs.promises.writeFile(tempSubsPath, assContent);
      subsPathToUse = tempSubsPath;
      this.logOperation("GENERATED_ASS_SUBTITLES", {
        path: tempSubsPath,
        wordCount: captions?.words?.length || 0,
        hasIntroTitle: !!introTitle,
        hasEmojis: !!emojis
      });
    }

    try {
      const wmConfig = watermark
        ? this.getWatermarkFilterConfig(width, height, await this.getWatermarkLogoPath())
        : null;

      const { preset, crf } = getEncodingParams(quality);

      return await new Promise((resolve, reject) => {
        const targetAspect = width / height;
        const isVertical = targetAspect < 1;

        let args: string[];

        if (isVertical) {
          // Use blur background filter for vertical videos
          let filterComplex = this.buildBlurBackgroundFilter(width, height);

          // Add subtitles to the final output if provided
          if (subsPathToUse) {
            const escapedPath = subsPathToUse
              .replace(/\\/g, "/")
              .replace(/:/g, "\\:");
            const escapedFontsDir = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");
            filterComplex = `${filterComplex},ass=${escapedPath}:fontsdir=${escapedFontsDir}`;
          }

          if (wmConfig) {
            filterComplex = `${filterComplex}[pre_wm];${wmConfig.filterFragment},format=yuv420p[outv]`;
          } else {
            filterComplex = `${filterComplex},format=yuv420p[outv]`;
          }

          args = [
            "-ss", startTime.toString(),
            "-i", videoUrl,
            ...(wmConfig ? wmConfig.extraInputArgs : []),
            "-t", duration.toString(),
            "-filter_complex", filterComplex,
            "-map", "[outv]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", preset,
            "-crf", crf,
            "-profile:v", "high",
            "-level", "4.0",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "frag_keyframe+empty_moov",
            "-f", "mp4",
            "-",
          ];
        } else {
          // Use center-crop for non-vertical videos
          let videoFilter = `scale='max(${width},iw*${height}/ih)':'max(${height},ih*${width}/iw)',crop=${width}:${height}`;

          // Add subtitles filter if captions provided
          if (subsPathToUse) {
            const escapedPath = subsPathToUse
              .replace(/\\/g, "/")
              .replace(/:/g, "\\:");
            const escapedFontsDir = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");
            videoFilter = `${videoFilter},ass=${escapedPath}:fontsdir=${escapedFontsDir}`;
          }

          if (wmConfig) {
            // Need filter_complex for second input (watermark logo)
            const filterComplex = `[0:v]${videoFilter}[pre_wm];${wmConfig.filterFragment},format=yuv420p[outv]`;
            args = [
              "-ss", startTime.toString(),
              "-i", videoUrl,
              ...wmConfig.extraInputArgs,
              "-t", duration.toString(),
              "-filter_complex", filterComplex,
              "-map", "[outv]",
              "-map", "0:a?",
              "-c:v", "libx264",
              "-preset", preset,
              "-crf", crf,
              "-c:a", "aac",
              "-b:a", "192k",
              "-movflags", "frag_keyframe+empty_moov",
              "-f", "mp4",
              "-",
            ];
          } else {
            args = [
              "-ss", startTime.toString(),
              "-i", videoUrl,
              "-t", duration.toString(),
              "-vf", videoFilter,
              "-c:v", "libx264",
              "-preset", preset,
              "-crf", crf,
              "-c:a", "aac",
              "-b:a", "192k",
              "-movflags", "frag_keyframe+empty_moov",
              "-f", "mp4",
              "-",
            ];
          }
        }

        this.logOperation("FFMPEG_EXTRACT", { 
          args: args.join(" "), 
          hasSubtitles: !!subsPathToUse,
          isVertical,
          useBlurBackground: isVertical
        });

        const ffmpegProcess = spawn("ffmpeg", args);

        const chunks: Buffer[] = [];
        let stderr = "";
        // Kill FFmpeg if it hangs for more than 10 minutes
        const ffmpegTimeout = setTimeout(() => {
          ffmpegProcess.kill("SIGKILL");
          reject(new Error(`FFmpeg timed out after 10 minutes (downloadYouTubeSegment)`));
        }, 10 * 60 * 1000);

        ffmpegProcess.stdout?.on("data", (data) => {
          chunks.push(data);
        });

        ffmpegProcess.stderr?.on("data", (data) => {
          stderr += data.toString();
          // Log progress
          const progressMatch = data.toString().match(/time=(\d{2}:\d{2}:\d{2})/);
          if (progressMatch) {
            this.logOperation("FFMPEG_PROGRESS", { time: progressMatch[1] });
          }
        });

        ffmpegProcess.on("error", (err) => {
          clearTimeout(ffmpegTimeout);
          reject(new Error(`Failed to spawn FFmpeg: ${err.message}. Make sure FFmpeg is installed.`));
        });

        ffmpegProcess.on("close", (code) => {
          clearTimeout(ffmpegTimeout);
          if (code !== 0) {
            reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
            return;
          }

          const buffer = Buffer.concat(chunks);

          // Validate output — an MP4 with only headers (~1-2KB) means no frames were encoded
          if (buffer.length < 10000) {
            reject(new Error(`FFmpeg produced an empty or corrupt clip (${buffer.length} bytes). The segment may be outside the video's duration.`));
            return;
          }

          this.logOperation("SEGMENT_EXTRACTED", { size: buffer.length });
          resolve(buffer);
        });
      });
    } finally {
      // Cleanup temp subtitle file
      if (subsPathToUse) {
        await this.cleanupTempFile(subsPathToUse);
      }
    }
  }

  /**
   * Download an uploaded video segment from R2 to a local temp file.
   * Uses FFmpeg to seek and trim the segment efficiently.
   */
  private static async downloadUploadedSegmentToFile(
    storageKey: string,
    startTime: number,
    endTime: number,
    outputPath: string
  ): Promise<void> {
    const videoUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);
    const duration = endTime - startTime;

    return new Promise((resolve, reject) => {
      const args = [
        "-ss", startTime.toString(),
        "-i", videoUrl,
        "-t", duration.toString(),
        "-c", "copy", // Stream copy — no re-encoding, just extract the segment
        "-y",
        outputPath,
      ];

      this.logOperation("DOWNLOAD_UPLOAD_SEGMENT", { storageKey, startTime, endTime });

      const proc = spawn("ffmpeg", args);
      let stderr = "";

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("Upload segment download timed out (5 min)"));
      }, 5 * 60 * 1000);

      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          this.logOperation("DOWNLOAD_UPLOAD_SEGMENT_COMPLETE", { outputPath });
          resolve();
        } else {
          reject(new Error(`Upload segment download failed (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Single-pass FFmpeg: aspect ratio conversion + split-screen composition + optional captions.
   * Merges what was previously 3 separate encodes into 1 FFmpeg command.
   *
   * Filter graph:
   *   Input 0 (main video) → scale to top portion
   *   Input 1 (background)  → scale to bottom portion
   *   vstack → optional ASS subtitles → optional watermark → output
   */
  private static async convertWithSplitScreen(
    mainVideoPath: string,
    outputPath: string,
    backgroundVideoPath: string,
    targetWidth: number,
    targetHeight: number,
    clipDuration: number,
    splitRatio: number,
    backgroundDuration: number,
    subtitlesPath?: string,
    watermark?: boolean,
    quality: VideoQuality = "1080p"
  ): Promise<void> {
    const wmConfig = watermark
      ? this.getWatermarkFilterConfig(targetWidth, targetHeight, await this.getWatermarkLogoPath())
      : null;

    const { preset, crf } = getEncodingParams(quality);
    const topHeight = Math.round(targetHeight * (splitRatio / 100));
    const bottomHeight = targetHeight - topHeight;
    const bgArgs = SplitScreenCompositorService.getBackgroundInputArgs(clipDuration, backgroundDuration);

    // Build single filter_complex: scale both inputs → vstack → optional subs → optional watermark
    let filterComplex = [
      `[0:v]scale=${targetWidth}:${topHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${topHeight}[main]`,
      `[1:v]scale=${targetWidth}:${bottomHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${bottomHeight}[bg]`,
      `[main][bg]vstack`,
    ].join(";");

    // Append ASS subtitles if provided
    if (subtitlesPath) {
      const escapedPath = subtitlesPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      const escapedFontsDir = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");
      filterComplex = `${filterComplex},ass=${escapedPath}:fontsdir=${escapedFontsDir}`;
    }

    // Append watermark or finalize
    if (wmConfig) {
      filterComplex = `${filterComplex}[pre_wm];${wmConfig.filterFragment},format=yuv420p[outv]`;
    } else {
      filterComplex = `${filterComplex},format=yuv420p[outv]`;
    }

    const args = [
      // Input 0: main video
      "-i", mainVideoPath,
      // Input 1: background video (with loop/offset args)
      ...bgArgs.inputArgs,
      "-i", backgroundVideoPath,
      // Watermark logo input (if any)
      ...(wmConfig ? wmConfig.extraInputArgs : []),
      // Filter
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", "0:a?",
      // Encoding
      "-c:v", "libx264",
      "-preset", preset,
      "-crf", crf,
      "-profile:v", "high",
      "-level", "4.0",
      "-c:a", "aac",
      "-b:a", "192k",
      // Trim to clip duration
      "-t", clipDuration.toString(),
      "-movflags", "+faststart",
      "-y",
      outputPath,
    ];

    this.logOperation("FFMPEG_SPLIT_SCREEN_SINGLE_PASS", {
      args: args.join(" "),
      hasSubtitles: !!subtitlesPath,
      hasWatermark: !!watermark,
      splitRatio,
    });

    return new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", args);
      let stderr = "";

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("Split-screen single-pass FFmpeg timed out (20 min)"));
      }, 20 * 60 * 1000);

      proc.stderr?.on("data", (d) => {
        stderr += d.toString();
        const match = d.toString().match(/time=(\d{2}:\d{2}:\d{2})/);
        if (match) {
          this.logOperation("SPLIT_SCREEN_PROGRESS", { time: match[1] });
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          this.logOperation("SPLIT_SCREEN_SINGLE_PASS_COMPLETE", { outputPath });
          resolve();
        } else {
          reject(new Error(`Split-screen single-pass failed (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Convert aspect ratio of a video file using appropriate strategy
   * - For 9:16 vertical: blur background fill effect
   * - For other ratios: center-crop
   * Optionally burns in subtitles from ASS file
   * Validates: Requirements 8.1, 8.2, 8.3, 8.4
   */
  private static async convertAspectRatioFile(
    inputPath: string,
    outputPath: string,
    targetWidth: number,
    targetHeight: number,
    subtitlesPath?: string,
    watermark?: boolean,
    quality: VideoQuality = "1080p",
    backgroundStyle: "blur" | "black" | "white" = "blur"
  ): Promise<void> {
    const wmConfig = watermark
      ? this.getWatermarkFilterConfig(targetWidth, targetHeight, await this.getWatermarkLogoPath())
      : null;

    const { preset, crf } = getEncodingParams(quality);

    return new Promise((resolve, reject) => {
      const targetAspect = targetWidth / targetHeight;
      const isVertical = targetAspect < 1;

      let args: string[];

      if (isVertical) {
        // Use background filter based on style (complex filter graph)
        let filterComplex = this.buildBackgroundFilter(targetWidth, targetHeight, backgroundStyle);

        // Add subtitles to the final output if provided
        if (subtitlesPath) {
          const escapedPath = subtitlesPath
            .replace(/\\/g, "/")
            .replace(/:/g, "\\:");
          const escapedFontsDir = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");
          filterComplex = `${filterComplex},ass=${escapedPath}:fontsdir=${escapedFontsDir}`;
        }

        if (wmConfig) {
          filterComplex = `${filterComplex}[pre_wm];${wmConfig.filterFragment},format=yuv420p[outv]`;
        } else {
          filterComplex = `${filterComplex},format=yuv420p[outv]`;
        }

        args = [
          "-i", inputPath,
          ...(wmConfig ? wmConfig.extraInputArgs : []),
          "-filter_complex", filterComplex,
          "-map", "[outv]",
          "-map", "0:a?",
          "-c:v", "libx264",
          "-preset", preset,
          "-crf", crf,
          "-profile:v", "high",
          "-level", "4.0",
          "-c:a", "aac",
          "-b:a", "192k",
          "-movflags", "+faststart",
          "-y",
          outputPath,
        ];
      } else {
        // Use simple center-crop filter
        let videoFilter = `scale='max(${targetWidth},iw*${targetHeight}/ih)':'max(${targetHeight},ih*${targetWidth}/iw)',crop=${targetWidth}:${targetHeight}`;

        if (subtitlesPath) {
          const escapedPath = subtitlesPath
            .replace(/\\/g, "/")
            .replace(/:/g, "\\:");
          const escapedFontsDir = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");
          videoFilter = `${videoFilter},ass=${escapedPath}:fontsdir=${escapedFontsDir}`;
        }

        if (wmConfig) {
          // Need filter_complex for second input (watermark logo)
          const filterComplex = `[0:v]${videoFilter}[pre_wm];${wmConfig.filterFragment},format=yuv420p[outv]`;
          args = [
            "-i", inputPath,
            ...wmConfig.extraInputArgs,
            "-filter_complex", filterComplex,
            "-map", "[outv]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", preset,
            "-crf", crf,
            "-profile:v", "high",
            "-level", "4.0",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            "-y",
            outputPath,
          ];
        } else {
          videoFilter = `${videoFilter},format=yuv420p`;
          args = [
            "-i", inputPath,
            "-vf", videoFilter,
            "-c:v", "libx264",
            "-preset", preset,
            "-crf", crf,
            "-profile:v", "high",
            "-level", "4.0",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            "-y",
            outputPath,
          ];
        }
      }

      this.logOperation("FFMPEG_CONVERT_ASPECT", { 
        args: args.join(" "),
        hasSubtitles: !!subtitlesPath,
        isVertical,
        useBlurBackground: isVertical
      });

      const ffmpegProcess = spawn("ffmpeg", args);

      let stderr = "";
      // Kill FFmpeg if it hangs for more than 20 minutes
      // (93s clip at 0.27x speed = ~6min encode alone; 10min was too tight)
      const ffmpegTimeout = setTimeout(() => {
        ffmpegProcess.kill("SIGKILL");
        reject(new Error(`FFmpeg timed out after 20 minutes (convertAspectRatioFile)`));
      }, 20 * 60 * 1000);

      ffmpegProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpegProcess.on("error", (err) => {
        clearTimeout(ffmpegTimeout);
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });

      ffmpegProcess.on("close", (code) => {
        clearTimeout(ffmpegTimeout);
        if (code !== 0) {
          reject(new Error(`FFmpeg aspect ratio conversion failed with code ${code}: ${stderr}`));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Convert aspect ratio of a video buffer
   * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
   */
  static async convertAspectRatio(
    input: Buffer,
    targetRatio: AspectRatio,
    quality: VideoQuality = "1080p"
  ): Promise<Buffer> {
    this.logOperation("CONVERT_ASPECT_RATIO", {
      inputSize: input.length,
      targetRatio,
      quality,
    });

    const { width, height } = getOutputDimensions(targetRatio, quality);
    const tempDir = os.tmpdir();
    const tempId = nanoid();
    const tempInputPath = path.join(tempDir, `aspect-input-${tempId}.mp4`);
    const tempOutputPath = path.join(tempDir, `aspect-output-${tempId}.mp4`);

    try {
      // Write input buffer to temp file
      await fs.promises.writeFile(tempInputPath, input);

      // Convert aspect ratio
      await this.convertAspectRatioFile(tempInputPath, tempOutputPath, width, height, undefined, undefined, quality);

      // Read output file
      const outputBuffer = await fs.promises.readFile(tempOutputPath);

      this.logOperation("ASPECT_RATIO_CONVERTED", {
        inputSize: input.length,
        outputSize: outputBuffer.length,
        dimensions: `${width}x${height}`,
      });

      return outputBuffer;
    } finally {
      // Cleanup temp files
      await this.cleanupTempFile(tempInputPath);
      await this.cleanupTempFile(tempOutputPath);
    }
  }

  /**
   * Build FFmpeg filter for aspect ratio conversion
   * Uses different strategies based on source and target aspect ratios:
   * 
   * For 9:16 vertical from 16:9 horizontal source (portrait from landscape):
   * - Uses BLUR BACKGROUND FILL: Original video centered with blurred/zoomed background filling top/bottom
   * 
   * For other conversions:
   * - Uses CENTER-CROP: Scale to cover and crop from center
   * 
   * Validates: Requirements 8.4
   */
  private static buildCenterCropFilter(targetWidth: number, targetHeight: number): string {
    const targetAspect = targetWidth / targetHeight;
    
    // For 9:16 vertical output (targetAspect < 1), use blur background fill
    // This creates the effect where the original video is centered and 
    // blurred/zoomed version fills the top and bottom
    if (targetAspect < 1) {
      return this.buildBlurBackgroundFilter(targetWidth, targetHeight);
    }
    
    // For other aspect ratios (1:1, 16:9), use center-crop
    // Scale to cover: ensure the scaled video is at least as large as target in both dimensions
    return `scale='max(${targetWidth},iw*${targetHeight}/ih)':'max(${targetHeight},ih*${targetWidth}/iw)',crop=${targetWidth}:${targetHeight}`;
  }

  /**
   * Build FFmpeg filter for blur background fill effect
   * Creates a vertical video with:
   * 1. Blurred, zoomed background that fills the entire frame
   * 2. Original video scaled to fit width, centered vertically
   * 
   * This is the popular TikTok/Reels style for horizontal videos
   */
  private static buildBlurBackgroundFilter(targetWidth: number, targetHeight: number): string {
    // Filter explanation:
    // [0:v]split=2[bg][fg] - Split input into two streams: background and foreground
    // 
    // Background stream [bg]:
    // - scale to cover the target (fill entire frame)
    // - crop to exact target size
    // - apply gaussian blur
    // - slightly darken to make foreground pop
    // 
    // Foreground stream [fg]:
    // - scale to fit width while maintaining aspect ratio
    // - use -2 for height to ensure even dimensions
    // 
    // Overlay:
    // - overlay foreground centered on blurred background
    
    return `[0:v]split=2[bg][fg];` +
      // Background: scale to cover, crop, blur, and slightly darken
      `[bg]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,` +
      `crop=${targetWidth}:${targetHeight},` +
      `gblur=sigma=20,` +
      `eq=brightness=-0.1[bg_blur];` +
      // Foreground: scale to 1.25x width for a zoomed-in look, sides cropped by overlay boundary
      `[fg]scale=${Math.round(targetWidth * 1.25)}:-2,setsar=1[fg_scaled];` +
      // Overlay foreground centered on blurred background
      `[bg_blur][fg_scaled]overlay=(W-w)/2:(H-h)/2,setsar=1`;
  }

  /**
   * Build a solid color background filter for vertical clips
   */
  private static buildSolidBackgroundFilter(targetWidth: number, targetHeight: number, color: string): string {
    return `color=c=${color}:s=${targetWidth}x${targetHeight}:d=1[bg_solid];` +
      `[0:v]scale=${Math.round(targetWidth * 1.25)}:-2,setsar=1[fg_scaled];` +
      `[bg_solid][fg_scaled]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1`;
  }

  /**
   * Dispatcher: pick the right background filter based on style
   */
  private static buildBackgroundFilter(targetWidth: number, targetHeight: number, style: "blur" | "black" | "white" = "blur"): string {
    switch (style) {
      case "black":
        return this.buildSolidBackgroundFilter(targetWidth, targetHeight, "black");
      case "white":
        return this.buildSolidBackgroundFilter(targetWidth, targetHeight, "white");
      case "blur":
      default:
        return this.buildBlurBackgroundFilter(targetWidth, targetHeight);
    }
  }

  /**
   * Clean up a temporary file
   */
  private static async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      // Ignore errors if file doesn't exist
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`[CLIP GENERATOR] Failed to cleanup temp file: ${filePath}`, err);
      }
    }
  }

  /**
   * Generate a storage key for a clip
   * @deprecated Use R2Service.generateClipStorageKey instead
   */
  static generateClipStorageKey(
    userId: string,
    videoId: string,
    clipId: string,
    aspectRatio: AspectRatio
  ): string {
    return R2Service.generateClipStorageKey(userId, videoId, clipId, aspectRatio, false);
  }

  /**
   * Validate clip generation options
   */
  static validateOptions(options: ClipGenerationOptions): { valid: boolean; error?: string } {
    if (options.startTime < 0) {
      return { valid: false, error: "Start time cannot be negative" };
    }

    if (options.endTime <= options.startTime) {
      return { valid: false, error: "End time must be greater than start time" };
    }

    const duration = options.endTime - options.startTime;
    if (duration < 5) {
      return { valid: false, error: "Clip duration must be at least 5 seconds" };
    }

    if (duration > 180) {
      return { valid: false, error: "Clip duration cannot exceed 180 seconds" };
    }

    if (options.sourceType === "youtube" && !options.sourceUrl) {
      return { valid: false, error: "Source URL is required for YouTube clips" };
    }

    if (options.sourceType === "upload" && !options.storageKey) {
      return { valid: false, error: "Storage key is required for uploaded video clips" };
    }

    const validAspectRatios: AspectRatio[] = ["9:16", "1:1", "16:9"];
    if (!validAspectRatios.includes(options.aspectRatio)) {
      return { valid: false, error: `Invalid aspect ratio. Must be one of: ${validAspectRatios.join(", ")}` };
    }

    const validQualities: VideoQuality[] = ["720p", "1080p", "2k", "4k"];
    if (!validQualities.includes(options.quality)) {
      return { valid: false, error: `Invalid quality. Must be one of: ${validQualities.join(", ")}` };
    }

    return { valid: true };
  }

  /**
   * Generate a thumbnail from a clip at 1 second offset
   * Returns the thumbnail as a buffer
   */
  static async generateThumbnail(
    storageKey: string,
    aspectRatio: AspectRatio,
    quality: VideoQuality = "720p"
  ): Promise<{ thumbnailKey: string; thumbnailUrl: string }> {
    this.logOperation("GENERATE_THUMBNAIL", { storageKey, aspectRatio });

    const { width, height } = getOutputDimensions(aspectRatio, quality);
    
    // Get signed URL for the clip
    const clipUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);
    
    // Generate thumbnail key (same path as clip but with .jpg extension)
    const thumbnailKey = storageKey.replace(/\.mp4$/, "-thumb.jpg");

    return new Promise((resolve, reject) => {
      const args = [
        "-i", clipUrl,
        "-ss", "1",           // Seek to 1 second
        "-vframes", "1",      // Extract 1 frame
        "-vf", `scale=${width}:${height}`,
        "-q:v", "2",          // High quality JPEG
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-",
      ];

      this.logOperation("FFMPEG_THUMBNAIL", { args: args.join(" ") });

      const ffmpegProcess = spawn("ffmpeg", args);

      const chunks: Buffer[] = [];
      let stderr = "";

      ffmpegProcess.stdout?.on("data", (data) => {
        chunks.push(data);
      });

      ffmpegProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpegProcess.on("error", (err) => {
        reject(new Error(`Failed to spawn FFmpeg for thumbnail: ${err.message}`));
      });

      ffmpegProcess.on("close", async (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg thumbnail failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const thumbnailBuffer = Buffer.concat(chunks);
          
          // Upload thumbnail to R2
          const { url: thumbnailUrl } = await R2Service.uploadFile(
            thumbnailKey,
            thumbnailBuffer,
            "image/jpeg"
          );

          this.logOperation("THUMBNAIL_GENERATED", { 
            thumbnailKey, 
            size: thumbnailBuffer.length 
          });

          resolve({ thumbnailKey, thumbnailUrl });
        } catch (uploadError) {
          reject(new Error(`Failed to upload thumbnail: ${uploadError}`));
        }
      });
    });
  }
}
