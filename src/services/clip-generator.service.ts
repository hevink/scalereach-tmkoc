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

/** A pre-rendered PNG for a text overlay that contains emoji */
export interface EmojiOverlayPng {
  pngPath: string;
  x: number;       // pixel x center in output video
  y: number;       // pixel y center in output video
  startTime: number; // seconds
  endTime: number;   // seconds
}

export type AspectRatio = "9:16" | "1:1" | "16:9";
export type VideoQuality = "720p" | "1080p" | "2k" | "4k";

export interface ClipGenerationOptions {
  userId: string;
  videoId: string;
  clipId: string;
  sourceType: "youtube" | "upload";
  sourceUrl?: string;
  storageKey?: string;
  // Shared source: pre-downloaded spanning segment stored in R2 (avoids per-clip yt-dlp calls)
  sharedSourceKey?: string;
  sharedSourceSpanStart?: number; // Start time of the shared source segment (for offset calculation)
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  watermark?: boolean;
  emojis?: string;
  introTitle?: string;
  backgroundStyle?: "blur" | "black" | "white" | "gradient-ocean" | "gradient-midnight" | "gradient-sunset" | "mirror" | "zoom";
  videoScale?: number; // 100 = 1.0x, 125 = 1.25x default, 200 = 2.0x
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
  textOverlays?: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    color: string;
    backgroundColor: string;
    backgroundOpacity: number;
    borderRadius?: number;
    startTime: number;
    endTime: number;
    animation?: "none" | "fade-in" | "slide-up" | "typewriter";
  }>;
  // Smart AI Reframing - run face detection + crop before caption burn
  smartCropEnabled?: boolean;
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
  // Thumbnail generated locally from the captioned clip (avoids re-downloading from R2)
  thumbnailBuffer?: Buffer;
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
    "2k": 1440,   // actual encode - shown as "4K" in UI
    "4k": 2160,
  };

  const baseSize = qualityMap[quality];

  switch (aspectRatio) {
    case "9:16": // Vertical (TikTok, Reels, Shorts) - baseSize is the WIDTH (e.g. 1080→1080×1920)
      return { width: baseSize, height: Math.round(baseSize * (16 / 9)) };
    case "1:1": // Square (Instagram feed)
      return { width: baseSize, height: baseSize };
    case "16:9": // Horizontal (YouTube) - baseSize is the HEIGHT (e.g. 1080→1920×1080)
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
    return { preset: "medium", crf: "20" };
  }
  return { preset: "fast", crf: "22" };
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

    // Use a short timestamp version so each export gets a unique URL (avoids CDN cache serving stale video)
    const exportVersion = Date.now().toString(36);
    const storageKey = R2Service.generateClipStorageKey(options.userId, options.videoId, options.clipId, options.aspectRatio, false, exportVersion);
    const rawStorageKey = R2Service.generateClipStorageKey(options.userId, options.videoId, options.clipId, options.aspectRatio, true, exportVersion);

    const tempDir = os.tmpdir();
    const tempId = nanoid();
    // Shared temp paths for the single-download approach
    const rawSourcePath = path.join(tempDir, `src-${tempId}.mp4`);
    const captionedOutputPath = path.join(tempDir, `cap-${tempId}.mp4`);
    const rawOutputPath = path.join(tempDir, `raw-${tempId}.mp4`);
    const tempPaths: string[] = [rawSourcePath, captionedOutputPath, rawOutputPath];

    let clipWithCaptionsBuffer: Buffer;
    let clipWithoutCaptionsBuffer!: Buffer;

    try {
      // ── STEP 1: Download/extract source segment ONCE ──
      onProgress?.(10);
      if (options.sharedSourceKey) {
        // Shared source: pre-downloaded spanning segment in R2 — slice locally with ffmpeg
        // This avoids a per-clip yt-dlp round trip to YouTube
        const offsetStart = options.startTime - (options.sharedSourceSpanStart ?? options.startTime);
        const offsetEnd = options.endTime - (options.sharedSourceSpanStart ?? options.startTime);
        this.logOperation("USING_SHARED_SOURCE", {
          sharedSourceKey: options.sharedSourceKey,
          spanStart: options.sharedSourceSpanStart,
          clipStart: options.startTime,
          clipEnd: options.endTime,
          offsetStart,
          offsetEnd,
        });
        try {
          await this.downloadUploadedSegmentToFile(
            options.sharedSourceKey, offsetStart, offsetEnd, rawSourcePath
          );
        } catch (sharedErr) {
          // Shared source may not exist in R2 (e.g. worker crashed mid-upload).
          // Fall back to direct YouTube download.
          this.logOperation("SHARED_SOURCE_FALLBACK", {
            error: sharedErr instanceof Error ? sharedErr.message : String(sharedErr),
            fallback: "direct YouTube download",
          });
          if (options.sourceType === "youtube" && options.sourceUrl) {
            await this.downloadYouTubeSegmentToFile(
              options.sourceUrl, options.startTime, options.endTime, rawSourcePath, options.quality
            );
          } else {
            throw sharedErr; // No fallback available for uploaded videos
          }
        }
      } else if (options.sourceType === "youtube" && options.sourceUrl) {
        // Fallback: direct YouTube download (single-clip re-exports, editing, etc.)
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
      const hasCaptions = !!(options.captions?.words?.length || options.introTitle || options.emojis || options.textOverlays?.length);

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
      } else if (options.smartCropEnabled) {
        // Smart crop enabled - skip aspect ratio conversion here.
        // Smart crop (step 3b) will run on the original source and produce the 9:16 output directly.
        this.logOperation("SKIP_ASPECT_RATIO_CONVERT", { reason: "smartCropEnabled, will reframe from source" });
      } else {
        // Single-pass: aspect ratio conversion only
        await this.convertAspectRatioFile(
          rawSourcePath, rawOutputPath, width, height,
          undefined, // no subtitles
          options.watermark, options.quality,
          options.backgroundStyle,
          undefined, // no emoji overlays
          false, // not already converted
          options.videoScale
        );
      }

      // Only read the raw output if it was actually produced (not when smart crop will handle it)
      if (!options.smartCropEnabled || hasSplitScreen) {
        clipWithoutCaptionsBuffer = await fs.promises.readFile(rawOutputPath);

        if (clipWithoutCaptionsBuffer.length < 10000) {
          throw new Error(`FFmpeg produced an empty or corrupt clip (${clipWithoutCaptionsBuffer.length} bytes). The segment may be outside the video's duration.`);
        }
      }

      // ── STEP 3b: Smart AI Reframe (optional) ──
      // Run face detection on the ORIGINAL SOURCE (landscape 16:9), not the converted file.
      // The Python script detects faces and produces crop coords, then FFmpeg crops + scales to 9:16.
      if (options.smartCropEnabled && !hasSplitScreen) {
        try {
          this.logOperation("SMART_CROP_START", { clipId: options.clipId, inputFile: rawSourcePath });
          const PYTHON_PATH = process.env.PYTHON_PATH || "python3";
          const SMART_CROP_SCRIPT = path.join(__dirname, "../scripts/smart_crop.py");
          const TMP_DIR = os.tmpdir();
          const reframedPath = path.join(TMP_DIR, `reframed-${tempId}.mp4`);
          tempPaths.push(reframedPath);

          // Run Python face detection sidecar on the ORIGINAL SOURCE file (landscape)
          await new Promise<void>((resolve, reject) => {
            const proc = spawn(PYTHON_PATH, [SMART_CROP_SCRIPT, rawSourcePath, options.clipId, TMP_DIR]);
            proc.stdout?.on("data", (d) => process.stdout.write(`[SMART CROP PY] ${d}`));
            proc.stderr?.on("data", (d) => process.stderr.write(`[SMART CROP PY] ${d}`));
            proc.on("error", (err) => reject(new Error(`Python spawn failed: ${err.message}`)));
            proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Python exited ${code}`)));
          });

          const coordsPath = path.join(TMP_DIR, `${options.clipId}_coords.json`);
          const result = JSON.parse(await fs.promises.readFile(coordsPath, "utf-8"));
          await fs.promises.unlink(coordsPath).catch(() => {});

          if (result.mode !== "skip") {
            // Apply FFmpeg reframe to the ORIGINAL SOURCE → reframed 9:16 output
            await new Promise<void>((resolve, reject) => {
              const { spawn: spawnFfmpeg } = require("child_process");
              let args: string[];

              if (result.mode === "split") {
                // Screen recording + PiP face cam → split layout
                const { pip, src_w: srcW, src_h: srcH } = result;
                const outW = width;
                const outH = height;
                const halfH = Math.round(outH / 2);
                const scaledH = Math.round(outW * srcH / srcW);
                const padY = Math.round((halfH - scaledH) / 2);
                args = [
                  "-i", rawSourcePath,
                  "-filter_complex",
                  `[0:v]scale=${outW}:${scaledH}:flags=lanczos,pad=${outW}:${halfH}:0:${padY}:black[full];` +
                  `[0:v]crop=${pip.w}:${pip.h}:${pip.x}:${pip.y},scale=${outW}:${halfH}:flags=lanczos[face];` +
                  `[full][face]vstack=inputs=2,format=yuv420p[out]`,
                  "-map", "[out]", "-map", "0:a?",
                  "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                  "-c:a", "aac", "-b:a", "192k",
                  "-y", reframedPath,
                ];
              } else if (result.mode === "letterbox") {
                // Group shot (4+ faces) - letterbox full frame into 9:16
                args = [
                  "-i", rawSourcePath,
                  "-vf", `scale=${width}:-2:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p`,
                  "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                  "-c:a", "aac", "-b:a", "192k",
                  "-y", reframedPath,
                ];
              } else if (result.mode === "mixed" && result.segments) {
                // Mixed segments - face-tracked + no-face sections
                // Extract coords from all segments; for letterbox segments without coords,
                // generate center-crop coords so the whole clip is covered.
                const allCoords: Array<{ t: number; x: number; y: number; w: number; h: number }> = [];
                const cropW = result.crop_w || width;
                const cropH = result.crop_h || height;

                for (const seg of result.segments) {
                  if (seg.coords && seg.coords.length > 0) {
                    allCoords.push(...seg.coords);
                  } else {
                    // No coords for this segment - use center crop as fallback
                    // (Python script should always provide coords now, but just in case)
                    this.logOperation("SMART_CROP_MIXED_CENTER_FALLBACK", {
                      clipId: options.clipId,
                      segType: seg.type,
                      start: seg.start,
                      end: seg.end,
                    });
                    allCoords.push({
                      t: seg.start,
                      x: 0, // will be overridden by sendcmd if other coords exist
                      y: 0,
                      w: cropW,
                      h: cropH,
                    });
                  }
                }
                if (allCoords.length === 0) {
                  this.logOperation("SMART_CROP_MIXED_NO_COORDS", { clipId: options.clipId });
                  reject(new Error("__FALLBACK__"));
                  return;
                }
                const first = allCoords[0];
                const cmdLines = allCoords.flatMap(({ t, x, y, w, h }: any) => [
                  `${t} crop x ${x};`, `${t} crop y ${y};`, `${t} crop w ${w};`, `${t} crop h ${h};`,
                ]);
                const cmdFile = path.join(TMP_DIR, `sc-cmds-${tempId}.txt`);
                tempPaths.push(cmdFile);
                require("fs").writeFileSync(cmdFile, cmdLines.join("\n"));
                args = [
                  "-i", rawSourcePath,
                  "-vf", `sendcmd=f=${cmdFile},crop=${first.w}:${first.h},scale=${width}:${height}:flags=lanczos`,
                  "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                  "-c:a", "aac", "-b:a", "192k",
                  "-y", reframedPath,
                ];
              } else if (result.mode === "crop" && result.coords?.length) {
                // Standard face-tracking crop
                const coords: Array<{ t: number; x: number; y: number; w: number; h: number }> = result.coords;
                const first = coords[0];
                const cmdLines = coords.flatMap(({ t, x, y, w, h }) => [
                  `${t} crop x ${x};`, `${t} crop y ${y};`, `${t} crop w ${w};`, `${t} crop h ${h};`,
                ]);
                const cmdFile = path.join(TMP_DIR, `sc-cmds-${tempId}.txt`);
                tempPaths.push(cmdFile);
                require("fs").writeFileSync(cmdFile, cmdLines.join("\n"));
                args = [
                  "-i", rawSourcePath,
                  "-vf", `sendcmd=f=${cmdFile},crop=${first.w}:${first.h},scale=${width}:${height}:flags=lanczos`,
                  "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                  "-c:a", "aac", "-b:a", "192k",
                  "-y", reframedPath,
                ];
              } else {
                // Unknown mode or missing data - skip reframe
                this.logOperation("SMART_CROP_UNKNOWN_MODE_FALLBACK", { clipId: options.clipId, mode: result.mode });
                reject(new Error("__FALLBACK__"));
                return;
              }

              const ff = spawnFfmpeg("ffmpeg", args);
              let stderr = "";
              ff.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
              ff.on("error", (err: Error) => reject(new Error(`FFmpeg reframe failed: ${err.message}`)));
              ff.on("close", (code: number) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg reframe exited ${code}: ${stderr.slice(-300)}`));
              });
            });

            // Write reframed version to rawOutputPath for caption burn
            const reframedBuf = await fs.promises.readFile(reframedPath);
            await fs.promises.writeFile(rawOutputPath, reframedBuf);
            clipWithoutCaptionsBuffer = reframedBuf;
            this.logOperation("SMART_CROP_DONE", { clipId: options.clipId, size: reframedBuf.length });
          } else {
            // No faces detected - fall back to standard aspect ratio conversion
            this.logOperation("SMART_CROP_SKIP_FALLBACK", { clipId: options.clipId, reason: "no face detected, falling back to standard conversion" });
            await this.convertAspectRatioFile(
              rawSourcePath, rawOutputPath, width, height,
              undefined, options.watermark, options.quality,
              options.backgroundStyle, undefined, false, options.videoScale
            );
            clipWithoutCaptionsBuffer = await fs.promises.readFile(rawOutputPath);

            if (clipWithoutCaptionsBuffer.length < 10000) {
              throw new Error(`FFmpeg produced an empty or corrupt clip (${clipWithoutCaptionsBuffer.length} bytes).`);
            }
          }
        } catch (scErr) {
          // If it's a fallback signal (not a real error), do standard conversion
          if (scErr instanceof Error && scErr.message === "__FALLBACK__") {
            this.logOperation("SMART_CROP_FALLBACK_TO_STANDARD", { clipId: options.clipId });
            await this.convertAspectRatioFile(
              rawSourcePath, rawOutputPath, width, height,
              undefined, options.watermark, options.quality,
              options.backgroundStyle, undefined, false, options.videoScale
            );
            clipWithoutCaptionsBuffer = await fs.promises.readFile(rawOutputPath);
          } else {
            // Smart crop was explicitly enabled - fail the job so the user knows
            console.error(`[CLIP GENERATOR] Smart crop FAILED for clip ${options.clipId}:`, scErr);
            throw new Error(`Smart AI Reframing failed: ${scErr instanceof Error ? scErr.message : scErr}`);
          }
        }
      }

      // ── STEP 4: Generate CAPTIONED clip ──
      onProgress?.(55);
      if (!hasCaptions) {
        // No captions needed - reuse the raw buffer (zero extra encoding)
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
          options.emojis,
          options.textOverlays,
          hasSplitScreen ? options.splitScreen!.splitRatio : undefined
        );
        const tempSubsPath = path.join(tempDir, `subs-${tempId}.ass`);
        tempPaths.push(tempSubsPath);
        await fs.promises.writeFile(tempSubsPath, assContent, "utf8");

        // ── Render emoji overlays as PNG images ──
        // Text overlays and intro title that contain emoji cannot be rendered by libass.
        // We render them as PNG via Python+PIL and composite via FFmpeg overlay filter.
        const emojiOverlayPngs: EmojiOverlayPng[] = [];
        const emojiPngPaths: string[] = [];

        // Check text overlays for emoji
        if (options.textOverlays) {
          for (const overlay of options.textOverlays) {
            if (ClipGeneratorService.hasEmoji(overlay.text)) {
              try {
                const pngPath = await ClipGeneratorService.renderEmojiOverlayAsPng(
                  overlay.text,
                  overlay.fontSize || 32,
                  overlay.color || "#FFFFFF",
                  overlay.backgroundColor || "#000000",
                  overlay.backgroundOpacity ?? 0,
                  width, height,
                  80
                );
                emojiPngPaths.push(pngPath);
                tempPaths.push(pngPath);
                emojiOverlayPngs.push({
                  pngPath,
                  x: Math.round((overlay.x / 100) * width),
                  y: Math.round((overlay.y / 100) * height),
                  startTime: overlay.startTime,
                  endTime: overlay.endTime,
                });
                this.logOperation("EMOJI_OVERLAY_PNG_READY", { id: overlay.id, text: overlay.text });
              } catch (err) {
                console.warn(`[CLIP GENERATOR] Failed to render emoji overlay PNG for "${overlay.text}":`, err);
              }
            }
          }
        }

        // Check intro title for emoji
        if (options.introTitle && ClipGeneratorService.hasEmoji(options.introTitle)) {
          try {
            const pngPath = await ClipGeneratorService.renderEmojiOverlayAsPng(
              options.introTitle,
              36,
              "#000000",
              "#FFFFFF",
              100,
              width, height,
              80
            );
            emojiPngPaths.push(pngPath);
            tempPaths.push(pngPath);
            emojiOverlayPngs.push({
              pngPath,
              x: Math.round(width / 2),
              y: hasSplitScreen
                ? Math.round(height * (options.splitScreen!.splitRatio / 100))
                : Math.round(height * 0.20),
              startTime: 0,
              endTime: 3,
            });
            this.logOperation("EMOJI_INTRO_TITLE_PNG_READY", { text: options.introTitle });
          } catch (err) {
            console.warn(`[CLIP GENERATOR] Failed to render emoji intro title PNG:`, err);
          }
        }

        const emojiOverlaysArg = emojiOverlayPngs.length > 0 ? emojiOverlayPngs : undefined;

        if (hasSplitScreen && bgTempPath) {
          // Single-pass: aspect ratio + split-screen + captions all in one FFmpeg command
          await this.convertWithSplitScreen(
            rawSourcePath, captionedOutputPath, bgTempPath,
            width, height, duration,
            options.splitScreen!.splitRatio,
            options.splitScreen!.backgroundDuration,
            tempSubsPath,
            options.watermark, options.quality,
            emojiOverlaysArg
          );
        } else {
          // If smart crop ran, burn captions onto the reframed file (already aspect-ratio converted).
          // Otherwise burn onto the original source (convertAspectRatioFile handles the conversion).
          const captionInputPath = options.smartCropEnabled ? rawOutputPath : rawSourcePath;
          await this.convertAspectRatioFile(
            captionInputPath, captionedOutputPath, width, height,
            tempSubsPath,
            options.watermark, options.quality,
            options.backgroundStyle,
            emojiOverlaysArg,
            // Skip aspect ratio conversion if already reframed
            options.smartCropEnabled ? true : false,
            options.videoScale
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

      // ── STEP 5: Upload to R2 ──
      // When both raw and captioned are different, upload in parallel (saves 10-30s for large files)
      onProgress?.(70);

      let storageUrl: string;
      let rawStorageUrl: string;

      if (clipWithCaptionsBuffer === clipWithoutCaptionsBuffer) {
        // No captions — raw is identical to captioned, single upload
        this.logOperation("UPLOADING_CLIP_SINGLE", { storageKey, size: clipWithCaptionsBuffer.length });
        ({ url: storageUrl } = await R2Service.uploadFile(storageKey, clipWithCaptionsBuffer, "video/mp4"));
        rawStorageUrl = storageUrl;
        this.logOperation("SKIP_RAW_UPLOAD", { reason: "identical to captioned (no captions)", savedBytes: clipWithoutCaptionsBuffer.length });
      } else {
        // Both versions needed — upload in parallel
        this.logOperation("UPLOADING_CLIPS_PARALLEL", {
          captionedKey: storageKey, captionedSize: clipWithCaptionsBuffer.length,
          rawKey: rawStorageKey, rawSize: clipWithoutCaptionsBuffer.length,
        });
        const [captionedResult, rawResult] = await Promise.all([
          R2Service.uploadFile(storageKey, clipWithCaptionsBuffer, "video/mp4"),
          R2Service.uploadFile(rawStorageKey, clipWithoutCaptionsBuffer, "video/mp4"),
        ]);
        storageUrl = captionedResult.url;
        rawStorageUrl = rawResult.url;
        this.logOperation("UPLOADS_COMPLETE", { captionedUrl: storageUrl, rawUrl: rawStorageUrl });
      }

      onProgress?.(85);

      // ── STEP 6: Generate thumbnail from local captioned file (before cleanup) ──
      // Use the local file - much faster than re-downloading from R2
      const thumbSourcePath = hasCaptions ? captionedOutputPath : rawOutputPath;
      // Thumbnail offset: past the 3s intro title, but not past the clip end
      const thumbOffset = Math.min(Math.max(duration * 0.3, 4), duration - 0.5);
      let thumbnailBuffer: Buffer | undefined;
      try {
        thumbnailBuffer = await this.extractThumbnailFromFile(thumbSourcePath, width, height, thumbOffset);
        this.logOperation("THUMBNAIL_EXTRACTED_LOCALLY", { size: thumbnailBuffer.length, offset: thumbOffset });
      } catch (thumbErr) {
        console.warn(`[CLIP GENERATOR] Local thumbnail extraction failed (non-fatal):`, thumbErr);
      }

      return {
        storageKey,
        storageUrl,
        rawStorageKey,
        rawStorageUrl,
        duration,
        width,
        height,
        fileSize: clipWithCaptionsBuffer.length,
        thumbnailBuffer,
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
    quality: VideoQuality = "1080p",
    textOverlays?: ClipGenerationOptions["textOverlays"]
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
      emojis,
      textOverlays
    );
    await Promise.all([
      fs.promises.writeFile(inputPath, videoBuffer),
      fs.promises.writeFile(subsPath, assContent, "utf8"),
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
    emojis?: string,
    textOverlays?: ClipGenerationOptions["textOverlays"],
    splitRatio?: number
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
    // NOTE: Don't scale outline by full scaleFactor - ASS \bord renders thicker than CSS stroke.
    // Use a dampened scale to keep it visually close to the frontend preview.
    let rawOutline = 0;
    if (style?.outline) rawOutline = style?.outlineWidth ?? 3;
    else if (style?.shadow) rawOutline = 2;
    const outline = Math.round(rawOutline * Math.sqrt(scaleFactor));
    const shadow = 0; // Frontend has no drop shadow

    // Enhanced style options - match frontend exactly
    // Frontend defaults to 110%: (style.highlightScale ?? 110) / 100
    const highlightScale = style?.highlightScale ?? 110;
    const maxWordsPerLine = style?.wordsPerLine ?? 5;

    // Helper - apply textTransform from style (matching frontend)
    // Also wraps non-Latin words with \fn override for correct font rendering
    const transformWord = (word: string) => {
      const transformed = style?.textTransform === "uppercase" ? word.toUpperCase() : word;
      return wrapWordWithFont(transformed);
    };

    // Determine positioning from x/y percentages or fallback to position preset
    // Frontend: x (0-100) = horizontal center, y (0-100) = vertical center
    // maxWidth (20-100) = caption container width as percentage
    const hasXY = typeof style?.x === "number" && typeof style?.y === "number";
    const xPct = style?.x ?? 25;
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
        // Top zone - alignment 7/8/9, marginV = distance from top
        alignment = 6 + hAlign;
        marginV = Math.round((yPct / 100) * height);
      } else if (yPct >= 66) {
        // Bottom zone - alignment 1/2/3, marginV = distance from bottom
        alignment = hAlign;
        marginV = Math.round(((100 - yPct) / 100) * height);
      } else {
        // Center zone - alignment 4/5/6, marginV = offset from center
        alignment = 3 + hAlign;
        // ASS center alignment: marginV shifts text away from exact center
        const offsetFromCenter = yPct - 50; // positive = below center
        marginV = Math.round(Math.abs(offsetFromCenter) / 100 * height);
        // If below center, we need to push down - ASS MarginV for center alignment
        // pushes toward bottom when positive, which matches our need
        if (offsetFromCenter < 0) {
          // Above center - flip to top alignment
          alignment = 6 + hAlign;
          marginV = Math.round((yPct / 100) * height);
        }
      }
    } else {
      // Fallback to legacy position preset - scale margins proportionally with height
      const textAlign = style?.alignment || "center";
      const hAlign = textAlign === "left" ? 1 : textAlign === "right" ? 3 : 2;
      alignment = style?.position === "top" ? (6 + hAlign) : style?.position === "center" ? (3 + hAlign) : hAlign;
      marginV = style?.position === "center" ? 0 : style?.position === "top" ? Math.round(height * 0.055) : Math.round(height * 0.11);
      // Apply maxWidth even in legacy mode
      const halfGap = Math.max(0, (100 - captionMaxWidth) / 2);
      marginL = Math.round((halfGap / 100) * width);
      marginR = marginL;
    }

    // Intro title style - larger than captions
    // When split screen is active, position at the split boundary (center between top and bottom video)
    // Otherwise default to 20% from top
    const introFontSize = Math.round(fontSize * 1.4);
    const introMarginV = splitRatio
      ? Math.round(height * (splitRatio / 100))
      : Math.round(height * 0.20);

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

    // For non-Latin scripts (Hindi/Devanagari, Arabic, CJK, etc.) the selected
    // fontFamily won't have glyphs. We detect non-Latin text per-word and use
    // ASS \fn override tags to switch to the appropriate Noto Sans font.
    // The Noto Sans font files must be present in assets/fonts/.
    const effectiveFontFamily = fontFamily;

    /**
     * Detect if a word contains non-Latin characters and return the
     * appropriate Noto Sans font name for ASS \fn override.
     * Returns null if the word is Latin-only (no override needed).
     */
    const getNonLatinFont = (word: string): string | null => {
      // Devanagari (Hindi, Marathi, Sanskrit, Nepali)
      if (/[\u0900-\u097F]/.test(word)) return "Noto Sans Devanagari";
      // Arabic / Urdu / Persian / Hebrew
      if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(word)) return "Noto Sans Arabic";
      if (/[\u0590-\u05FF]/.test(word)) return "Noto Sans Hebrew";
      // CJK (Chinese, Japanese, Korean)
      if (/[\u3000-\u9FFF\uF900-\uFAFF\u{20000}-\u{2FA1F}]|[\uAC00-\uD7AF]|[\u3040-\u309F\u30A0-\u30FF]/u.test(word)) return "Noto Sans CJK SC";
      // Bengali
      if (/[\u0980-\u09FF]/.test(word)) return "Noto Sans Bengali";
      // Tamil
      if (/[\u0B80-\u0BFF]/.test(word)) return "Noto Sans Tamil";
      // Telugu
      if (/[\u0C00-\u0C7F]/.test(word)) return "Noto Sans Telugu";
      // Kannada
      if (/[\u0C80-\u0CFF]/.test(word)) return "Noto Sans Kannada";
      // Thai
      if (/[\u0E00-\u0E7F]/.test(word)) return "Noto Sans Thai";
      // Cyrillic (Russian, Ukrainian, etc.)
      if (/[\u0400-\u04FF]/.test(word)) return "Noto Sans";
      // Greek
      if (/[\u0370-\u03FF]/.test(word)) return "Noto Sans";
      return null;
    };

    /**
     * Wrap a word with ASS \fn override tag if it contains non-Latin characters.
     * This switches libass to the appropriate Noto Sans font for that word,
     * then switches back to the primary font for the next word.
     */
    const wrapWordWithFont = (word: string): string => {
      const notoFont = getNonLatinFont(word);
      if (!notoFont) return word;
      return `{\\fn${notoFont}}${word}{\\fn${effectiveFontFamily}}`;
    };

    // UTF-8 BOM ensures libass parses the file as UTF-8 (required for Hindi/non-Latin)
    const UTF8_BOM = "\uFEFF";

    let ass = `${UTF8_BOM}[Script Info]
Title: Generated Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 0
YCbCr Matrix: None

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${effectiveFontFamily},${fontSize},${textColor},${textColor},${outlineColor},${backColour},1,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${marginL},${marginR},${marginV},0
Style: Highlight,${effectiveFontFamily},${fontSize},${highlightColor},${highlightColor},${outlineColor},${backColour},1,0,0,0,${highlightScale},${highlightScale},0,0,${borderStyle},${outline},${shadow},${alignment},${marginL},${marginR},${marginV},0
Style: IntroTitle,${effectiveFontFamily},${introFontSize},&H00000000,&H00000000,&H00000000,&H00FFFFFF,0,0,0,0,100,100,0,0,3,${Math.round(2 * scaleFactor)},0,8,${Math.round(20 * scaleFactor)},${Math.round(20 * scaleFactor)},${introMarginV},0
Style: EmojiOverlay,Noto Color Emoji,${emojiFontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,0,0,0,5,20,20,${emojiMarginV},0
Style: Glow,${effectiveFontFamily},${fontSize},${glowColor},${glowColor},${glowColor},&H00000000,1,0,0,0,100,100,0,0,1,${Math.round(glowIntensity * scaleFactor)},0,${alignment},${marginL},${marginR},${marginV},0
`;

    ass += `
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Add intro title for first 3 seconds if provided
    // NOTE: if introTitle contains emoji, it is skipped here and rendered as PNG overlay instead
    if (introTitle && !ClipGeneratorService.hasEmoji(introTitle)) {
      // Scale up + fade in from top, then fade out
      // {\fad(400,500)} = 400ms fade in, 500ms fade out
      // {\fscx80\fscy80\t(0,300,\fscx100\fscy100)} = start at 80% scale, animate to 100% in 300ms
      ass += `Dialogue: 2,0:00:00.00,0:00:03.00,IntroTitle,,0,0,0,,{\\b600\\fad(400,500)\\fscx80\\fscy80\\t(0,300,\\fscx100\\fscy100)}${this.renderTextWithEmojiFont(introTitle, fontFamily)}\n`;
    }

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

    // Add text overlays - each gets its own named style so BorderStyle (box bg) works correctly
    // NOTE: overlays with emoji are skipped here - they are rendered as PNG and composited via FFmpeg overlay
    if (textOverlays && textOverlays.length > 0) {
      const DESIGN_HEIGHT = 700;
      const overlayScaleFactor = height / DESIGN_HEIGHT;

      // Build per-overlay styles and inject them into the [V4+ Styles] section
      // We append them before [Events] by inserting into the ass string
      const overlayStyleLines: string[] = [];

      for (let oi = 0; oi < textOverlays.length; oi++) {
        const overlay = textOverlays[oi];
        // Skip emoji overlays - they are rendered as PNG and composited via FFmpeg overlay
        if (ClipGeneratorService.hasEmoji(overlay.text)) continue;
        const oFontSize = Math.round((overlay.fontSize || 32) * overlayScaleFactor);
        const oColor = this.hexToASSColor(overlay.color || "#FFFFFF");
        const oBgColor = (overlay.backgroundColor || "#000000").replace("#", "");
        const oBgOpacity = overlay.backgroundOpacity ?? 0;
        // ASS alpha: 00 = fully opaque, FF = fully transparent
        const oAssAlpha = Math.round(((100 - oBgOpacity) / 100) * 255).toString(16).toUpperCase().padStart(2, "0");
        const oBgR = oBgColor.substring(0, 2);
        const oBgG = oBgColor.substring(2, 4);
        const oBgB = oBgColor.substring(4, 6);
        const oBackColour = `&H${oAssAlpha}${oBgB}${oBgG}${oBgR}`;
        // BorderStyle 3 = opaque box behind text; 1 = outline only
        const oBorderStyle = oBgOpacity > 0 ? 3 : 1;
        const oOutline = oBorderStyle === 3 ? Math.round(2 * overlayScaleFactor) : 1;
        const oFontFamily = overlay.fontFamily || "Inter";
        const styleName = `TextOverlay${oi}`;

        // Style: centered alignment (5 = \an5), zero margins (position via \pos)
        overlayStyleLines.push(
          `Style: ${styleName},${oFontFamily},${oFontSize},${oColor},${oColor},&H00000000,${oBackColour},1,0,0,0,100,100,0,0,${oBorderStyle},${oOutline},0,5,0,0,0,1`
        );
      }

      // Insert overlay styles before [Events] section
      // The header uses ass += `\n[Events]\n...` so the actual separator is \n\n[Events]\n
      ass = ass.replace(
        "\n\n[Events]\n",
        `\n${overlayStyleLines.join("\n")}\n\n[Events]\n`
      );

      // Now add dialogue lines for each overlay
      for (let oi = 0; oi < textOverlays.length; oi++) {
        const overlay = textOverlays[oi];
        // Skip emoji overlays - handled via FFmpeg PNG overlay
        if (ClipGeneratorService.hasEmoji(overlay.text)) continue;
        const oX = Math.round((overlay.x / 100) * width);
        const oY = Math.round((overlay.y / 100) * height);
        const startTime = this.formatASSTime(overlay.startTime);
        const endTime = this.formatASSTime(overlay.endTime);
        const styleName = `TextOverlay${oi}`;

        // Animation override tags (optional)
        let animTags = "";
        if (overlay.animation === "fade-in") {
          animTags = "\\fad(400,200)";
        } else if (overlay.animation === "slide-up") {
          const slideFrom = oY + Math.round(height * 0.05);
          animTags = `\\fad(300,200)\\move(${oX},${slideFrom},${oX},${oY},0,300)`;
        } else if (overlay.animation === "typewriter") {
          animTags = "\\fad(100,200)";
        }

        // Render text with emoji font switching so emojis don't show as "NO GLYPH"
        const renderedText = this.renderTextWithEmojiFont(overlay.text, overlay.fontFamily || "Inter");

        // \an5 = center anchor, \pos(x,y) = absolute position
        ass += `Dialogue: 3,${startTime},${endTime},${styleName},,0,0,0,,{\\an5\\pos(${oX},${oY})${animTags ? animTags : ""}}${renderedText}\n`;
      }
    }

    this.logOperation("ASS_CONTENT_SUMMARY", {
      wordCount: words.length,
      lineCount: lines.length,
      animation: style?.animation || "none",
      hasIntroTitle: !!introTitle,
      hasEmojis: !!emojis,
      textOverlayCount: textOverlays?.length || 0,
      totalLength: ass.length,
    });

    return ass;
  }

  /**
   * Returns true if the text contains any emoji characters.
   */
  static hasEmoji(text: string): boolean {
    return /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u.test(text);
  }

  /**
   * Strip emoji characters from text before ASS rendering.
   * libass/fontconfig cannot render color emoji (CBDT/SBIX fonts not supported),
   * so we remove them to prevent "NO GLYPH" boxes in exported video.
   */
  private static renderTextWithEmojiFont(text: string, _regularFont: string): string {
    return text
      .replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?(\u200D(\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?)*/gu, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  /**
   * Render a text overlay containing emoji as a PNG image using Python + PIL.
   * Apple Color Emoji font handles both emoji and regular text.
   * Returns the path to the generated PNG (caller must clean up).
   */
  static async renderEmojiOverlayAsPng(
    text: string,
    fontSize: number,
    color: string,
    backgroundColor: string,
    backgroundOpacity: number,
    videoWidth: number,
    videoHeight: number,
    maxWidthPct: number = 80
  ): Promise<string> {
    const outPath = path.join(os.tmpdir(), `emoji-overlay-${nanoid()}.png`);
    const maxWidthPx = Math.round((maxWidthPct / 100) * videoWidth);

    // Convert hex color to RGB tuple
    const hexToRgb = (hex: string) => {
      const c = hex.replace("#", "");
      return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
    };
    const [r, g, b] = hexToRgb(color);
    const [br, bg, bb] = hexToRgb(backgroundColor);
    const bgAlpha = Math.round((backgroundOpacity / 100) * 255);

    // Scale font size from design space (700px) to actual video height
    const scaledFontSize = Math.round(fontSize * (videoHeight / 700));
    // Apple Color Emoji only supports specific bitmap sizes - snap to nearest valid size
    const EMOJI_VALID_SIZES = [20, 26, 32, 40, 48, 52, 64, 96, 160];
    const clampedFontSize = EMOJI_VALID_SIZES.reduce((prev, curr) =>
      Math.abs(curr - scaledFontSize) < Math.abs(prev - scaledFontSize) ? curr : prev
    );

    // Pass text via a temp file to avoid shell escaping issues with emoji/special chars
    const textInputPath = path.join(os.tmpdir(), `emoji-text-${nanoid()}.txt`);
    await fs.promises.writeFile(textInputPath, text, "utf8");

    const pythonScript = `
import sys, re, os
from PIL import Image, ImageDraw, ImageFont

# Read text from file to avoid escaping issues
with open(${JSON.stringify(textInputPath)}, "r", encoding="utf-8") as f:
    text = f.read().strip()

font_size = ${clampedFontSize}
max_width = ${maxWidthPx}
text_color = (${r}, ${g}, ${b}, 255)
bg_color = (${br}, ${bg}, ${bb}, ${bgAlpha})

# Apple Color Emoji only supports specific bitmap sizes
VALID_SIZES = [20, 26, 32, 40, 48, 52, 64, 96, 160]
def snap_size(s):
    return min(VALID_SIZES, key=lambda x: abs(x - s))

emoji_font_paths = [
    "/System/Library/Fonts/Apple Color Emoji.ttc",
    "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
]
text_font_paths = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-SemiBold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]

