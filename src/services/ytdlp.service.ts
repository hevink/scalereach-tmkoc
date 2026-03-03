/**
 * YtDlp Service — generalized yt-dlp wrapper for all supported platforms.
 * Replaces the YouTube-only logic in youtube.service.ts for multi-platform support.
 */

import { spawn } from "child_process";
import { Readable } from "stream";
import { PlatformDetectorService, type SupportedPlatform } from "./platform-detector.service";

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  channelName: string;
  description: string;
  platform: SupportedPlatform;
  videoHeight?: number;
  language?: string;
}

export interface StreamResult {
  stream: Readable;
  mimeType: string;
  videoInfo: VideoInfo;
}

/** Build common yt-dlp args shared across all commands */
function buildBaseArgs(url: string, platform: SupportedPlatform): string[] {
  const args: string[] = [];

  // Per-platform cookies
  const cookiesKey = PlatformDetectorService.getCookiesEnvKey(platform);
  const cookiesPath = process.env[cookiesKey];
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
    console.log(`[YTDLP] Using cookies from ${cookiesKey}: ${cookiesPath}`);
  }

  // Global proxy
  const proxy = process.env.YTDLP_PROXY || process.env.YOUTUBE_PROXY;
  if (proxy) {
    args.push("--proxy", proxy);
  }

  // YouTube-specific: bgutil POT provider + player client
  if (platform === "youtube") {
    const bgutilBaseUrl = process.env.YT_DLP_GET_POT_BGUTIL_BASE_URL;
    args.push("--extractor-args", "youtube:player_client=web");
    if (bgutilBaseUrl) {
      args.push("--extractor-args", `youtubepot-bgutilhttp:base_url=${bgutilBaseUrl}`);
    }
  }

  args.push("--extractor-retries", "3");
  args.push(url);
  return args;
}

