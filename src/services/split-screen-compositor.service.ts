/**
 * Split-Screen Compositor Service
 * Composes two video streams (main clip + background) into a vertically stacked output
 * using FFmpeg filter_complex.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { nanoid } from "nanoid";
import { R2Service } from "./r2.service";

export interface SplitScreenOptions {
  mainClipPath: string;
  backgroundVideoPath: string;
  outputPath: string;
  splitRatio: number; // 30-70, top portion percentage
  targetWidth: number;
  targetHeight: number;
  clipDuration: number;
  backgroundDuration: number;
}

export class SplitScreenCompositorService {
  private static log(op: string, details?: any) {
    console.log(`[SPLIT SCREEN] ${op}`, details ? JSON.stringify(details) : "");
  }

  /**
   * Build FFmpeg filter_complex string for split-screen layout.
   * Background fills entire frame, main video overlaid on top portion.
   */
  static buildFilterComplex(options: SplitScreenOptions): string {
    const topHeight = Math.round(options.targetHeight * (options.splitRatio / 100));
    const bottomHeight = options.targetHeight - topHeight;
    const w = options.targetWidth;

    // Scale each video to only its own portion, then stack vertically.
    // Previously the background was scaled to the full frame (1080×1920) and
    // the main clip overlaid on top — this caused the background to be heavily
    // upscaled/cropped even though only the bottom portion is visible.
    return [
      `[0:v]scale=${w}:${topHeight}:force_original_aspect_ratio=increase,crop=${w}:${topHeight}[main]`,
      `[1:v]scale=${w}:${bottomHeight}:force_original_aspect_ratio=increase,crop=${w}:${bottomHeight}[bg]`,
      `[main][bg]vstack[out]`,
    ].join(";");
  }

  /**
   * Determine FFmpeg input args for background video based on duration handling.
   * - bg < clip: loop with -stream_loop -1
   * - bg >= 2x clip: random offset, trim to clip duration
   * - bg 1x-2x clip: start at 0, trim to clip duration
   */
  static getBackgroundInputArgs(
    clipDuration: number,
    backgroundDuration: number
  ): { inputArgs: string[]; offset: number } {
    if (backgroundDuration < clipDuration) {
      // Loop the background
      return { inputArgs: ["-stream_loop", "-1"], offset: 0 };
    }

    if (backgroundDuration >= clipDuration * 2) {
      // Random offset within safe range
      const maxOffset = backgroundDuration - clipDuration;
      const offset = Math.floor(Math.random() * maxOffset);
      return { inputArgs: ["-ss", offset.toString()], offset };
    }

    // Between 1x and 2x — start from 0
    return { inputArgs: [], offset: 0 };
  }

  /**
   * Download a background video from R2 to a local temp file.
   * Aborts if download exceeds 60 seconds.
   */
  static async downloadBackground(storageKey: string): Promise<string> {
    this.log("DOWNLOAD_BG", { storageKey });

    const tempPath = path.join(os.tmpdir(), `bg-${nanoid()}.mp4`);
    const signedUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Background video download timed out (60s)"));
      }, 60000);

      // Use FFmpeg to download (handles HTTP properly)
      const proc = spawn("ffmpeg", [
        "-i", signedUrl,
        "-c", "copy",
        "-y",
        tempPath,
      ]);

      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          this.log("DOWNLOAD_BG_COMPLETE", { tempPath });
          resolve(tempPath);
        } else {
          reject(new Error(`Background download failed (code ${code}): ${stderr.slice(-300)}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Compose a split-screen video from main clip + background.
   * Single FFmpeg filter_complex pass. Audio from main clip only.
   */
  static async compose(options: SplitScreenOptions): Promise<string> {
    this.log("COMPOSE", {
      splitRatio: options.splitRatio,
      target: `${options.targetWidth}x${options.targetHeight}`,
      clipDuration: options.clipDuration,
      bgDuration: options.backgroundDuration,
    });

    const filterComplex = this.buildFilterComplex(options);
    const bgArgs = this.getBackgroundInputArgs(options.clipDuration, options.backgroundDuration);

    const args = [
      // Input 0: main clip
      "-i", options.mainClipPath,
      // Input 1: background video (with loop/offset args)
      ...bgArgs.inputArgs,
      "-i", options.backgroundVideoPath,
      // Filter
      "-filter_complex", filterComplex,
      // Map composed video + main clip audio only
      "-map", "[out]",
      "-map", "0:a",
      // Encoding (match existing pipeline)
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "192k",
      // Trim to clip duration
      "-t", options.clipDuration.toString(),
      // Output
      "-movflags", "+faststart",
      "-y",
      options.outputPath,
    ];

    return new Promise((resolve, reject) => {
      this.log("FFMPEG_CMD", { args: args.join(" ") });

      const proc = spawn("ffmpeg", args);
      let stderr = "";

      proc.stderr?.on("data", (d) => {
        stderr += d.toString();
        const match = d.toString().match(/time=(\d{2}:\d{2}:\d{2})/);
        if (match) {
          this.log("COMPOSE_PROGRESS", { time: match[1] });
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          this.log("COMPOSE_COMPLETE", { output: options.outputPath });
          resolve(options.outputPath);
        } else {
          reject(new Error(`Split-screen composition failed (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }

  /**
   * Clean up temporary files.
   */
  static async cleanup(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          await fs.promises.unlink(p);
        }
      } catch (err) {
        this.log("CLEANUP_WARN", { path: p, error: String(err) });
      }
    }
  }
}
