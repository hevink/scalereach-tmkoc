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
}

export interface PlanConfig {
  plan: "free" | "starter" | "pro";
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
    },
  },
  starter: {
    plan: "starter",
    minutes: { total: 200, type: "monthly", renewable: true },
    limits: {
      videoLength: 7200, // 2 hours
      uploadSize: 4 * 1024 * 1024 * 1024, // 4GB
      storageDuration: 180 * 24 * 60 * 60, // 6 months
      regenerations: 5,
      editing: -1, // unlimited
      watermark: false,
      translationsPerVideo: 5,
      dubbingMinutesPerMonth: 10,
    },
  },
  pro: {
    plan: "pro",
    minutes: { total: 500, type: "monthly", renewable: true },
    limits: {
      videoLength: 10800, // 3 hours
      uploadSize: 4 * 1024 * 1024 * 1024, // 4GB
      storageDuration: 180 * 24 * 60 * 60, // 6 months
      regenerations: 5,
      editing: -1, // unlimited
      watermark: false,
      translationsPerVideo: -1, // unlimited
      dubbingMinutesPerMonth: 30,
    },
  },
};

export function getPlanConfig(plan: string): PlanConfig {
  return PLAN_CONFIGS[plan] || PLAN_CONFIGS.free;
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
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(0)}GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)}MB`;
}