export class YtDlpService {
  /**
   * Get video metadata for any supported platform URL.
   */
  static async getVideoInfo(url: string): Promise<VideoInfo> {
    const platformInfo = PlatformDetectorService.detect(url);
    if (!platformInfo) {
      throw new Error(`Unsupported URL. Supported platforms: YouTube, TikTok, Instagram, X/Twitter, Facebook, Vimeo, Twitch, LinkedIn, Reddit, Rumble, Dailymotion, Loom, TED`);
    }

    const platform = platformInfo.platform;
    console.log(`[YTDLP] Getting video info for platform=${platform}: ${url}`);

    const baseArgs = buildBaseArgs(url, platform);
    // Insert dump-json flags before the URL
    const urlIndex = baseArgs.indexOf(url);
    const args = [
      ...baseArgs.slice(0, urlIndex),
      "--dump-json",
      "--no-download",
      ...baseArgs.slice(urlIndex),
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn("yt-dlp", args);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      proc.on("error", (err) => reject(new Error(`Failed to spawn yt-dlp: ${err.message}`)));

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error(`[YTDLP] getVideoInfo failed (code ${code}): ${stderr}`);
          reject(new Error(this.sanitizeError(stderr, platform)));
          return;
        }

        try {
          // yt-dlp may output multiple JSON objects for playlists — take the first
          const firstLine = stdout.trim().split("\n")[0];
          const info = JSON.parse(firstLine);

          const bestVideoHeight = info.formats
            ?.filter((f: any) => f.vcodec && f.vcodec !== "none" && f.height)
            ?.reduce((max: number, f: any) => Math.max(max, f.height), 0) || undefined;

          resolve({
            id: info.id || info.display_id || "",
            title: info.title || info.fulltitle || "Untitled",
            duration: info.duration || 0,
            thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || "",
            channelName: info.channel || info.uploader || info.creator || "",
            description: info.description || "",
            platform,
            videoHeight: bestVideoHeight || undefined,
            language: info.language || undefined,
          });
        } catch (e) {
          reject(new Error(`Failed to parse yt-dlp output: ${e}`));
        }
      });
    });
  }

  /**
   * Stream audio from any supported platform URL.
   * Returns a readable stream of the best available audio.
   */
  static async streamAudio(
    url: string,
    startTime?: number,
    endTime?: number
  ): Promise<StreamResult> {
    const platformInfo = PlatformDetectorService.detect(url);
    if (!platformInfo) {
      throw new Error(`Unsupported URL`);
    }

    const platform = platformInfo.platform;
    console.log(`[YTDLP] Streaming audio for platform=${platform}: ${url}`);

    // Get video info first (needed for duration/title)
    const videoInfo = await this.getVideoInfo(url);

    const baseArgs = buildBaseArgs(url, platform);
    const urlIndex = baseArgs.indexOf(url);

    const args = [
      ...baseArgs.slice(0, urlIndex),
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "-o", "-",
      "--quiet",
      "--no-warnings",
      "--no-check-certificates",
      "--prefer-free-formats",
      "--fragment-retries", "5",
      "--retry-sleep", "2",
    ];

    // Timeframe download (supported by yt-dlp for most platforms)
    if (startTime !== undefined || endTime !== undefined) {
      const start = startTime ?? 0;
      const end = endTime ?? videoInfo.duration;
      const fmt = (s: number) => {
        const h = Math.floor(s / 3600).toString().padStart(2, "0");
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
        const sec = (s % 60).toFixed(3).padStart(6, "0");
        return `${h}:${m}:${sec}`;
      };
      args.push("--download-sections", `*${fmt(start)}-${fmt(end)}`);
      args.push("--force-keyframes-at-cuts");
      console.log(`[YTDLP] Timeframe: ${fmt(start)} → ${fmt(end)}`);
    }

    args.push(...baseArgs.slice(urlIndex)); // append URL + any trailing args

    const proc = spawn("yt-dlp", args);

    if (!proc.stdout) {
      throw new Error("Failed to create stdout stream");
    }

    const stream = proc.stdout as unknown as Readable;
    let stderr = "";
    let hasData = false;

    stream.on("data", () => { hasData = true; });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });

    proc.on("error", (err) => {
      stream.destroy(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0 && code !== null && !hasData) {
        stream.destroy(new Error(this.sanitizeError(stderr, platform)));
      }
    });

    return { stream, mimeType: "audio/m4a", videoInfo };
  }

  /**
   * Sanitize yt-dlp error messages into user-friendly strings.
   */
  static sanitizeError(stderr: string, platform: SupportedPlatform): string {
    const msg = stderr.toLowerCase();
    const name = PlatformDetectorService.getPlatformInfo(platform).displayName;

    if (msg.includes("sign in") || msg.includes("login") || msg.includes("not a bot") || msg.includes("cookies")) {
      return `${name} requires authentication. Please provide cookies via ${PlatformDetectorService.getCookiesEnvKey(platform)} env variable.`;
    }
    if (msg.includes("private") || msg.includes("members only")) {
      return "This video is private or members-only and cannot be processed.";
    }
    if (msg.includes("unavailable") || msg.includes("removed") || msg.includes("does not exist") || msg.includes("not found")) {
      return "This video is unavailable or has been removed.";
    }
    if (msg.includes("age") || msg.includes("age-restricted")) {
      return "This video is age-restricted and cannot be processed.";
    }
    if (msg.includes("403") || msg.includes("forbidden")) {
      return `${name} blocked the download. Please update yt-dlp (yt-dlp -U) or provide cookies.`;
    }
    if (msg.includes("geo") || msg.includes("not available in your country")) {
      return "This video is not available in the server's region.";
    }
    return `Could not download from ${name}. Please check the URL and try again.`;
  }

  /**
   * Validate a URL — checks platform support and fetches basic info.
   */
  static async validateUrl(url: string): Promise<{ valid: boolean; videoInfo?: VideoInfo; error?: string }> {
    const platformInfo = PlatformDetectorService.detect(url);
    if (!platformInfo) {
      return { valid: false, error: "Unsupported platform. Paste a URL from YouTube, TikTok, Instagram, X, Facebook, Vimeo, Twitch, LinkedIn, Reddit, Rumble, Dailymotion, Loom, or TED." };
    }

    try {
      const videoInfo = await this.getVideoInfo(url);
      if (!videoInfo.duration || videoInfo.duration <= 0) {
        return { valid: false, error: "Could not determine video duration. The video may be a live stream or unavailable." };
      }
      if (videoInfo.duration > 14400) {
        return { valid: false, error: `Video is too long (${Math.round(videoInfo.duration / 60)} min). Maximum is 4 hours.` };
      }
      return { valid: true, videoInfo };
    } catch (err: any) {
      return { valid: false, error: err.message || "Failed to fetch video information." };
    }
  }
}
