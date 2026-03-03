/**
 * Platform Detector Service
 * Detects which platform a URL belongs to and provides metadata.
 * All platforms are downloaded via yt-dlp — this service just routes them.
 */

export type SupportedPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "twitter"
  | "facebook"
  | "vimeo"
  | "twitch"
  | "linkedin"
  | "reddit"
  | "rumble"
  | "dailymotion"
  | "loom"
  | "ted";

export interface PlatformInfo {
  platform: SupportedPlatform;
  /** Human-readable display name */
  displayName: string;
  /** Whether this platform requires cookies/auth to download */
  requiresAuth: boolean;
  /** Whether yt-dlp supports this platform reliably */
  ytdlpSupported: boolean;
}

const PLATFORM_MAP: Record<SupportedPlatform, PlatformInfo> = {
  youtube:     { platform: "youtube",     displayName: "YouTube",     requiresAuth: false, ytdlpSupported: true },
  tiktok:      { platform: "tiktok",      displayName: "TikTok",      requiresAuth: false, ytdlpSupported: true },
  instagram:   { platform: "instagram",   displayName: "Instagram",   requiresAuth: true,  ytdlpSupported: true },
  twitter:     { platform: "twitter",     displayName: "X / Twitter", requiresAuth: false, ytdlpSupported: true },
  facebook:    { platform: "facebook",    displayName: "Facebook",    requiresAuth: true,  ytdlpSupported: true },
  vimeo:       { platform: "vimeo",       displayName: "Vimeo",       requiresAuth: false, ytdlpSupported: true },
  twitch:      { platform: "twitch",      displayName: "Twitch",      requiresAuth: false, ytdlpSupported: true },
  linkedin:    { platform: "linkedin",    displayName: "LinkedIn",    requiresAuth: true,  ytdlpSupported: true },
  reddit:      { platform: "reddit",      displayName: "Reddit",      requiresAuth: false, ytdlpSupported: true },
  rumble:      { platform: "rumble",      displayName: "Rumble",      requiresAuth: false, ytdlpSupported: true },
  dailymotion: { platform: "dailymotion", displayName: "Dailymotion", requiresAuth: false, ytdlpSupported: true },
  loom:        { platform: "loom",        displayName: "Loom",        requiresAuth: false, ytdlpSupported: true },
  ted:         { platform: "ted",         displayName: "TED",         requiresAuth: false, ytdlpSupported: true },
};

/** URL patterns per platform — ordered from most specific to least */
const PLATFORM_PATTERNS: Array<{ platform: SupportedPlatform; patterns: RegExp[] }> = [
  {
    platform: "youtube",
    patterns: [
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    ],
  },
  {
    platform: "tiktok",
    patterns: [
      /tiktok\.com\/@[\w.]+\/video\/\d+/,
      /tiktok\.com\/t\/\w+/,
      /vm\.tiktok\.com\/\w+/,
    ],
  },
  {
    platform: "instagram",
    patterns: [
      /instagram\.com\/(?:p|reel|tv)\/[\w-]+/,
    ],
  },
  {
    platform: "twitter",
    patterns: [
      /(?:twitter|x)\.com\/\w+\/status\/\d+/,
    ],
  },
  {
    platform: "facebook",
    patterns: [
      /facebook\.com\/(?:watch\/?\?v=\d+|[\w.]+\/videos\/\d+|reel\/\d+|share\/r\/[\w-]+)/,
      /fb\.watch\/\w+/,
    ],
  },
  {
    platform: "vimeo",
    patterns: [
      /vimeo\.com\/(?:video\/)?\d+/,
    ],
  },
  {
    platform: "twitch",
    patterns: [
      /twitch\.tv\/videos\/\d+/,
      /twitch\.tv\/\w+\/clip\/[\w-]+/,
      /clips\.twitch\.tv\/[\w-]+/,
    ],
  },
  {
    platform: "linkedin",
    patterns: [
      /linkedin\.com\/(?:posts|feed\/update|learning\/\S+)/,
    ],
  },
  {
    platform: "reddit",
    patterns: [
      /reddit\.com\/r\/\w+\/comments\/\w+/,
      /v\.redd\.it\/\w+/,
    ],
  },
  {
    platform: "rumble",
    patterns: [
      /rumble\.com\/(?:v[\w-]+|embed\/[\w-]+)/,
    ],
  },
  {
    platform: "dailymotion",
    patterns: [
      /dailymotion\.com\/video\/[\w]+/,
      /dai\.ly\/[\w]+/,
    ],
  },
  {
    platform: "loom",
    patterns: [
      /loom\.com\/share\/[\w]+/,
    ],
  },
  {
    platform: "ted",
    patterns: [
      /ted\.com\/talks\/[\w-]+/,
    ],
  },
];

export class PlatformDetectorService {
  /**
   * Detect which platform a URL belongs to.
   * Returns null if the URL is not from a supported platform.
   */
  static detect(url: string): PlatformInfo | null {
    const normalized = url.trim().toLowerCase();
    for (const { platform, patterns } of PLATFORM_PATTERNS) {
      if (patterns.some((p) => p.test(normalized))) {
        return PLATFORM_MAP[platform];
      }
    }
    return null;
  }

  /**
   * Returns true if the URL is from any supported platform.
   */
  static isSupported(url: string): boolean {
    return this.detect(url) !== null;
  }

  /**
   * Get the cookies env var name for a given platform.
   * e.g. instagram → INSTAGRAM_COOKIES_PATH
   */
  static getCookiesEnvKey(platform: SupportedPlatform): string {
    if (platform === "youtube") return "YOUTUBE_COOKIES_PATH";
    return `${platform.toUpperCase()}_COOKIES_PATH`;
  }

  static getPlatformInfo(platform: SupportedPlatform): PlatformInfo {
    return PLATFORM_MAP[platform];
  }

  static getAllSupported(): PlatformInfo[] {
    return Object.values(PLATFORM_MAP);
  }
}