emoji_sz = snap_size(font_size)
emoji_font = None
for fp in emoji_font_paths:
    if os.path.exists(fp):
        try:
            emoji_font = ImageFont.truetype(fp, emoji_sz)
            break
        except:
            pass

text_font = None
for fp in text_font_paths:
    if os.path.exists(fp):
        try:
            text_font = ImageFont.truetype(fp, font_size)
            break
        except:
            pass
if text_font is None:
    text_font = ImageFont.load_default()
if emoji_font is None:
    emoji_font = text_font

# Split text into segments: (text_chunk, is_emoji)
EMOJI_RE = re.compile(r'([\U00010000-\U0010ffff]|[\u2600-\u27BF]|\u00a9|\u00ae|[\u2000-\u3300]|\uFE0F|\u20D0-\u20FF)', re.UNICODE)
def split_segments(s):
    # Split into runs of emoji vs non-emoji characters
    segs = []
    buf = ""
    is_em = False
    for ch in s:
        cp = ord(ch)
        # Emoji: Supplementary Multilingual Plane chars + common symbol ranges
        ch_is_emoji = (cp >= 0x1F000) or (0x2600 <= cp <= 0x27BF) or cp in (0x00A9, 0x00AE) or (0x2000 <= cp <= 0x3300) or cp == 0xFE0F
        if ch_is_emoji != is_em:
            if buf:
                segs.append((buf, is_em))
            buf = ch
            is_em = ch_is_emoji
        else:
            buf += ch
    if buf:
        segs.append((buf, is_em))
    return segs

