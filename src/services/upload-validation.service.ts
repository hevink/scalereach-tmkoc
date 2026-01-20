/**
 * Upload Validation Service
 * Handles validation for file uploads including format and size checks
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Allowed video file formats (MIME types)
export const ALLOWED_VIDEO_FORMATS = [
  "video/mp4",
  "video/quicktime", // MOV
  "video/webm",
] as const;

// Allowed file extensions
export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"] as const;

// Maximum file size: 2GB in bytes
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

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
   * Validates file size against maximum allowed size (2GB)
   * @param fileSize File size in bytes
   * @returns ValidationResult indicating if size is valid
   */
  static validateFileSize(fileSize: number): ValidationResult {
    if (fileSize <= 0) {
      return {
        valid: false,
        error: "Invalid file size: file size must be greater than 0",
      };
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const maxSizeGB = MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024);
      const fileSizeGB = (fileSize / (1024 * 1024 * 1024)).toFixed(2);
      return {
        valid: false,
        error: `File size (${fileSizeGB} GB) exceeds maximum allowed size of ${maxSizeGB} GB`,
      };
    }

    return { valid: true };
  }

  /**
   * Validates both file format and size
   * @param mimeType The MIME type of the file
   * @param fileSize File size in bytes
   * @param filename Optional filename to check extension
   * @returns ValidationResult indicating if file is valid
   */
  static validateUpload(
    mimeType: string,
    fileSize: number,
    filename?: string
  ): ValidationResult {
    // Validate format first
    const formatValidation = this.validateFileFormat(mimeType, filename);
    if (!formatValidation.valid) {
      return formatValidation;
    }

    // Then validate size
    const sizeValidation = this.validateFileSize(fileSize);
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
   * Gets the maximum file size as human-readable string
   * @returns Human-readable max file size (e.g., "2 GB")
   */
  static getMaxFileSizeString(): string {
    return `${MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024)} GB`;
  }
}
