import { spawn } from "child_process";
import { Readable } from "stream";
import axios from "axios";

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  channelName: string;
  description: string;
  /** Best available video height (e.g. 720, 1080, 2160) — only set via yt-dlp */
  videoHeight?: number;
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

/**
 * Determine the best output quality based on source video height and plan limit.
 * Pro plan: up to 4k. Free/Starter: capped at 1080p.
 */
export function getQualityFromHeight(videoHeight?: number, maxQuality: "1080p" | "4k" = "4k"): "720p" | "1080p" | "4k" {
  if (maxQuality === "1080p") return "1080p";
  if (videoHeight && videoHeight >= 2160) return "4k";
  return "1080p";
}

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

  /**
   * Parse ISO 8601 duration (PT1H2M3S) to seconds
   */
  private static parseISO8601Duration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Lightweight video info fetcher using YouTube Data API v3 (no yt-dlp needed).
   * Used by the API server on Render. Falls back to yt-dlp if no API key is set.
   */
  static async getVideoInfoHttp(url: string): Promise<YouTubeVideoInfo> {
    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error("YOUTUBE_API_KEY not set");
    }

    console.log(`[YOUTUBE SERVICE] Getting video info via HTTP API for: ${videoId}`);

    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/videos`, {
        params: {
          part: "snippet,contentDetails",
          id: videoId,
          key: apiKey,
        },
        timeout: 10000,
      }
    );

    const items = response.data?.items;
    if (!items || items.length === 0) {
      throw new Error("Video not found or is unavailable");
    }

    const item = items[0];
    const snippet = item.snippet;
    const duration = this.parseISO8601Duration(item.contentDetails.duration);

    return {
      id: videoId,
      title: snippet.title,
      duration,
      thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channelName: snippet.channelTitle,
      description: snippet.description || "",
    };
  }

  /**
   * Get video info — uses HTTP API if YOUTUBE_API_KEY is set (for API server),
   * falls back to yt-dlp (for worker or local dev).
   */
  static async getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
    // Prefer HTTP API when available (no yt-dlp dependency)
    if (process.env.YOUTUBE_API_KEY) {
      try {
        return await this.getVideoInfoHttp(url);
      } catch (error) {
        console.warn(`[YOUTUBE SERVICE] HTTP API failed, falling back to yt-dlp:`, error instanceof Error ? error.message : error);
      }
    }

    // Fallback to yt-dlp (worker environment)
    return this.getVideoInfoYtDlp(url);
  }

  /**
   * Get video info using yt-dlp (requires yt-dlp binary installed).
   * Used by the worker on DigitalOcean.
   */
  static async getVideoInfoYtDlp(url: string): Promise<YouTubeVideoInfo> {
    console.log(`[YOUTUBE SERVICE] Getting video info via yt-dlp for: ${url}`);

    return new Promise((resolve, reject) => {
      // Add cookies if available
      const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;
      
      const args = [
        "--dump-json",
        "--no-download",
        // Enable Deno as JavaScript runtime (faster and more reliable)
        "--js-runtimes", "deno",
        // Anti-bot detection measures
        "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        // Use android_vr first — it serves highest quality streams including 4K AV1
        "--extractor-args", cookiesPath ? "youtube:player_client=web,android_vr,android" : "youtube:player_client=android_vr,web,android",
        "--extractor-retries", "5",
        url,
      ];

      if (cookiesPath) {
        args.unshift("--cookies", cookiesPath);
        console.log(`[YOUTUBE SERVICE] Using cookies from: ${cookiesPath}`);
      }

      const childProcess = spawn("yt-dlp", args);
      let stdout = "";
      let stderr = "";

      childProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      childProcess.on("close", (code) => {
        if (code !== 0) {
          console.error(`[YOUTUBE SERVICE] yt-dlp error: ${stderr}`);
          reject(new Error(`Failed to get video info: ${stderr}`));
          return;
        }

        try {
          const info = JSON.parse(stdout);

          // ===============================
          // ✅ ESTIMATE AUDIO FILE SIZE (not video)
          // ===============================
          const bestAudioFormat = info.formats
            ?.filter((f: any) =>
              (f.acodec && f.acodec !== 'none') &&
              (f.vcodec === 'none' || !f.vcodec) &&
              (f.filesize_approx || f.filesize)
            )
            ?.sort(
              (a: any, b: any) =>
                (b.filesize_approx || b.filesize) -
                (a.filesize_approx || a.filesize)
            )?.[0];

          const estimatedBytes =
            bestAudioFormat?.filesize_approx || bestAudioFormat?.filesize;

          if (estimatedBytes) {
            const estimatedMB = (estimatedBytes / (1024 * 1024)).toFixed(1);
            console.log(
              `[YOUTUBE SERVICE] Estimated audio file size: ~${estimatedMB} MB`
            );
          } else {
            console.log(
              `[YOUTUBE SERVICE] Estimated audio file size: Not available`
            );
          }

          // ===============================
          // Detect best available video height (for quality selection)
          // ===============================
          const bestVideoHeight = info.formats
            ?.filter((f: any) => f.vcodec && f.vcodec !== "none" && f.height)
            ?.reduce((max: number, f: any) => Math.max(max, f.height), 0) || undefined;

          if (bestVideoHeight) {
            console.log(`[YOUTUBE SERVICE] Best available video height: ${bestVideoHeight}p`);
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
            videoHeight: bestVideoHeight,
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

    // Add cookies if available
    const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;
    
    const args = [
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "-o", "-", // Output to stdout
      "--quiet", // Suppress progress output
      "--no-warnings",
      "--no-check-certificates",
      "--prefer-free-formats",
      // Enable Deno as primary JavaScript runtime (faster and more reliable)
      "--js-runtimes", "deno",
      // Anti-bot detection measures
      "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "--add-header", "Accept-Language:en-us,en;q=0.5",
      "--add-header", "Sec-Fetch-Mode:navigate",
      // Use android_vr first — it serves highest quality streams including 4K AV1
      "--extractor-args", cookiesPath ? "youtube:player_client=web,android_vr,android" : "youtube:player_client=android_vr,web,android",
      "--extractor-retries", "5",
      "--fragment-retries", "5",
      "--retry-sleep", "2",
      "--sleep-interval", "1",
      "--max-sleep-interval", "3",
      url,
    ];

    if (cookiesPath) {
      args.unshift("--cookies", cookiesPath);
      console.log(`[YOUTUBE SERVICE] Using cookies from: ${cookiesPath}`);
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
          stream.destroy(new Error(`YouTube blocked the download (403 Forbidden). Please update yt-dlp: yt-dlp -U. You may also need to provide YouTube cookies.`));
        } else if (stderr.includes("Video unavailable")) {
          stream.destroy(new Error(`Video is unavailable or private`));
        } else if (stderr.includes("Sign in to confirm")) {
          stream.destroy(new Error(`YouTube requires sign-in. Please provide YouTube cookies via YOUTUBE_COOKIES_PATH env variable.`));
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
