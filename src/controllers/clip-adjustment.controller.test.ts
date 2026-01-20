/**
 * Unit tests for Clip Adjustment Controller
 * Tests boundary validation and transcript extraction
 * 
 * Validates: Requirements 9.1, 9.3, 9.4, 9.5
 */

import { describe, test, expect } from "bun:test";
import {
  validateBoundaryAdjustment,
  getTranscriptForRange,
  MIN_CLIP_DURATION,
  MAX_CLIP_DURATION,
} from "./clip-adjustment.controller";
import { TranscriptWord } from "../services/deepgram.service";

describe("Clip Adjustment Controller", () => {
  describe("validateBoundaryAdjustment", () => {
    /**
     * Test: Valid boundary adjustment within constraints
     * Validates: Requirements 9.3, 9.4
     */
    test("should accept valid boundaries within duration constraints", () => {
      const result = validateBoundaryAdjustment(10, 30);
      expect(result.valid).toBe(true);
      expect(result.startTime).toBe(10);
      expect(result.endTime).toBe(30);
      expect(result.duration).toBe(20);
    });

    /**
     * Test: Minimum duration constraint (5 seconds)
     * Validates: Requirement 9.3
     */
    test("should reject clip shorter than minimum duration (5 seconds)", () => {
      const result = validateBoundaryAdjustment(10, 14);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 5 seconds");
    });

    /**
     * Test: Exactly minimum duration should be accepted
     * Validates: Requirement 9.3
     */
    test("should accept clip with exactly minimum duration (5 seconds)", () => {
      const result = validateBoundaryAdjustment(10, 15);
      expect(result.valid).toBe(true);
      expect(result.duration).toBe(5);
    });

    /**
     * Test: Maximum duration constraint (180 seconds)
     * Validates: Requirement 9.4
     */
    test("should reject clip longer than maximum duration (180 seconds)", () => {
      const result = validateBoundaryAdjustment(0, 200);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot exceed 180 seconds");
    });

    /**
     * Test: Exactly maximum duration should be accepted
     * Validates: Requirement 9.4
     */
    test("should accept clip with exactly maximum duration (180 seconds)", () => {
      const result = validateBoundaryAdjustment(0, 180);
      expect(result.valid).toBe(true);
      expect(result.duration).toBe(180);
    });

    /**
     * Test: Negative start time should be rejected
     */
    test("should reject negative start time", () => {
      const result = validateBoundaryAdjustment(-5, 30);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be negative");
    });

    /**
     * Test: End time must be greater than start time
     */
    test("should reject end time less than or equal to start time", () => {
      const result1 = validateBoundaryAdjustment(30, 20);
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain("End time must be greater than start time");

      const result2 = validateBoundaryAdjustment(30, 30);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain("End time must be greater than start time");
    });

    /**
     * Test: End time should not exceed video duration
     */
    test("should reject end time exceeding video duration", () => {
      const result = validateBoundaryAdjustment(10, 120, 100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot exceed video duration");
    });

    /**
     * Test: Valid boundaries within video duration
     */
    test("should accept valid boundaries within video duration", () => {
      const result = validateBoundaryAdjustment(10, 90, 100);
      expect(result.valid).toBe(true);
      expect(result.duration).toBe(80);
    });

    /**
     * Test: Zero start time should be valid
     */
    test("should accept zero start time", () => {
      const result = validateBoundaryAdjustment(0, 30);
      expect(result.valid).toBe(true);
      expect(result.startTime).toBe(0);
    });
  });

  describe("getTranscriptForRange", () => {
    const sampleWords: TranscriptWord[] = [
      { word: "Hello", start: 0, end: 0.5, confidence: 0.99 },
      { word: "world", start: 0.6, end: 1.0, confidence: 0.98 },
      { word: "this", start: 1.1, end: 1.4, confidence: 0.97 },
      { word: "is", start: 1.5, end: 1.7, confidence: 0.99 },
      { word: "a", start: 1.8, end: 1.9, confidence: 0.95 },
      { word: "test", start: 2.0, end: 2.5, confidence: 0.99 },
      { word: "video", start: 2.6, end: 3.0, confidence: 0.98 },
      { word: "transcript", start: 3.1, end: 3.8, confidence: 0.97 },
      { word: "for", start: 3.9, end: 4.1, confidence: 0.99 },
      { word: "clipping", start: 4.2, end: 4.8, confidence: 0.96 },
    ];

    /**
     * Test: Extract transcript for a specific time range
     * Validates: Requirement 9.5
     */
    test("should extract words within the specified time range", () => {
      const result = getTranscriptForRange(sampleWords, 1.0, 3.0);
      expect(result).toBe("this is a test video");
    });

    /**
     * Test: Extract transcript from the beginning
     * Validates: Requirement 9.5
     */
    test("should extract words from the beginning of the video", () => {
      const result = getTranscriptForRange(sampleWords, 0, 1.5);
      expect(result).toBe("Hello world this");
    });

    /**
     * Test: Extract transcript to the end
     * Validates: Requirement 9.5
     */
    test("should extract words to the end of the video", () => {
      // Word "transcript" starts at 3.1, so with startTime 3.1 it should be included
      const result = getTranscriptForRange(sampleWords, 3.1, 5.0);
      expect(result).toBe("transcript for clipping");
    });

    /**
     * Test: Empty result when no words in range
     * Validates: Requirement 9.5
     */
    test("should return empty string when no words in range", () => {
      const result = getTranscriptForRange(sampleWords, 10, 20);
      expect(result).toBe("");
    });

    /**
     * Test: Handle empty words array
     */
    test("should return empty string for empty words array", () => {
      const result = getTranscriptForRange([], 0, 10);
      expect(result).toBe("");
    });

    /**
     * Test: Handle undefined/null words array
     */
    test("should return empty string for undefined words", () => {
      const result = getTranscriptForRange(undefined as any, 0, 10);
      expect(result).toBe("");
    });

    /**
     * Test: Words at exact boundary should be included
     * Validates: Requirement 9.5
     */
    test("should include words at exact boundaries", () => {
      const result = getTranscriptForRange(sampleWords, 0, 0.5);
      expect(result).toBe("Hello");
    });

    /**
     * Test: Words partially outside range should be excluded
     * Validates: Requirement 9.5
     */
    test("should exclude words that extend beyond the range", () => {
      // Word "world" ends at 1.0, so with endTime 0.9 it should be excluded
      const result = getTranscriptForRange(sampleWords, 0, 0.9);
      expect(result).toBe("Hello");
    });

    /**
     * Test: Full transcript extraction
     * Validates: Requirement 9.5
     */
    test("should extract full transcript when range covers all words", () => {
      const result = getTranscriptForRange(sampleWords, 0, 10);
      expect(result).toBe("Hello world this is a test video transcript for clipping");
    });
  });

  describe("Duration Constants", () => {
    /**
     * Test: Verify minimum duration constant
     * Validates: Requirement 9.3
     */
    test("MIN_CLIP_DURATION should be 5 seconds", () => {
      expect(MIN_CLIP_DURATION).toBe(5);
    });

    /**
     * Test: Verify maximum duration constant
     * Validates: Requirement 9.4
     */
    test("MAX_CLIP_DURATION should be 180 seconds", () => {
      expect(MAX_CLIP_DURATION).toBe(180);
    });
  });
});
