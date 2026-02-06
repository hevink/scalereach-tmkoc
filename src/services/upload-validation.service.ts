/**
 * Upload Validation Service
 * Handles validation for file uploads including format and size checks
 */

import type { PlanConfig } from "../config/plan-config";
import { formatBytes } from "../config/plan-config";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  upgradeRequired?: boolean;
  recommendedPlan?: string;
  currentLimit?: string;
  attemptedValue?: string;
}

// Allowed video file formats (MIME types)
export const ALLOWED_VIDEO_FORMATS = [
  "video/mp4",
  "video/quicktime", // MOV
  "video/webm",
] as const;

// Allowed file extensions
export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"] as const;

// Human-readable format names for error messages
const FORMAT_NAMES: Record<string, string> = {
  "video/mp4": "MP4",
  "video/quicktime": "MOV",
  "video/webm": "WebM",
};

export class UploadValidationService {
  /**
   * Validates file format against allowed video formats (MP4, MOV, WebM)
   * @param mimeType The MIME type of the file
   * @param filename Optional filename to check extension
   * @returns ValidationResult indicating if format is valid
   */
  static validateFileFormat(mimeType: string, filename?: string): ValidationResult {
    // Check MIME type
    const isValidMimeType = (ALLOWED_VIDEO_FORMATS as readonly string[]).includes(mimeType);

    if (!isValidMimeType) {
      const allowedFormats = ALLOWED_VIDEO_FORMATS.map(
        (format) => FORMAT_NAMES[format] || format
      ).join(", ");
      return {
        valid: false,
        error: `Unsupported file format. Allowed formats: ${allowedFormats}. Received: ${mimeType}`,
      };
    }

    // Optionally validate file extension if filename is provided
    if (filename) {
      const extension = filename.toLowerCase().slice(filename.lastIndexOf("."));
      const isValidExtension = (ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(extension);

      if (!isValidExtension) {
        const allowedExtensions = ALLOWED_VIDEO_EXTENSIONS.join(", ");
        return {
          valid: false,
          error: `Unsupported file extension. Allowed extensions: ${allowedExtensions}. Received: ${extension}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validates file size against plan-based maximum allowed size
   * @param fileSize File size in bytes
   * @param planConfig Plan configuration with limits
   * @returns ValidationResult indicating if size is valid
   */
  static validateFileSize(fileSize: number, planConfig: PlanConfig): ValidationResult {
    if (fileSize <= 0) {
      return {
        valid: false,
        error: "Invalid file size: file size must be greater than 0",
      };
    }

    const maxSize = planConfig.limits.uploadSize;
    
    if (fileSize > maxSize) {
      const canUpgrade = planConfig.plan === "free" || planConfig.plan === "starter";
      const nextPlan = planConfig.plan === "free" ? "starter" : "pro";
      const planName = planConfig.plan.charAt(0).toUpperCase() + planConfig.plan.slice(1);
      
      return {
        valid: false,
        error: `File size (${formatBytes(fileSize)}) exceeds ${formatBytes(maxSize)} limit for ${planName} plan${canUpgrade ? `. Upgrade to ${nextPlan.charAt(0).toUpperCase() + nextPlan.slice(1)} for ${formatBytes(planConfig.plan === "free" ? 4 * 1024 * 1024 * 1024 : 4 * 1024 * 1024 * 1024)} uploads` : ""}`,
        upgradeRequired: canUpgrade,
        recommendedPlan: canUpgrade ? nextPlan : undefined,
        currentLimit: formatBytes(maxSize),
        attemptedValue: formatBytes(fileSize),
      };
    }

    return { valid: true };
  }

  /**
   * Validates both file format and size
   * @param mimeType The MIME type of the file
   * @param fileSize File size in bytes
   * @param planConfig Plan configuration with limits
   * @param filename Optional filename to check extension
   * @returns ValidationResult indicating if file is valid
   */
  static validateUpload(
    mimeType: string,
    fileSize: number,
    planConfig: PlanConfig,
    filename?: string
  ): ValidationResult {
    // Validate format first
    const formatValidation = this.validateFileFormat(mimeType, filename);
    if (!formatValidation.valid) {
      return formatValidation;
    }

    // Then validate size
    const sizeValidation = this.validateFileSize(fileSize, planConfig);
    if (!sizeValidation.valid) {
      return sizeValidation;
    }

    return { valid: true };
  }

  /**
   * Gets the human-readable format name for a MIME type
   * @param mimeType The MIME type
   * @returns Human-readable format name
   */
  static getFormatName(mimeType: string): string {
    return FORMAT_NAMES[mimeType] || mimeType;
  }

  /**
   * Gets the list of allowed formats as human-readable string
   * @returns Comma-separated list of allowed formats
   */
  static getAllowedFormatsString(): string {
    return ALLOWED_VIDEO_FORMATS.map(
      (format) => FORMAT_NAMES[format] || format
    ).join(", ");
  }

  /**
   * Gets the maximum file size as human-readable string for a plan
   * @param planConfig Plan configuration with limits
   * @returns Human-readable max file size (e.g., "2GB")
   */
  static getMaxFileSizeString(planConfig: PlanConfig): string {
    return formatBytes(planConfig.limits.uploadSize);
  }
}
