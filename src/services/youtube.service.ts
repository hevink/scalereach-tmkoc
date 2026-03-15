 import { spawn } from "child_process";
import { Readable } from "stream";
import { existsSync } from "fs";
import axios from "axios";

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  channelName: string;
  description: string;
  /** Best available video height (e.g. 720, 1080, 2160) - only set via yt-dlp */
  videoHeight?: number;
  /** BCP-47 language code of the video's audio (e.g. "hi", "en") */
  language?: string;
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
 * Pro: up to 4k. Starter: capped at 1080p. Free: capped at 720p.
 */
export function getQualityFromHeight(videoHeight?: number, maxQuality: "720p" | "1080p" | "2k" | "4k" = "2k"): "720p" | "1080p" | "2k" | "4k" {
  if (maxQuality === "720p") return "720p";
  if (maxQuality === "1080p") return "1080p";
  if (maxQuality === "2k") return "2k";
  if (videoHeight && videoHeight >= 2160) return "4k";
  return "2k";
}

export class YouTubeService {
  // ── Video info cache ──────────────────────────────────────────────
  private static VIDEO_INFO_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private static VIDEO_INFO_CACHE_MAX_SIZE = 100;

  /** Resolved results keyed by video ID */
  private static videoInfoCache = new Map<
    string,
    { data: YouTubeVideoInfo; expiry: number }
  >();

