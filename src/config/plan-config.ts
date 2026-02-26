export interface PlanMinutes {
  total: number;
  type: "one-time" | "monthly";
  renewable: boolean;
}

export interface PlanLimits {
  videoLength: number; // seconds
  uploadSize: number; // bytes
  storageDuration: number; // seconds
  regenerations: number; // per video
  editing: number; // -1 = unlimited
  watermark: boolean;
  translationsPerVideo: number; // -1 = unlimited
  dubbingMinutesPerMonth: number; // 0 = disabled, -1 = unlimited
  splitScreen: boolean; // split-screen clip generation
  maxClipQuality: "720p" | "1080p" | "2k" | "4k"; // max output quality for clips
  socialAccounts: number; // 0 = disabled, -1 = unlimited
}

export interface PlanConfig {
  plan: "free" | "starter" | "pro" | "agency";
  minutes: PlanMinutes;
  limits: PlanLimits;
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  free: {
    plan: "free",
    minutes: { total: 50, type: "one-time", renewable: false },
    limits: {
      videoLength: 1800, // 30 minutes
      uploadSize: 2 * 1024 * 1024 * 1024, // 2GB
      storageDuration: 14 * 24 * 60 * 60, // 14 days
      regenerations: 2,
      editing: 5,
      watermark: true,
      translationsPerVideo: 1,
      dubbingMinutesPerMonth: 0,
      splitScreen: false,
      maxClipQuality: "720p",
      socialAccounts: 0,
    },
  },
  starter: {
    plan: "starter",
    minutes: { total: 200, type: "monthly", renewable: true },
    limits: {
      videoLength: 7200, // 2 hours
      uploadSize: 4 * 1024 * 1024 * 1024, // 4GB
      storageDuration: 90 * 24 * 60 * 60, // 3 months
      regenerations: 5,
      editing: -1, // unlimited
      watermark: false,
      translationsPerVideo: 5,
      dubbingMinutesPerMonth: 10,
      splitScreen: true,
      maxClipQuality: "1080p",
      socialAccounts: 1,
    },
  },
  pro: {
    plan: "pro",
    minutes: { total: 400, type: "monthly", renewable: true },
    limits: {
      videoLength: 10800, // 3 hours
      uploadSize: 4 * 1024 * 1024 * 1024, // 4GB
      storageDuration: 180 * 24 * 60 * 60, // 6 months
      regenerations: 5,
      editing: -1, // unlimited
      watermark: false,
      translationsPerVideo: -1, // unlimited
      dubbingMinutesPerMonth: 30,
      splitScreen: true,
      maxClipQuality: "4k",
      socialAccounts: 5,
    },
  },
  agency: {
    plan: "agency",
    minutes: { total: -1, type: "monthly", renewable: true }, // -1 = unlimited
    limits: {
      videoLength: 3 * 60 * 60, // 3 hours in seconds
      uploadSize: 4 * 1024 * 1024 * 1024, // 4GB in bytes
      storageDuration: 180 * 24 * 60 * 60, // 6 months
      regenerations: -1, // unlimited
      editing: -1, // unlimited
      watermark: false,
      translationsPerVideo: -1, // unlimited
      dubbingMinutesPerMonth: -1, // unlimited
      splitScreen: true,
      maxClipQuality: "4k",
      socialAccounts: -1, // unlimited
    },
  },
};

export function getPlanConfig(plan: string): PlanConfig {
  return PLAN_CONFIGS[plan] || PLAN_CONFIGS.free;
}

/**
 * Calculate the expiry date for a video based on the workspace plan.
 * Returns a Date object set to now + storageDuration seconds.
 */
export function getVideoExpiryDate(plan: string): Date | undefined {
  const config = getPlanConfig(plan);
  if (config.limits.storageDuration === -1) return undefined; // unlimited storage
  const now = new Date();
  return new Date(now.getTime() + config.limits.storageDuration * 1000);
}

export function calculateMinuteConsumption(videoLengthInSeconds: number): number {
  return Math.ceil(videoLengthInSeconds / 60);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes === -1) return "Unlimited";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(0)}GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)}MB`;
}
