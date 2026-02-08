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
      // Add cookies if available
      const cookiesPath = process.env.YOUTUBE_COOKIES_PATH;
      
      const args = [
        "--dump-json",
        "--no-download",
        // Enable Deno as primary JavaScript runtime (faster and more reliable)
        "--js-runtimes", "deno,node",
        // Anti-bot detection measures
        "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        // Use web client when cookies are available, otherwise try android first
        "--extractor-args", cookiesPath ? "youtube:player_client=web,android" : "youtube:player_client=android,web",
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
      // Use web client when cookies are available, otherwise try android first
      "--extractor-args", cookiesPath ? "youtube:player_client=web,android" : "youtube:player_client=android,web",
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
