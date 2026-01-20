/**
 * Clip Generator Service
 * Handles video segment extraction and aspect ratio conversion using FFmpeg and yt-dlp
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { spawn } from "child_process";
import { PassThrough, Readable } from "stream";
import { R2Service } from "./r2.service";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { nanoid } from "nanoid";

export type AspectRatio = "9:16" | "1:1" | "16:9";
export type VideoQuality = "720p" | "1080p" | "4k";

export interface ClipGenerationOptions {
  videoId: string;
  clipId: string;
  sourceType: "youtube" | "upload";
  sourceUrl?: string;
  storageKey?: string;
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
}

export interface GeneratedClip {
  storageKey: string;
  storageUrl: string;
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
    "4k": 2160,
  };

  const baseSize = qualityMap[quality];

  switch (aspectRatio) {
    case "9:16": // Vertical (TikTok, Reels, Shorts)
      return { width: Math.round(baseSize * (9 / 16)), height: baseSize };
    case "1:1": // Square (Instagram feed)
      return { width: baseSize, height: baseSize };
    case "16:9": // Horizontal (YouTube)
      return { width: Math.round(baseSize * (16 / 9)), height: baseSize };
    default:
      return { width: 1920, height: 1080 };
  }
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
   * Generate a clip from a video source
   * Validates: Requirements 7.1, 7.3
   */
  static async generateClip(options: ClipGenerationOptions): Promise<GeneratedClip> {
    this.logOperation("GENERATE_CLIP", {
      clipId: options.clipId,
      sourceType: options.sourceType,
      aspectRatio: options.aspectRatio,
      quality: options.quality,
      startTime: options.startTime,
      endTime: options.endTime,
    });

    const { width, height } = getOutputDimensions(options.aspectRatio, options.quality);
    const duration = options.endTime - options.startTime;

    // Generate storage key for the clip
    const storageKey = `clips/${options.videoId}/${options.clipId}-${options.aspectRatio.replace(":", "x")}.mp4`;

    let clipBuffer: Buffer;

    if (options.sourceType === "youtube" && options.sourceUrl) {
      // Download segment from YouTube using yt-dlp
      clipBuffer = await this.downloadYouTubeSegment(
        options.sourceUrl,
        options.startTime,
        options.endTime,
        options.aspectRatio,
        options.quality
      );
    } else if (options.sourceType === "upload" && options.storageKey) {
      // Extract segment from uploaded file
      clipBuffer = await this.extractSegmentFromFile(
        options.storageKey,
        options.startTime,
        options.endTime,
        options.aspectRatio,
        options.quality
      );
    } else {
      throw new Error("Invalid source configuration: missing sourceUrl or storageKey");
    }

    // Upload to R2
    this.logOperation("UPLOADING_CLIP", { storageKey, size: clipBuffer.length });
    const { url: storageUrl } = await R2Service.uploadFile(
      storageKey,
      clipBuffer,
      "video/mp4"
    );

    return {
      storageKey,
      storageUrl,
      duration,
      width,
      height,
      fileSize: clipBuffer.length,
    };
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
    quality: VideoQuality
  ): Promise<Buffer> {
    this.logOperation("DOWNLOAD_YOUTUBE_SEGMENT", {
      url,
      startTime,
      endTime,
      aspectRatio,
      quality,
    });

    const { width, height } = getOutputDimensions(aspectRatio, quality);
    const tempDir = os.tmpdir();
    const tempId = nanoid();
    const tempVideoPath = path.join(tempDir, `yt-segment-${tempId}.mp4`);
    const tempOutputPath = path.join(tempDir, `clip-output-${tempId}.mp4`);

    try {
      // Step 1: Download the segment using yt-dlp with --download-sections
      await this.downloadYouTubeSegmentToFile(url, startTime, endTime, tempVideoPath, quality);

      // Step 2: Apply aspect ratio conversion using FFmpeg
      await this.convertAspectRatioFile(tempVideoPath, tempOutputPath, width, height);

      // Step 3: Read the output file
      const clipBuffer = await fs.promises.readFile(tempOutputPath);

      this.logOperation("YOUTUBE_SEGMENT_COMPLETE", {
        size: clipBuffer.length,
        duration: endTime - startTime,
      });

      return clipBuffer;
    } finally {
      // Cleanup temp files
      await this.cleanupTempFile(tempVideoPath);
      await this.cleanupTempFile(tempOutputPath);
    }
  }

  /**
   * Download YouTube segment to a file using yt-dlp --download-sections
   * Validates: Requirements 7.1, 7.2
   */
  private static async downloadYouTubeSegmentToFile(
    url: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    quality: VideoQuality
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Map quality to yt-dlp format selector
      // Download highest quality up to 1080p (Requirement 7.2)
      const formatSelector = quality === "4k"
        ? "bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]/best"
        : quality === "1080p"
        ? "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best"
        : "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best";

      const downloadSection = formatYtDlpTimestamp(startTime, endTime);

      const args = [
        "-f", formatSelector,
        "--download-sections", downloadSection,
        "--force-keyframes-at-cuts",
        "-o", outputPath,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        url,
      ];

      // Add cookies if available
      const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;
      if (cookiesPath) {
        args.unshift("--cookies", cookiesPath);
      }

      this.logOperation("YT_DLP_DOWNLOAD", { args: args.join(" ") });

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
    quality: VideoQuality
  ): Promise<Buffer> {
    this.logOperation("EXTRACT_SEGMENT_FROM_FILE", {
      storageKey,
      startTime,
      endTime,
      aspectRatio,
      quality,
    });

    const { width, height } = getOutputDimensions(aspectRatio, quality);
    const duration = endTime - startTime;

    // Get signed URL for the source video
    const videoUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);

    return new Promise((resolve, reject) => {
      // Build FFmpeg filter for center-crop aspect ratio conversion
      // Validates: Requirements 8.4
      const cropFilter = this.buildCenterCropFilter(width, height);

      const args = [
        "-ss", startTime.toString(),
        "-i", videoUrl,
        "-t", duration.toString(),
        "-vf", cropFilter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-f", "mp4",
        "-",
      ];

      this.logOperation("FFMPEG_EXTRACT", { args: args.join(" ") });

      const ffmpegProcess = spawn("ffmpeg", args);

      const chunks: Buffer[] = [];
      let stderr = "";

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
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}. Make sure FFmpeg is installed.`));
      });

      ffmpegProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
          return;
        }

        const buffer = Buffer.concat(chunks);
        this.logOperation("SEGMENT_EXTRACTED", { size: buffer.length });
        resolve(buffer);
      });
    });
  }

  /**
   * Convert aspect ratio of a video file using center-crop strategy
   * Validates: Requirements 8.1, 8.2, 8.3, 8.4
   */
  private static async convertAspectRatioFile(
    inputPath: string,
    outputPath: string,
    targetWidth: number,
    targetHeight: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const cropFilter = this.buildCenterCropFilter(targetWidth, targetHeight);

      const args = [
        "-i", inputPath,
        "-vf", cropFilter,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-y",
        outputPath,
      ];

      this.logOperation("FFMPEG_CONVERT_ASPECT", { args: args.join(" ") });

      const ffmpegProcess = spawn("ffmpeg", args);

      let stderr = "";

      ffmpegProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      ffmpegProcess.on("error", (err) => {
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });

      ffmpegProcess.on("close", (code) => {
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
      await this.convertAspectRatioFile(tempInputPath, tempOutputPath, width, height);

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
   * Build FFmpeg filter for center-crop aspect ratio conversion
   * Uses center-crop strategy to maintain subject visibility
   * Validates: Requirements 8.4
   */
  private static buildCenterCropFilter(targetWidth: number, targetHeight: number): string {
    // Scale to fit the target dimensions while maintaining aspect ratio,
    // then crop from center to exact target dimensions
    // This ensures the subject (usually in center) remains visible
    return `scale='if(gt(a,${targetWidth}/${targetHeight}),${targetWidth},-2)':'if(gt(a,${targetWidth}/${targetHeight}),-2,${targetHeight})',crop=${targetWidth}:${targetHeight}`;
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
   */
  static generateClipStorageKey(
    videoId: string,
    clipId: string,
    aspectRatio: AspectRatio
  ): string {
    return `clips/${videoId}/${clipId}-${aspectRatio.replace(":", "x")}.mp4`;
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

    const validQualities: VideoQuality[] = ["720p", "1080p", "4k"];
    if (!validQualities.includes(options.quality)) {
      return { valid: false, error: `Invalid quality. Must be one of: ${validQualities.join(", ")}` };
    }

    return { valid: true };
  }
}
