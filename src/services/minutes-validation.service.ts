import {
  PlanConfig,
  getPlanConfig,
  calculateMinuteConsumption,
  formatDuration,
  formatBytes,
} from "../config/plan-config";

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  message?: string;
  upgrade?: boolean;
  minutesWillBeDeducted?: number;
}

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  VIDEO_TOO_LONG: {
    free: "Your video is too long for the Free plan. Free users can upload videos up to 30 minutes. Upgrade to Starter for 2-hour videos or Pro for 3-hour videos.",
    starter: "Your video exceeds the 2-hour limit for Starter plan. Upgrade to Pro for 3-hour videos.",
    pro: "Your video exceeds the 3-hour limit. Please upload a shorter video.",
  },
  FILE_TOO_LARGE: {
    free: "Your file is too large for the Free plan (max 2GB). Upgrade to Starter or Pro for 4GB uploads.",
    starter: "Your file exceeds the 4GB limit.",
    pro: "Your file exceeds the 4GB limit.",
  },
  INSUFFICIENT_MINUTES: {
    free: "You don't have enough minutes. Free plan includes 50 one-time minutes. Upgrade to Starter (200/month) or Pro (300/month) for more.",
    starter: "You've used all your minutes for this month. They'll reset on your renewal date. Upgrade to Pro for 50% more minutes.",
    pro: "You've used all your minutes for this month. They'll reset on your renewal date.",
  },
  REGENERATION_LIMIT_REACHED: {
    free: "You've reached the regeneration limit (2) for this video. Upgrade to Starter or Pro for 5 regenerations per video.",
    starter: "You've reached the regeneration limit (5) for this video.",
    pro: "You've reached the regeneration limit (5) for this video.",
  },
  EDITING_LIMIT_REACHED: {
    free: "You've used all 5 editing operations. Upgrade to Starter or Pro for unlimited editing.",
    starter: "",
    pro: "",
  },
};

export function canUploadVideo(
  planConfig: PlanConfig,
  durationInSeconds: number,
  sizeInBytes: number,
  minutesRemaining: number,
  effectiveDurationInSeconds?: number
): ValidationResult {
  const plan = planConfig.plan;

  // Check 1: Video length limit (always check full video duration)
  if (durationInSeconds > planConfig.limits.videoLength) {
    return {
      allowed: false,
      reason: "VIDEO_TOO_LONG",
      message: ERROR_MESSAGES.VIDEO_TOO_LONG[plan],
      upgrade: plan !== "pro",
    };
  }

  // Check 2: File size limit (skip for YouTube where size is 0)
  if (sizeInBytes > 0 && sizeInBytes > planConfig.limits.uploadSize) {
    return {
      allowed: false,
      reason: "FILE_TOO_LARGE",
      message: ERROR_MESSAGES.FILE_TOO_LARGE[plan],
      upgrade: plan === "free",
    };
  }

  // Check 3: Available minutes (use effective/timeframe duration if provided)
  const billingDuration = effectiveDurationInSeconds ?? durationInSeconds;
  const minutesNeeded = calculateMinuteConsumption(billingDuration);
  if (minutesRemaining < minutesNeeded) {
    return {
      allowed: false,
      reason: "INSUFFICIENT_MINUTES",
      message: ERROR_MESSAGES.INSUFFICIENT_MINUTES[plan],
      upgrade: plan !== "pro",
    };
  }

  return {
    allowed: true,
    minutesWillBeDeducted: minutesNeeded,
  };
}

export function canRegenerateVideo(
  planConfig: PlanConfig,
  durationInSeconds: number,
  regenerationCount: number,
  minutesRemaining: number
): ValidationResult {
  const plan = planConfig.plan;

  // Check 1: Regeneration limit
  if (regenerationCount >= planConfig.limits.regenerations) {
    return {
      allowed: false,
      reason: "REGENERATION_LIMIT_REACHED",
      message: ERROR_MESSAGES.REGENERATION_LIMIT_REACHED[plan],
      upgrade: plan === "free",
    };
  }

  // Check 2: Available minutes
  const minutesNeeded = calculateMinuteConsumption(durationInSeconds);
  if (minutesRemaining < minutesNeeded) {
    return {
      allowed: false,
      reason: "INSUFFICIENT_MINUTES",
      message: ERROR_MESSAGES.INSUFFICIENT_MINUTES[plan],
      upgrade: plan !== "pro",
    };
  }

  return {
    allowed: true,
    minutesWillBeDeducted: minutesNeeded,
  };
}

export function canEditVideo(
  planConfig: PlanConfig,
  editingOperationsUsed: number
): ValidationResult {
  const plan = planConfig.plan;

  // Only free plan has editing limits
  if (plan === "free" && planConfig.limits.editing !== -1) {
    if (editingOperationsUsed >= planConfig.limits.editing) {
      return {
        allowed: false,
        reason: "EDITING_LIMIT_REACHED",
        message: ERROR_MESSAGES.EDITING_LIMIT_REACHED[plan],
        upgrade: true,
      };
    }
  }

  return {
    allowed: true,
  };
}

export function validateFileSize(
  planConfig: PlanConfig,
  sizeInBytes: number
): ValidationResult {
  if (sizeInBytes > planConfig.limits.uploadSize) {
    return {
      allowed: false,
      reason: "FILE_TOO_LARGE",
      message: ERROR_MESSAGES.FILE_TOO_LARGE[planConfig.plan],
      upgrade: planConfig.plan === "free",
    };
  }

  return { allowed: true };
}
