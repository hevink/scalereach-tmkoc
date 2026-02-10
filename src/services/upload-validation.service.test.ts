import { describe, it, expect } from "bun:test";
import { UploadValidationService } from "./upload-validation.service";
import { getPlanConfig } from "../config/plan-config";

describe("UploadValidationService - Plan-based validation", () => {
  describe("File Size Validation", () => {
    it("should allow 1.5GB file for Free plan", () => {
      const result = UploadValidationService.validateFileSize(
        1.5 * 1024 * 1024 * 1024,
        getPlanConfig("free")
      );
      expect(result.valid).toBe(true);
    });

    it("should reject 3GB file for Free plan with upgrade info", () => {
      const result = UploadValidationService.validateFileSize(
        3 * 1024 * 1024 * 1024,
        getPlanConfig("free")
      );
      expect(result.valid).toBe(false);
      expect(result.upgradeRequired).toBe(true);
      expect(result.recommendedPlan).toBe("starter");
      expect(result.currentLimit).toBe("2GB");
    });

    it("should allow 3.5GB file for Starter plan", () => {
      const result = UploadValidationService.validateFileSize(
        3.5 * 1024 * 1024 * 1024,
        getPlanConfig("starter")
      );
      expect(result.valid).toBe(true);
    });

    it("should reject 5GB file for Starter plan with upgrade info", () => {
      const result = UploadValidationService.validateFileSize(
        5 * 1024 * 1024 * 1024,
        getPlanConfig("starter")
      );
      expect(result.valid).toBe(false);
      expect(result.upgradeRequired).toBe(true);
      expect(result.recommendedPlan).toBe("pro");
    });

    it("should allow 3.9GB file for Pro plan", () => {
      const result = UploadValidationService.validateFileSize(
        3.9 * 1024 * 1024 * 1024,
        getPlanConfig("pro")
      );
      expect(result.valid).toBe(true);
    });

    it("should reject 5GB file for Pro plan without upgrade option", () => {
      const result = UploadValidationService.validateFileSize(
        5 * 1024 * 1024 * 1024,
        getPlanConfig("pro")
      );
      expect(result.valid).toBe(false);
      expect(result.upgradeRequired).toBe(false);
      expect(result.recommendedPlan).toBeUndefined();
    });

    it("should reject zero or negative file sizes", () => {
      const result = UploadValidationService.validateFileSize(
        0,
        getPlanConfig("free")
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be greater than 0");
    });
  });

  describe("Format Validation", () => {
    it("should allow MP4 files", () => {
      const result = UploadValidationService.validateFileFormat(
        "video/mp4",
        "test.mp4"
      );
      expect(result.valid).toBe(true);
    });

    it("should allow MOV files", () => {
      const result = UploadValidationService.validateFileFormat(
        "video/quicktime",
        "test.mov"
      );
      expect(result.valid).toBe(true);
    });

    it("should allow WebM files", () => {
      const result = UploadValidationService.validateFileFormat(
        "video/webm",
        "test.webm"
      );
      expect(result.valid).toBe(true);
    });

    it("should reject unsupported formats", () => {
      const result = UploadValidationService.validateFileFormat(
        "video/avi",
        "test.avi"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported file format");
    });
  });

  describe("Complete Upload Validation", () => {
    it("should validate both format and size for Free plan", () => {
      const result = UploadValidationService.validateUpload(
        "video/mp4",
        1.5 * 1024 * 1024 * 1024,
        getPlanConfig("free"),
        "test.mp4"
      );
      expect(result.valid).toBe(true);
    });

    it("should reject if format is invalid", () => {
      const result = UploadValidationService.validateUpload(
        "video/avi",
        1 * 1024 * 1024 * 1024,
        getPlanConfig("free"),
        "test.avi"
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Unsupported file format");
    });

    it("should reject if size exceeds plan limit", () => {
      const result = UploadValidationService.validateUpload(
        "video/mp4",
        3 * 1024 * 1024 * 1024,
        getPlanConfig("free"),
        "test.mp4"
      );
      expect(result.valid).toBe(false);
      expect(result.upgradeRequired).toBe(true);
    });
  });
});
