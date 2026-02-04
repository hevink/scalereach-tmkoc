/**
 * Clip Generator Service
 * Handles video segment extraction and aspect ratio conversion using FFmpeg and yt-dlp
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { spawn } from "child_process";
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
  introTitle?: string;
  captions?: {
    words: Array<{ word: string; start: number; end: number }>;
    style?: {
      fontFamily?: string;
      fontSize?: number;
      textColor?: string;
      backgroundColor?: string;
      backgroundOpacity?: number;
      position?: "top" | "center" | "bottom";
      alignment?: "left" | "center" | "right";
      animation?: "none" | "word-by-word" | "karaoke" | "bounce" | "fade";
      highlightColor?: string;
      highlightEnabled?: boolean;
      shadow?: boolean;
      outline?: boolean;
      outlineColor?: string;
    };
  };
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
      hasCaptions: !!options.captions?.words?.length,
      hasIntroTitle: !!options.introTitle,
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
        options.quality,
        options.captions,
        options.introTitle
      );
    } else if (options.sourceType === "upload" && options.storageKey) {
      // Extract segment from uploaded file
      clipBuffer = await this.extractSegmentFromFile(
        options.storageKey,
        options.startTime,
        options.endTime,
        options.aspectRatio,
        options.quality,
        options.captions,
        options.introTitle
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
   * Generate ASS subtitle content from caption words
   * Supports word-by-word karaoke effect with scaling animation
   * Optionally includes intro title overlay for first 3 seconds
   */
  private static generateASSSubtitles(
    words: Array<{ word: string; start: number; end: number }>,
    style: NonNullable<ClipGenerationOptions["captions"]>["style"] | undefined,
    width: number,
    height: number,
    introTitle?: string
  ): string {
    // Default style values
    const fontFamily = style?.fontFamily || "Arial";
    // Scale font size based on video width - templates are designed for ~1080 width
    // For 9:16 vertical (608 width), we need smaller fonts
    const baseFontSize = style?.fontSize || 48;
    const scaleFactor = Math.min(width, height) / 1080;
    const fontSize = Math.round(baseFontSize * scaleFactor * 0.6); // 0.6 to make it more readable
    const textColor = this.hexToASSColor(style?.textColor || "#FFFFFF");
    const outlineColor = this.hexToASSColor(style?.outlineColor || "#000000");
    const highlightColor = this.hexToASSColor(style?.highlightColor || "#FFFF00");
    const shadow = style?.shadow ? 2 : 0;
    const outline = style?.outline ? 3 : 2;
    
    // Position: bottom = 2, center = 5, top = 8
    const alignment = style?.position === "top" ? 8 : style?.position === "center" ? 5 : 2;
    
    // Vertical margin based on position
    const marginV = style?.position === "center" ? 0 : 60;

    // Intro title style - slightly larger than captions, positioned at 25% from top
    const introFontSize = Math.round(fontSize * 1.2);
    // To position at 25% from top: use center alignment (5) with MarginV to push up
    // MarginV pushes text away from center, so we need (height/2 - height*0.25) = height*0.25
    const introMarginV = Math.round(height * 0.25);

    // ASS header with styles for normal, highlighted, and intro title text
    let ass = `[Script Info]
Title: Generated Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${textColor},${textColor},${outlineColor},&H80000000,1,0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},20,20,${marginV},1
Style: Highlight,${fontFamily},${fontSize},${highlightColor},${highlightColor},${outlineColor},&H80000000,1,0,0,0,120,120,0,0,1,${outline},${shadow},${alignment},20,20,${marginV},1
Style: IntroTitle,${fontFamily},${introFontSize},${textColor},${textColor},${outlineColor},&H80000000,1,0,0,0,100,100,0,0,1,4,3,8,20,20,${introMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Add intro title for first 3 seconds if provided
    if (introTitle) {
      // Fade in effect: {\fad(300,300)} - 300ms fade in, 300ms fade out
      ass += `Dialogue: 1,0:00:00.00,0:00:03.00,IntroTitle,,0,0,0,,{\\fad(300,300)}${introTitle}\n`;
    }

    // Group words into lines (max ~5 words per line for readability)
    const lines: Array<{ words: typeof words; start: number; end: number }> = [];
    let currentLine: typeof words = [];
    
    for (const word of words) {
      currentLine.push(word);
      if (currentLine.length >= 5 || word.word.endsWith('.') || word.word.endsWith('?') || word.word.endsWith('!')) {
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

    // Generate dialogue lines
    if (style?.highlightEnabled) {
      // Word-by-word karaoke with scale effect
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
            if (j === i) {
              // Current word: scale 1.2x and highlight color
              text += `{\\fscx120\\fscy120\\c${highlightColor}}${w.word}{\\fscx100\\fscy100\\c${textColor}} `;
            } else {
              text += `${w.word} `;
            }
          }
          
          ass += `Dialogue: 0,${wordStart},${wordEnd},Default,,0,0,0,,${text.trim()}\n`;
        }
      }
    } else {
      // Simple text display without word highlighting
      for (const line of lines) {
        const startTime = this.formatASSTime(line.start);
        const endTime = this.formatASSTime(line.end);
        const text = line.words.map(w => w.word).join(" ");
        ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
      }
    }

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
    introTitle?: string
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

      // Step 2: Generate ASS subtitles if captions provided (includes intro title if provided)
      if (captions?.words?.length || introTitle) {
        const assContent = this.generateASSSubtitles(
          captions?.words || [], 
          captions?.style, 
          width, 
          height,
          introTitle
        );
        await fs.promises.writeFile(tempSubsPath, assContent);
        this.logOperation("GENERATED_ASS_SUBTITLES", { 
          path: tempSubsPath, 
          wordCount: captions?.words?.length || 0,
          hasIntroTitle: !!introTitle 
        });
      }

      // Step 3: Apply aspect ratio conversion and burn captions/intro title using FFmpeg
      await this.convertAspectRatioFile(
        tempVideoPath,
        tempOutputPath,
        width,
        height,
        (captions?.words?.length || introTitle) ? tempSubsPath : undefined
      );

      // Step 4: Read the output file
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
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.executeYtDlpDownload(url, startTime, endTime, outputPath);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRetryableError = lastError.message.includes("ffmpeg exited with code 202") ||
                                  lastError.message.includes("ffmpeg exited with code 1");
        
        if (isRetryableError && attempt < maxRetries) {
          // Wait before retry with exponential backoff (2s, 4s, 8s)
          const delayMs = Math.pow(2, attempt) * 1000;
          this.logOperation("YT_DLP_RETRY", { 
            attempt, 
            maxRetries, 
            delayMs, 
            error: lastError.message 
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
          
          // Clean up partial file if it exists
          await this.cleanupTempFile(outputPath);
        } else if (!isRetryableError) {
          // Non-retryable error, throw immediately
          throw lastError;
        }
      }
    }
    
    // All retries exhausted
    throw lastError || new Error("yt-dlp download failed after all retries");
  }

  /**
   * Execute the actual yt-dlp download command
   */
  private static async executeYtDlpDownload(
    url: string,
    startTime: number,
    endTime: number,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Always download the highest quality available (no height limit)
      // bestvideo + bestaudio merged, fallback to best single format
      const formatSelector = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best";

      const downloadSection = formatYtDlpTimestamp(startTime, endTime);

      const args = [
        "-f", formatSelector,
        "--download-sections", downloadSection,
        "--force-keyframes-at-cuts",
        "-o", outputPath,
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        "--no-post-overwrites", // Prevent conflicts with concurrent processes
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
    quality: VideoQuality,
    captions?: ClipGenerationOptions["captions"],
    introTitle?: string
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

    // Generate ASS subtitles if captions or intro title provided
    let subsPathToUse: string | undefined;
    if (captions?.words?.length || introTitle) {
      const assContent = this.generateASSSubtitles(
        captions?.words || [], 
        captions?.style, 
        width, 
        height,
        introTitle
      );
      await fs.promises.writeFile(tempSubsPath, assContent);
      subsPathToUse = tempSubsPath;
      this.logOperation("GENERATED_ASS_SUBTITLES", { 
        path: tempSubsPath, 
        wordCount: captions?.words?.length || 0,
        hasIntroTitle: !!introTitle 
      });
    }

    try {
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
            filterComplex = `${filterComplex},ass=${escapedPath}`;
          }
          
          args = [
            "-ss", startTime.toString(),
            "-i", videoUrl,
            "-t", duration.toString(),
            "-filter_complex", filterComplex,
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "18",
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
            videoFilter = `${videoFilter},ass=${escapedPath}`;
          }

          args = [
            "-ss", startTime.toString(),
            "-i", videoUrl,
            "-t", duration.toString(),
            "-vf", videoFilter,
            "-c:v", "libx264",
            "-preset", "slow",
            "-crf", "18",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "frag_keyframe+empty_moov",
            "-f", "mp4",
            "-",
          ];
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
    } finally {
      // Cleanup temp subtitle file
      if (subsPathToUse) {
        await this.cleanupTempFile(subsPathToUse);
      }
    }
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
    subtitlesPath?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const targetAspect = targetWidth / targetHeight;
      const isVertical = targetAspect < 1;
      
      let args: string[];
      
      if (isVertical) {
        // Use blur background filter (complex filter graph)
        let filterComplex = this.buildBlurBackgroundFilter(targetWidth, targetHeight);
        
        // Add subtitles to the final output if provided
        if (subtitlesPath) {
          const escapedPath = subtitlesPath
            .replace(/\\/g, "/")
            .replace(/:/g, "\\:");
          filterComplex = `${filterComplex},ass=${escapedPath}`;
        }
        
        args = [
          "-i", inputPath,
          "-filter_complex", filterComplex,
          "-c:v", "libx264",
          "-preset", "slow",
          "-crf", "18",
          "-c:a", "aac",
          "-b:a", "192k",
          "-movflags", "+faststart",
          "-y",
          outputPath,
        ];
      } else {
        // Use simple center-crop filter
        const cropFilter = `scale='max(${targetWidth},iw*${targetHeight}/ih)':'max(${targetHeight},ih*${targetWidth}/iw)',crop=${targetWidth}:${targetHeight}`;
        
        let videoFilter: string;
        if (subtitlesPath) {
          const escapedPath = subtitlesPath
            .replace(/\\/g, "/")
            .replace(/:/g, "\\:");
          videoFilter = `${cropFilter},ass=${escapedPath}`;
        } else {
          videoFilter = cropFilter;
        }

        args = [
          "-i", inputPath,
          "-vf", videoFilter,
          "-c:v", "libx264",
          "-preset", "slow",
          "-crf", "18",
          "-c:a", "aac",
          "-b:a", "192k",
          "-movflags", "+faststart",
          "-y",
          outputPath,
        ];
      }

      this.logOperation("FFMPEG_CONVERT_ASPECT", { 
        args: args.join(" "),
        hasSubtitles: !!subtitlesPath,
        isVertical,
        useBlurBackground: isVertical
      });

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
    // - apply gaussian blur (sigma=20 for nice blur effect)
    // - slightly darken to make foreground pop (colorlevels)
    // 
    // Foreground stream [fg]:
    // - scale to fit width while maintaining aspect ratio
    // - the height will be less than target height for landscape videos
    // 
    // Overlay:
    // - overlay foreground centered on blurred background
    // - (W-w)/2 centers horizontally, (H-h)/2 centers vertically
    
    return `[0:v]split=2[bg][fg];` +
      // Background: scale to cover, crop, blur, and slightly darken
      `[bg]scale='max(${targetWidth},iw*${targetHeight}/ih)':'max(${targetHeight},ih*${targetWidth}/iw)',` +
      `crop=${targetWidth}:${targetHeight},` +
      `gblur=sigma=25,` +
      `colorlevels=rimax=0.9:gimax=0.9:bimax=0.9[bg_blur];` +
      // Foreground: scale to fit width, maintain aspect ratio
      `[fg]scale=${targetWidth}:-2[fg_scaled];` +
      // Overlay foreground centered on blurred background
      `[bg_blur][fg_scaled]overlay=(W-w)/2:(H-h)/2`;
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