def seg_font(is_emoji):
    return emoji_font if is_emoji else text_font

def measure_segments(segs):
    dummy = Image.new("RGBA", (1, 1))
    draw = ImageDraw.Draw(dummy)
    total_w = 0
    max_h = 0
    for (chunk, is_em) in segs:
        f = seg_font(is_em)
        bb = draw.textbbox((0, 0), chunk, font=f, embedded_color=True)
        total_w += bb[2] - bb[0]
        max_h = max(max_h, bb[3] - bb[1])
    return total_w, max_h

def measure_text(s, is_emoji=False):
    dummy = Image.new("RGBA", (1, 1))
    draw = ImageDraw.Draw(dummy)
    f = seg_font(is_emoji)
    bb = draw.textbbox((0, 0), s, font=f, embedded_color=True)
    return bb[2] - bb[0], bb[3] - bb[1]

# Word-wrap: split into words preserving which are emoji
words = text.split(" ")
lines = []
current_words = []

for word in words:
    test_words = current_words + [word]
    test_line = " ".join(test_words)
    segs = split_segments(test_line)
    w, _ = measure_segments(segs)
    if w <= max_width or not current_words:
        current_words = test_words
    else:
        lines.append(" ".join(current_words))
        current_words = [word]
if current_words:
    lines.append(" ".join(current_words))