  /** In-flight promises keyed by video ID - deduplicates concurrent calls */
  private static videoInfoPending = new Map<string, Promise<YouTubeVideoInfo>>();

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
      language: snippet.defaultAudioLanguage || snippet.defaultLanguage || undefined,
    };
  }

  /**
   * Get video info - uses HTTP API if YOUTUBE_API_KEY is set (for API server),
   * falls back to yt-dlp (for worker or local dev).
   *
   * Results are cached in-memory for 15 minutes keyed by video ID.
   * Concurrent calls for the same video are deduplicated (single in-flight request).
   */
  static async getVideoInfo(url: string): Promise<YouTubeVideoInfo> {
    const videoId = this.extractVideoId(url);

    // If we can extract a video ID, check cache / dedup
    if (videoId) {
      // 1. Return from cache if still fresh
      const cached = this.videoInfoCache.get(videoId);
      if (cached && Date.now() < cached.expiry) {
        console.log(`[YOUTUBE SERVICE] Video info cache HIT for: ${videoId}`);
        return cached.data;
      }

      // 2. If another call for the same ID is already in-flight, piggyback on it
      const pending = this.videoInfoPending.get(videoId);
      if (pending) {
        console.log(`[YOUTUBE SERVICE] Video info dedup - waiting on in-flight request for: ${videoId}`);
        return pending;
      }

      // 3. Fetch, cache, and return
      const promise = this.fetchVideoInfoUncached(url).then((info) => {
        // Evict oldest entry if cache is full
        if (this.videoInfoCache.size >= this.VIDEO_INFO_CACHE_MAX_SIZE) {
          const oldestKey = this.videoInfoCache.keys().next().value;
          if (oldestKey) this.videoInfoCache.delete(oldestKey);
        }
        this.videoInfoCache.set(videoId, {
          data: info,
          expiry: Date.now() + this.VIDEO_INFO_CACHE_TTL_MS,
        });
        return info;
      }).finally(() => {
        this.videoInfoPending.delete(videoId);
      });

      this.videoInfoPending.set(videoId, promise);
      return promise;
    }

    // No video ID extracted - skip cache, fetch directly
    return this.fetchVideoInfoUncached(url);
  }

  /**
   * Internal uncached fetch - HTTP API → yt-dlp → oEmbed fallback chain.
   */
  private static async fetchVideoInfoUncached(url: string): Promise<YouTubeVideoInfo> {
    // Prefer HTTP API when available (no yt-dlp dependency)
    if (process.env.YOUTUBE_API_KEY) {
      try {
        return await this.getVideoInfoHttp(url);
      } catch (error) {
        console.warn(`[YOUTUBE SERVICE] HTTP API failed, falling back to yt-dlp:`, error instanceof Error ? error.message : error);
      }
    }

    // Try yt-dlp first
    try {
      return await this.getVideoInfoYtDlp(url);
    } catch (error: any) {
      const msg = error?.message || "";
      // If bot-blocked or POT failure, fall back to oEmbed scrape
      if (msg.includes("Sign in") || msg.includes("not a bot") || msg.includes("cookies") || msg.includes("page needs to be reloaded") || msg.includes("No request handlers")) {
        console.warn(`[YOUTUBE SERVICE] yt-dlp bot-blocked, trying oEmbed fallback`);
        return await this.getVideoInfoOEmbed(url);
      }
      throw error;
    }
  }

  /**
   * Fallback video info fetcher using YouTube oEmbed API + page scrape for duration.
   * Works from datacenter IPs where yt-dlp gets bot-blocked.
   */
  static async getVideoInfoOEmbed(url: string): Promise<YouTubeVideoInfo> {
    const videoId = this.extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    console.log(`[YOUTUBE SERVICE] Getting video info via oEmbed fallback for: ${videoId}`);

    // oEmbed for title, channel, thumbnail
    const oembedRes = await axios.get(`https://www.youtube.com/oembed`, {
      params: { url: `https://www.youtube.com/watch?v=${videoId}`, format: "json" },
      timeout: 10000,
    });
    const oembed = oembedRes.data;

    // Scrape page for duration (lengthSeconds in ytInitialPlayerResponse)
    let duration = 0;
    try {
      const pageRes = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
        timeout: 10000,
      });
      const match = pageRes.data.match(/"lengthSeconds":"(\d+)"/);
      if (match) duration = parseInt(match[1], 10);
    } catch (e) {
      console.warn(`[YOUTUBE SERVICE] oEmbed page scrape for duration failed:`, e instanceof Error ? e.message : e);
    }

    return {
      id: videoId,
      title: oembed.title,
      duration,
      thumbnail: oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channelName: oembed.author_name,
      description: "",
    };
  }

  /**
   * Get video info using yt-dlp (requires yt-dlp binary installed).
   * Used by the worker on DigitalOcean.
   */
  static async getVideoInfoYtDlp(url: string): Promise<YouTubeVideoInfo> {
    console.log(`[YOUTUBE SERVICE] Getting video info via yt-dlp for: ${url}`);

    return new Promise((resolve, reject) => {
      // Add cookies if available - check env var first, then fallback to config files
      const cookiesPath = process.env.YOUTUBE_COOKIES_PATH
        || (existsSync("./config/youtube_cookies_local.txt") ? "./config/youtube_cookies_local.txt" : undefined)
        || (existsSync("./config/youtube_cookies.txt") ? "./config/youtube_cookies.txt" : undefined);
      const proxy = process.env.YOUTUBE_PROXY;
      const bgutilBaseUrl = process.env.YT_DLP_GET_POT_BGUTIL_BASE_URL;
      
      const args = [
        "--dump-json",
        "--no-download",
        "--no-check-certificates",
        "--extractor-args", `youtube:player_client=${cookiesPath ? "web" : "web,android_vr,android"}`,
        "--extractor-retries", "3",
        url,
      ];

      // Add bgutil POT provider if server is running
      if (bgutilBaseUrl) {
        args.splice(args.indexOf("--extractor-retries"), 0,
          "--extractor-args", `youtubepot-bgutilhttp:base_url=${bgutilBaseUrl}`
        );
        console.log(`[YOUTUBE SERVICE] Using bgutil POT provider at: ${bgutilBaseUrl}`);
      }

      // Add proxy if configured
      if (proxy) {
        args.unshift("--proxy", proxy);
        console.log(`[YOUTUBE SERVICE] Using proxy: ${proxy}`);
      }

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
            language: info.language || undefined,
          });

        } catch (e) {
          reject(new Error(`Failed to parse video info: ${e}`));
        }

      });

      childProcess.on("error", (err) => {
        reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
      });
    });
  }

  static async streamAudio(url: string, startTime?: number, endTime?: number): Promise<StreamResult> {
    console.log(`[YOUTUBE SERVICE] Starting audio stream: ${url}`);

    const videoId = this.extractVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    const videoInfo = await this.getVideoInfo(url);

    // Add cookies if available - check env var first, then fallback to config files
    const cookiesPath = process.env.YOUTUBE_COOKIES_PATH
      || (existsSync("./config/youtube_cookies_local.txt") ? "./config/youtube_cookies_local.txt" : undefined)
      || (existsSync("./config/youtube_cookies.txt") ? "./config/youtube_cookies.txt" : undefined);
    const proxy = process.env.YOUTUBE_PROXY;
    const bgutilBaseUrl = process.env.YT_DLP_GET_POT_BGUTIL_BASE_URL;
    
    const args = [
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "-o", "-",
      "--quiet",
      "--no-warnings",
      "--no-check-certificates",
      "--prefer-free-formats",
      "--extractor-args", `youtube:player_client=${cookiesPath ? "web" : "web,android_vr,android"}`,
      "--extractor-retries", "3",
      "--fragment-retries", "5",
      "--retry-sleep", "2",
      url,
    ];

    // Add bgutil POT provider if server is running
    if (bgutilBaseUrl) {
      args.splice(args.indexOf("--extractor-retries"), 0,
        "--extractor-args", `youtubepot-bgutilhttp:base_url=${bgutilBaseUrl}`
      );
    }

    // Add proxy if configured
    if (proxy) {
      args.unshift("--proxy", proxy);
      console.log(`[YOUTUBE SERVICE] Using proxy for audio stream`);
    }

    // Download only the selected timeframe if specified
    // NOTE: --download-sections uses ffmpeg internally, which does NOT route through the proxy.
    // When a proxy is configured, skip timeframe cutting here and download the full audio instead.
    // The extra bandwidth is negligible for audio-only streams (~1MB/min).
    if ((startTime !== undefined || endTime !== undefined) && !proxy) {
      const start = startTime ?? 0;
      const end = endTime ?? videoInfo.duration;
      const formatTs = (s: number) => {
        const h = Math.floor(s / 3600).toString().padStart(2, "0");
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
        const sec = (s % 60).toFixed(3).padStart(6, "0");
        return `${h}:${m}:${sec}`;
      };
      args.splice(args.indexOf(url), 0,
        "--download-sections", `*${formatTs(start)}-${formatTs(end)}`,
        "--force-keyframes-at-cuts",
      );
      console.log(`[YOUTUBE SERVICE] Timeframe audio: ${formatTs(start)} → ${formatTs(end)}`);
    } else if ((startTime !== undefined || endTime !== undefined) && proxy) {
      console.log(`[YOUTUBE SERVICE] Skipping --download-sections (proxy active, ffmpeg can't use it). Downloading full audio.`);
    }

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
