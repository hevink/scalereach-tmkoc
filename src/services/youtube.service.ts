import { spawn } from "child_process";
import { Readable } from "stream";

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  channelName: string;
  description: string;
}

export interface StreamResult {
  stream: Readable;
  mimeType: string;
  videoInfo: YouTubeVideoInfo;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Maximum video duration: 4 hours in seconds
export const MAX_VIDEO_DURATION_SECONDS = 14400;

export class YouTubeService {
  /**
   * Validates video duration against the maximum allowed duration (4 hours)
   * @param duration Duration in seconds
   * @returns ValidationResult indicating if duration is valid
   */
  static validateVideoDuration(duration: number): ValidationResult {
    if (duration <= 0) {
      return {
        valid: false,
        error: "Invalid video duration: duration must be greater than 0",
      };
    }

    if (duration > MAX_VIDEO_DURATION_SECONDS) {
      const maxHours = MAX_VIDEO_DURATION_SECONDS / 3600;
      const videoHours = (duration / 3600).toFixed(2);
      return {
        valid: false,
        error: `Video duration (${videoHours} hours) exceeds maximum allowed duration of ${maxHours} hours (${MAX_VIDEO_DURATION_SECONDS} seconds)`,
      };
    }

    return { valid: true };
  }

  static extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  static async getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
    console.log(`[YOUTUBE SERVICE] Getting video info for: ${url}`);

    return new Promise((resolve, reject) => {
      const args = [
        "--dump-json",
        "--no-download",
        url,
      ];

      const process = spawn("yt-dlp", args);
      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          console.error(`[YOUTUBE SERVICE] yt-dlp error: ${stderr}`);
          reject(new Error(`Failed to get video info: ${stderr}`));
          return;
        }

        try {
          const info = JSON.parse(stdout);

          // ===============================
          // ✅ ESTIMATE FILE SIZE
          // ===============================
          const bestMp4Format = info.formats
            ?.filter((f: any) =>
              f.ext === "mp4" &&
              (f.filesize_approx || f.filesize)
            )
            ?.sort(
              (a: any, b: any) =>
                (b.filesize_approx || b.filesize) -
                (a.filesize_approx || a.filesize)
            )?.[0];

          const estimatedBytes =
            bestMp4Format?.filesize_approx || bestMp4Format?.filesize;

          if (estimatedBytes) {
            const estimatedMB = (estimatedBytes / (1024 * 1024)).toFixed(1);
            console.log(
              `[YOUTUBE SERVICE] Estimated file size: ~${estimatedMB} MB`
            );
          } else {
            console.log(
              `[YOUTUBE SERVICE] Estimated file size: Not available`
            );
          }

          // ===============================
          // EXISTING RETURN
          // ===============================
          resolve({
            id: info.id,
            title: info.title,
            duration: info.duration,
            thumbnail: info.thumbnail,
            channelName: info.channel || info.uploader,
            description: info.description,
          });

        } catch (e) {
          reject(new Error(`Failed to parse video info: ${e}`));
        }

      });

      process.on("error", (err) => {
        reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
      });
    });
  }

  static async streamAudio(url: string): Promise<StreamResult> {
    console.log(`[YOUTUBE SERVICE] Starting audio stream: ${url}`);

    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    const videoInfo = await this.getVideoInfo(url);

    const args = [
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "-o", "-", // Output to stdout
      "--quiet", // Suppress progress output
      "--no-warnings",
      "--no-check-certificates",
      "--prefer-free-formats",
      "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "--extractor-retries", "3",
      "--fragment-retries", "3",
      "--retry-sleep", "1",
      url,
    ];

    const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;
    if (cookiesPath) {
      args.unshift("--cookies", cookiesPath);
    }

    const ytdlpProcess = spawn("yt-dlp", args);

    if (!ytdlpProcess.stdout) {
      throw new Error("Failed to create stdout stream");
    }

    const stream = ytdlpProcess.stdout as unknown as Readable;
    let stderr = "";
    let hasReceivedData = false;

    stream.on("data", () => {
      hasReceivedData = true;
    });

    ytdlpProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    ytdlpProcess.on("error", (err) => {
      console.error(`[YOUTUBE SERVICE] Process error: ${err.message}`);
      stream.destroy(new Error(`Failed to spawn yt-dlp: ${err.message}. Make sure yt-dlp is installed and up to date (run: yt-dlp -U)`));
    });

    ytdlpProcess.on("close", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[YOUTUBE SERVICE] Stream failed with code ${code}: ${stderr}`);
        
        // Check for common errors
        if (stderr.includes("403") || stderr.includes("Forbidden")) {
          stream.destroy(new Error(`YouTube blocked the download (403 Forbidden). Try updating yt-dlp: yt-dlp -U. If using cookies, ensure they are fresh.`));
        } else if (stderr.includes("Video unavailable")) {
          stream.destroy(new Error(`Video is unavailable or private`));
        } else if (!hasReceivedData) {
          stream.destroy(new Error(`Failed to download audio: ${stderr || 'No data received'}`));
        }
      }
    });

    console.log(`[YOUTUBE SERVICE] Audio stream started for: ${videoInfo.title}`);

    return {
      stream,
      mimeType: "audio/m4a",
      videoInfo,
    };
  }

  static isValidYouTubeUrl(url: string): boolean {
    return this.extractVideoId(url) !== null;
  }
}