# Measure all lines
line_sizes = []
for line in lines:
    segs = split_segments(line)
    w, h = measure_segments(segs)
    line_sizes.append((w, h))

padding = max(8, font_size // 4)
max_line_w = max(s[0] for s in line_sizes) if line_sizes else 0
total_w = min(max_line_w + padding * 2, max_width + padding * 2)
line_gap = max(4, font_size // 8)
total_h = sum(s[1] for s in line_sizes) + line_gap * max(0, len(lines) - 1) + padding * 2

img = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

border_radius = max(4, font_size // 6)
if bg_color[3] > 0:
    draw.rounded_rectangle([0, 0, total_w - 1, total_h - 1], radius=min(border_radius, total_w // 2, total_h // 2), fill=bg_color)

y = padding
for i, line in enumerate(lines):
    lw, lh = line_sizes[i]
    x = (total_w - lw) // 2
    segs = split_segments(line)
    cx = x
    for (chunk, is_em) in segs:
        f = seg_font(is_em)
        draw.text((cx, y), chunk, font=f, fill=text_color, embedded_color=True)
        cw, _ = measure_text(chunk, is_em)
        cx += cw
    y += lh + line_gap

img.save(${JSON.stringify(outPath)})
# Clean up text input file
try:
    os.remove(${JSON.stringify(textInputPath)})
except:
    pass
print(f"OK:{total_w}x{total_h}")
`;

    return new Promise((resolve, reject) => {
      const proc = spawn("python3", ["-c", pythonScript]);
      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (d) => { stdout += d.toString(); });
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        // Clean up text input file on error (success path cleans it in Python)
        if (code !== 0) {
          fs.promises.unlink(textInputPath).catch(() => {});
          reject(new Error(`Python emoji render failed (code ${code}): ${stderr.slice(-500)}`));
        } else if (stdout.startsWith("OK:")) {
          this.logOperation("EMOJI_PNG_RENDERED", { path: outPath, size: stdout.trim() });
          resolve(outPath);
        } else {
          fs.promises.unlink(textInputPath).catch(() => {});
          reject(new Error(`Python emoji render unexpected output: ${stdout} | ${stderr.slice(-300)}`));
        }
      });
      proc.on("error", (err) => {
        fs.promises.unlink(textInputPath).catch(() => {});
        reject(new Error(`Failed to spawn python3: ${err.message}`));
      });
    });
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
    emojis?: string,
    textOverlays?: ClipGenerationOptions["textOverlays"]
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

      // Step 2: Generate ASS subtitles if captions, intro title, emojis, or text overlays provided
      if (captions?.words?.length || introTitle || emojis || textOverlays?.length) {
        const assContent = this.generateASSSubtitles(
          captions?.words || [],
          captions?.style,
          width,
          height,
          introTitle,
          emojis,
          textOverlays
        );
        await fs.promises.writeFile(tempSubsPath, assContent, "utf8");
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

      // Validate output - an MP4 with only headers (~1-2KB) means no frames were encoded
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
   * Public wrapper for downloading a YouTube segment to a local file.
   * Used by video.worker.ts to pre-download a shared spanning segment.
   */
  static async downloadYouTubeSegmentToLocalFile(
    url: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    quality: VideoQuality = "1080p"
  ): Promise<void> {
    return this.downloadYouTubeSegmentToFile(url, startTime, endTime, outputPath, quality);
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
    maxRetries: number = 4
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
        const isBotBlocked = lastError.message.includes("Sign in") ||
                              lastError.message.includes("not a bot") ||
                              lastError.message.includes("cookies");
        const isRetryableError = isCode222 || isBotBlocked ||
                                  lastError.message.includes("ffmpeg exited with code 202") ||
                                  lastError.message.includes("ffmpeg exited with code 1") ||
                                  lastError.message.includes("Interrupted by user") ||
                                  lastError.message.includes("yt-dlp failed with code 1");

        if (isRetryableError && attempt < maxRetries) {
          // code 222 is caused by --force-keyframes-at-cuts on certain streams - disable it on retry
          if (isCode222) forceKeyframes = false;

          // Bot-blocked needs a longer cooldown so YouTube unblocks the IP
          // Use exponential backoff: 10s, 20s, 40s + jitter
          const isInterrupted = lastError.message.includes("Interrupted by user");
          const delayMs = isBotBlocked ? Math.pow(2, attempt) * 5000 + Math.random() * 5000
                        : isInterrupted ? 5000
                        : Math.pow(2, attempt) * 1000;
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
      const cookiesPath = process.env.YOUTUBE_COOKIES_PATH
        || (fs.existsSync("./config/youtube_cookies_local.txt") ? "./config/youtube_cookies_local.txt" : undefined)
        || (fs.existsSync("./config/youtube_cookies.txt") ? "./config/youtube_cookies.txt" : undefined);
      const bgutilBaseUrl = process.env.YT_DLP_GET_POT_BGUTIL_BASE_URL;

      const args = [
        "-f", formatSelector,
        "--download-sections", downloadSection,
        ...(forceKeyframes ? ["--force-keyframes-at-cuts"] : []),
        "--merge-output-format", "mp4",
        "-o", outputPath,
        "--no-playlist",
        "--newline",
        "--no-warnings",
        "--no-post-overwrites",
        "--js-runtimes", "deno",
        "--extractor-args", "youtube:player_client=android_vr,web,android",
        "--extractor-retries", "3",
        "--fragment-retries", "5",
        "--retry-sleep", "2",
        url,
      ];

      // Add bgutil POT provider if server is running (critical for bot bypass on datacenter IPs)
      if (bgutilBaseUrl) {
        args.splice(args.indexOf("--extractor-retries"), 0,
          "--extractor-args", `youtubepot-bgutilhttp:base_url=${bgutilBaseUrl}`
        );
        this.logOperation("YT_DLP_USING_POT", { baseUrl: bgutilBaseUrl });
      }

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
      let lastActivity = Date.now();
      const ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes with no output = stuck

      // Periodic file-size check so we know the download is progressing
      let lastLoggedSize = 0;
      const sizeCheckInterval = setInterval(() => {
        try {
          // Check for partial files (yt-dlp uses .part extension during download)
          const partPath = `${outputPath}.part`;
          const checkPath = fs.existsSync(partPath) ? partPath : (fs.existsSync(outputPath) ? outputPath : null);
          if (checkPath) {
            const size = fs.statSync(checkPath).size;
            if (size !== lastLoggedSize) {
              lastLoggedSize = size;
              lastActivity = Date.now();
              console.log(`[CLIP GENERATOR] YT_DLP_PROGRESS: ${(size / 1024 / 1024).toFixed(1)} MB downloaded`);
            }
          }
          // Check for activity timeout
          if (Date.now() - lastActivity > ACTIVITY_TIMEOUT_MS) {
            console.error(`[CLIP GENERATOR] YT_DLP_TIMEOUT: No activity for ${ACTIVITY_TIMEOUT_MS / 1000}s, killing process`);
            ytdlpProcess.kill("SIGTERM");
          }
        } catch { /* ignore stat errors */ }
      }, 10_000); // check every 10 seconds

      ytdlpProcess.stdout?.on("data", (data) => {
        lastActivity = Date.now();
        // Log progress lines from yt-dlp (when not --quiet)
        const line = data.toString().trim();
        if (line && line.includes("%")) {
          console.log(`[CLIP GENERATOR] YT_DLP: ${line}`);
        }
      });

      ytdlpProcess.stderr?.on("data", (data) => {
        lastActivity = Date.now();
        stderr += data.toString();
      });

      ytdlpProcess.on("error", (err) => {
        clearInterval(sizeCheckInterval);
        reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Make sure yt-dlp is installed.`));
      });

      ytdlpProcess.on("close", (code) => {
        clearInterval(sizeCheckInterval);
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
    emojis?: string,
    textOverlays?: ClipGenerationOptions["textOverlays"]
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

    // Generate ASS subtitles if captions, intro title, emojis, or text overlays provided
    let subsPathToUse: string | undefined;
    if (captions?.words?.length || introTitle || emojis || textOverlays?.length) {
      const assContent = this.generateASSSubtitles(
        captions?.words || [],
        captions?.style,
        width,
        height,
        introTitle,
        emojis,
        textOverlays
      );
      await fs.promises.writeFile(tempSubsPath, assContent, "utf8");
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
          let filterComplex = this.buildBlurBackgroundFilter(width, height, 1.25);

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
            "-g", "48",
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

          // Validate output - an MP4 with only headers (~1-2KB) means no frames were encoded
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
        "-c", "copy", // Stream copy - no re-encoding, just extract the segment
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
    quality: VideoQuality = "1080p",
    emojiOverlays?: EmojiOverlayPng[]
  ): Promise<void> {
    const wmConfig = watermark
      ? this.getWatermarkFilterConfig(targetWidth, targetHeight, await this.getWatermarkLogoPath())
      : null;

    const { preset, crf } = getEncodingParams(quality);
    const topHeight = Math.round(targetHeight * (splitRatio / 100));
    const bottomHeight = targetHeight - topHeight;
    const bgArgs = SplitScreenCompositorService.getBackgroundInputArgs(clipDuration, backgroundDuration);
    const hasEmojiOverlays = emojiOverlays && emojiOverlays.length > 0;

    // Build single filter_complex: scale both inputs → vstack → optional subs → optional watermark → optional emoji overlays
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

    // Append watermark or finalize to base_out label for emoji compositing
    if (wmConfig) {
      filterComplex = `${filterComplex}[pre_wm];${wmConfig.filterFragment},format=yuv420p[base_out]`;
    } else {
      filterComplex = `${filterComplex},format=yuv420p[base_out]`;
    }

    // Composite emoji overlay PNGs on top (same pattern as convertAspectRatioFile)
    const extraEmojiInputs: string[] = [];
    if (hasEmojiOverlays) {
      // Input indices: 0=main video, 1=background video, 2=watermark logo (if present), then emoji PNGs
      const baseIdx = wmConfig ? 3 : 2;
      let prevLabel = "[base_out]";
      for (let ei = 0; ei < emojiOverlays!.length; ei++) {
        const eo = emojiOverlays![ei];
        extraEmojiInputs.push("-i", eo.pngPath);
        const inputIdx = baseIdx + ei;
        const nextLabel = ei === emojiOverlays!.length - 1 ? "[outv]" : `[ov${ei}]`;
        filterComplex += `;[${inputIdx}:v]format=rgba[emoji${ei}];${prevLabel}[emoji${ei}]overlay=${eo.x}-w/2:${eo.y}-h/2:enable='between(t,${eo.startTime},${eo.endTime})'${nextLabel}`;
        prevLabel = nextLabel;
      }
    } else {
      // No emoji overlays - rename base_out to outv
      filterComplex = filterComplex.replace("[base_out]", "[outv]");
    }

    const args = [
      // Input 0: main video
      "-i", mainVideoPath,
      // Input 1: background video (with loop/offset args)
      ...bgArgs.inputArgs,
      "-i", backgroundVideoPath,
      // Watermark logo input (if any)
      ...(wmConfig ? wmConfig.extraInputArgs : []),
      // Emoji overlay PNG inputs
      ...extraEmojiInputs,
      // Filter
      "-filter_complex", filterComplex,
      "-map", "[outv]",
      "-map", "0:a?",
      // Encoding
      "-c:v", "libx264",
      "-preset", preset,
      "-crf", crf,
      "-g", "48",
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
      hasEmojiOverlays: !!hasEmojiOverlays,
      emojiOverlayCount: emojiOverlays?.length ?? 0,
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
    backgroundStyle: "blur" | "black" | "white" | "gradient-ocean" | "gradient-midnight" | "gradient-sunset" | "mirror" | "zoom" = "black",
    emojiOverlays?: EmojiOverlayPng[],
    alreadyConverted = false,
    videoScale = 125
  ): Promise<void> {
    const wmConfig = watermark
      ? this.getWatermarkFilterConfig(targetWidth, targetHeight, await this.getWatermarkLogoPath())
      : null;

    const { preset, crf } = getEncodingParams(quality);
    const hasEmojiOverlays = emojiOverlays && emojiOverlays.length > 0;

    return new Promise((resolve, reject) => {
      const targetAspect = targetWidth / targetHeight;
      const isVertical = targetAspect < 1;

      let args: string[];

      if (alreadyConverted) {
        // Input is already the correct dimensions (reframed by smart crop).
        // Just burn subtitles/watermark/emoji without re-doing aspect ratio conversion.
        let vf = `scale=${targetWidth}:${targetHeight}:flags=lanczos,format=yuv420p`;
        if (subtitlesPath) {
          const escapedPath = subtitlesPath.replace(/\\/g, "/").replace(/:/g, "\\:");
          const escapedFontsDir = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");
          vf += `,ass=${escapedPath}:fontsdir=${escapedFontsDir}`;
        }
        const { preset, crf } = getEncodingParams(quality);
        args = [
          "-i", inputPath,
          ...(wmConfig ? wmConfig.extraInputArgs : []),
          "-vf", vf,
          "-map", "0:v", "-map", "0:a?",
          "-c:v", "libx264", "-preset", preset, "-crf", crf, "-g", "48",
          "-profile:v", "high", "-level", "4.0",
          "-c:a", "aac", "-b:a", "192k",
          "-movflags", "+faststart", "-y", outputPath,
        ];
      } else if (isVertical) {
        // Use background filter based on style (complex filter graph)
        // buildBackgroundFilter returns a filter chain ending with the scaled/composited video (no label)
        let filterComplex = this.buildBackgroundFilter(targetWidth, targetHeight, backgroundStyle, videoScale);

        // Add subtitles to the final output if provided
        if (subtitlesPath) {
          const escapedPath = subtitlesPath
            .replace(/\\/g, "/")
            .replace(/:/g, "\\:");
          const escapedFontsDir = FONTS_DIR.replace(/\\/g, "/").replace(/:/g, "\\:");
          filterComplex = `${filterComplex},ass=${escapedPath}:fontsdir=${escapedFontsDir}`;
        }

        // Label the video stream before watermark/emoji compositing
        if (wmConfig) {
          filterComplex = `${filterComplex}[pre_wm];${wmConfig.filterFragment},format=yuv420p[base_out]`;
        } else {
          filterComplex = `${filterComplex},format=yuv420p[base_out]`;
        }

        // Composite emoji overlay PNGs on top
        const extraEmojiInputs: string[] = [];
        if (hasEmojiOverlays) {
          // watermark logo is input index 1 (if present), emoji PNGs start after
          const baseIdx = wmConfig ? 2 : 1;
          let prevLabel = "[base_out]";
          for (let ei = 0; ei < emojiOverlays!.length; ei++) {
            const eo = emojiOverlays![ei];
            extraEmojiInputs.push("-i", eo.pngPath);
            const inputIdx = baseIdx + ei;
            const nextLabel = ei === emojiOverlays!.length - 1 ? "[outv]" : `[ov${ei}]`;
            filterComplex += `;[${inputIdx}:v]format=rgba[emoji${ei}];${prevLabel}[emoji${ei}]overlay=${eo.x}-w/2:${eo.y}-h/2:enable='between(t,${eo.startTime},${eo.endTime})'${nextLabel}`;
            prevLabel = nextLabel;
          }
        } else {
          // No emoji overlays - rename base_out to outv
          filterComplex = filterComplex.replace("[base_out]", "[outv]");
        }

        args = [
          "-i", inputPath,
          ...(wmConfig ? wmConfig.extraInputArgs : []),
          ...extraEmojiInputs,
          "-filter_complex", filterComplex,
          "-map", "[outv]",
          "-map", "0:a?",
          "-c:v", "libx264",
          "-preset", preset,
          "-crf", crf,
          "-g", "48",
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

        if (wmConfig || hasEmojiOverlays) {
          // Need filter_complex for second input (watermark logo) or emoji overlays
          let filterComplex = wmConfig
            ? `[0:v]${videoFilter}[pre_wm];${wmConfig.filterFragment},format=yuv420p[base_out]`
            : `[0:v]${videoFilter},format=yuv420p[base_out]`;

          const extraEmojiInputs: string[] = [];
          if (hasEmojiOverlays) {
            const baseIdx = wmConfig ? 2 : 1;
            let prevLabel = "[base_out]";
            for (let ei = 0; ei < emojiOverlays!.length; ei++) {
              const eo = emojiOverlays![ei];
              extraEmojiInputs.push("-i", eo.pngPath);
              const inputIdx = baseIdx + ei;
              const nextLabel = ei === emojiOverlays!.length - 1 ? "[outv]" : `[ov${ei}]`;
              filterComplex += `;[${inputIdx}:v]format=rgba[emoji${ei}];${prevLabel}[emoji${ei}]overlay=${eo.x}-w/2:${eo.y}-h/2:enable='between(t,${eo.startTime},${eo.endTime})'${nextLabel}`;
              prevLabel = nextLabel;
            }
          } else {
            filterComplex = filterComplex.replace("[base_out]", "[outv]");
          }

          args = [
            "-i", inputPath,
            ...(wmConfig ? wmConfig.extraInputArgs : []),
            ...extraEmojiInputs,
            "-filter_complex", filterComplex,
            "-map", "[outv]",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", preset,
            "-crf", crf,
            "-g", "48",
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
            "-g", "48",
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
      return this.buildBlurBackgroundFilter(targetWidth, targetHeight, 1.25);
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
  private static buildBlurBackgroundFilter(targetWidth: number, targetHeight: number, fgScale: number): string {
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
      // Foreground: scale to fgScale width for a zoomed-in look, sides cropped by overlay boundary
      `[fg]scale=${Math.round(targetWidth * fgScale)}:-2,setsar=1[fg_scaled];` +
      // Overlay foreground centered on blurred background
      `[bg_blur][fg_scaled]overlay=(W-w)/2:(H-h)/2,setsar=1`;
  }

  /**
   * Build a solid color background filter for vertical clips
   */
  private static buildSolidBackgroundFilter(targetWidth: number, targetHeight: number, color: string, fgScale: number): string {
    return `color=c=${color}:s=${targetWidth}x${targetHeight}[bg_solid];` +
      `[0:v]scale=${Math.round(targetWidth * fgScale)}:-2,setsar=1[fg_scaled];` +
      `[bg_solid][fg_scaled]overlay=(W-w)/2:(H-h)/2:eof_action=endall,setsar=1`;
  }

  /**
   * Build a gradient background filter for vertical clips
   * Uses two solid colors blended vertically
   */
  private static buildGradientBackgroundFilter(targetWidth: number, targetHeight: number, topColor: string, bottomColor: string, fgScale: number): string {
    return `color=c=${topColor}:s=${targetWidth}x${targetHeight}[c1];` +
      `color=c=${bottomColor}:s=${targetWidth}x${targetHeight}[c2];` +
      `[c1][c2]blend=all_expr='A*(1-Y/H)+B*(Y/H)'[bg_grad];` +
      `[0:v]scale=${Math.round(targetWidth * fgScale)}:-2,setsar=1[fg_scaled];` +
      `[bg_grad][fg_scaled]overlay=(W-w)/2:(H-h)/2:eof_action=endall,setsar=1`;
  }

  /**
   * Build a mirror background filter for vertical clips
   * Flips the video vertically for top and bottom bars
   */
  private static buildMirrorBackgroundFilter(targetWidth: number, targetHeight: number, fgScale: number): string {
    const halfHeight = Math.round(targetHeight / 2);
    return `[0:v]split=3[bg_top][bg_bot][fg];` +
      `[bg_top]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,` +
      `crop=${targetWidth}:${halfHeight}:(iw-${targetWidth})/2:0,vflip[top_mirror];` +
      `[bg_bot]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,` +
      `crop=${targetWidth}:${halfHeight}:(iw-${targetWidth})/2:ih-${halfHeight},vflip[bot_mirror];` +
      `[top_mirror][bot_mirror]vstack[bg_full];` +
      `[fg]scale=${Math.round(targetWidth * fgScale)}:-2,setsar=1[fg_scaled];` +
      `[bg_full][fg_scaled]overlay=(W-w)/2:(H-h)/2,setsar=1`;
  }

  /**
   * Build a zoom background filter for vertical clips
   * Uses a zoomed-in, slightly darkened version of the video as background (no blur)
   */
  private static buildZoomBackgroundFilter(targetWidth: number, targetHeight: number, fgScale: number): string {
    return `[0:v]split=2[bg][fg];` +
      `[bg]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,` +
      `crop=${targetWidth}:${targetHeight},` +
      `eq=brightness=-0.15[bg_zoom];` +
      `[fg]scale=${Math.round(targetWidth * fgScale)}:-2,setsar=1[fg_scaled];` +
      `[bg_zoom][fg_scaled]overlay=(W-w)/2:(H-h)/2,setsar=1`;
  }

  /**
   * Dispatcher: pick the right background filter based on style
   */
  private static buildBackgroundFilter(targetWidth: number, targetHeight: number, style: "blur" | "black" | "white" | "gradient-ocean" | "gradient-midnight" | "gradient-sunset" | "mirror" | "zoom" = "blur", videoScale = 125): string {
    const fgScale = videoScale / 100;
    switch (style) {
      case "black":
        return this.buildSolidBackgroundFilter(targetWidth, targetHeight, "black", fgScale);
      case "white":
        return this.buildSolidBackgroundFilter(targetWidth, targetHeight, "white", fgScale);
      case "gradient-ocean":
        return this.buildGradientBackgroundFilter(targetWidth, targetHeight, "0x1CB5E0", "0x000851", fgScale);
      case "gradient-midnight":
        return this.buildGradientBackgroundFilter(targetWidth, targetHeight, "0x4b6cb7", "0x182848", fgScale);
      case "gradient-sunset":
        return this.buildGradientBackgroundFilter(targetWidth, targetHeight, "0xFF512F", "0xF09819", fgScale);
      case "mirror":
        return this.buildMirrorBackgroundFilter(targetWidth, targetHeight, fgScale);
      case "zoom":
        return this.buildZoomBackgroundFilter(targetWidth, targetHeight, fgScale);
      case "blur":
      default:
        return this.buildBlurBackgroundFilter(targetWidth, targetHeight, fgScale);
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
   * Extract a single JPEG frame from a local video file at the given offset.
   * Much faster than downloading from R2 - used right after clip generation.
   */
  private static async extractThumbnailFromFile(
    videoPath: string,
    width: number,
    height: number,
    offsetSeconds: number = 1
  ): Promise<Buffer> {
    const tempThumbPath = videoPath.replace(/\.\w+$/, "-thumb.jpg");
    return new Promise((resolve, reject) => {
      const args = [
        "-nostdin", "-y",
        "-i", videoPath,
        "-ss", String(offsetSeconds),
        "-frames:v", "1",
        "-update", "1",
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        "-q:v", "2",
        tempThumbPath,
      ];
      const proc = spawn("ffmpeg", args);
      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      proc.on("error", (err) => reject(new Error(`FFmpeg thumbnail spawn failed: ${err.message}`)));
      proc.on("close", async (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg thumbnail failed (code ${code}): ${stderr.slice(-500)}`));
          return;
        }
        try {
          const buf = await fs.promises.readFile(tempThumbPath);
          await fs.promises.unlink(tempThumbPath).catch(() => {});
          if (buf.length < 100) {
            reject(new Error(`FFmpeg thumbnail produced empty output (${buf.length} bytes). stderr: ${stderr.slice(-500)}`));
            return;
          }
          resolve(buf);
        } catch (readErr) {
          reject(new Error(`Failed to read thumbnail file: ${readErr}`));
        }
      });
    });
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
    const tempThumbPath = path.join(os.tmpdir(), `thumb-${nanoid()}.jpg`);

    return new Promise((resolve, reject) => {
      const args = [
        "-nostdin", "-y",
        "-i", clipUrl,
        "-frames:v", "1",
        "-update", "1",
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        "-q:v", "2",
        tempThumbPath,
      ];

      this.logOperation("FFMPEG_THUMBNAIL", { args: args.join(" ") });

      const ffmpegProcess = spawn("ffmpeg", args);
      let stderr = "";

      ffmpegProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpegProcess.on("error", (err) => {
        reject(new Error(`Failed to spawn FFmpeg for thumbnail: ${err.message}`));
      });

      ffmpegProcess.on("close", async (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg thumbnail failed with code ${code}: ${stderr.slice(-500)}`));
          return;
        }

        try {
          const thumbnailBuffer = await fs.promises.readFile(tempThumbPath);
          await fs.promises.unlink(tempThumbPath).catch(() => {});
          
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
