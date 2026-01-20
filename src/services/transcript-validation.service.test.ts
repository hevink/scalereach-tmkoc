import { describe, expect, test } from "bun:test";
import {
  TranscriptValidationService,
  TranscriptWord,
} from "./transcript-validation.service";

describe("TranscriptValidationService", () => {
  describe("validateWordTiming", () => {
    test("should accept valid word timing", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: 0.95,
      };
      const result = TranscriptValidationService.validateWordTiming(word, 0);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("should reject when start >= end (Requirement 4.3)", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: 1.0,
        end: 0.5,
        confidence: 0.95,
      };
      const result = TranscriptValidationService.validateWordTiming(word, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("start");
      expect(result.error).toContain("end");
    });

    test("should reject when start equals end", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: 1.0,
        end: 1.0,
        confidence: 0.95,
      };
      const result = TranscriptValidationService.validateWordTiming(word, 0);
      expect(result.valid).toBe(false);
    });

    test("should reject negative start time", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: -1,
        end: 0.5,
        confidence: 0.95,
      };
      const result = TranscriptValidationService.validateWordTiming(word, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-negative");
    });

    test("should reject negative end time", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: 0,
        end: -0.5,
        confidence: 0.95,
      };
      const result = TranscriptValidationService.validateWordTiming(word, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-negative");
    });

    test("should reject confidence outside 0-1 range", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: 1.5,
      };
      const result = TranscriptValidationService.validateWordTiming(word, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("confidence");
    });

    test("should reject negative confidence", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: -0.1,
      };
      const result = TranscriptValidationService.validateWordTiming(word, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("confidence");
    });

    test("should accept confidence at boundary values (0 and 1)", () => {
      const word1: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: 0,
      };
      const word2: TranscriptWord = {
        word: "world",
        start: 0.5,
        end: 1.0,
        confidence: 1,
      };
      expect(TranscriptValidationService.validateWordTiming(word1, 0).valid).toBe(true);
      expect(TranscriptValidationService.validateWordTiming(word2, 1).valid).toBe(true);
    });

    test("should include word index in error message", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: 1.0,
        end: 0.5,
        confidence: 0.95,
      };
      const result = TranscriptValidationService.validateWordTiming(word, 5);
      expect(result.error).toContain("index 5");
    });
  });

  describe("validateCompleteWord", () => {
    test("should accept valid complete word", () => {
      const word: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: 0.95,
      };
      const result = TranscriptValidationService.validateCompleteWord(word, 0);
      expect(result.valid).toBe(true);
    });

    test("should reject non-string word", () => {
      const word = {
        word: 123,
        start: 0,
        end: 0.5,
        confidence: 0.95,
      } as unknown as TranscriptWord;
      const result = TranscriptValidationService.validateCompleteWord(word, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("string");
    });

    test("should reject non-number start", () => {
      const word = {
        word: "hello",
        start: "0",
        end: 0.5,
        confidence: 0.95,
      } as unknown as TranscriptWord;
      const result = TranscriptValidationService.validateCompleteWord(word, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("number");
    });

    test("should reject non-number end", () => {
      const word = {
        word: "hello",
        start: 0,
        end: "0.5",
        confidence: 0.95,
      } as unknown as TranscriptWord;
      const result = TranscriptValidationService.validateCompleteWord(word, 0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("number");
    });
  });

  describe("validateTranscriptWords", () => {
    test("should accept valid transcript words array", () => {
      const words: TranscriptWord[] = [
        { word: "hello", start: 0, end: 0.5, confidence: 0.95 },
        { word: "world", start: 0.5, end: 1.0, confidence: 0.90 },
      ];
      const result = TranscriptValidationService.validateTranscriptWords(words);
      expect(result.valid).toBe(true);
    });

    test("should reject non-array input", () => {
      const result = TranscriptValidationService.validateTranscriptWords(
        "not an array" as unknown as TranscriptWord[]
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("array");
    });

    test("should accept empty array", () => {
      const result = TranscriptValidationService.validateTranscriptWords([]);
      expect(result.valid).toBe(true);
    });

    test("should reject if any word is invalid", () => {
      const words: TranscriptWord[] = [
        { word: "hello", start: 0, end: 0.5, confidence: 0.95 },
        { word: "world", start: 1.0, end: 0.5, confidence: 0.90 }, // Invalid: start > end
      ];
      const result = TranscriptValidationService.validateTranscriptWords(words);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("index 1");
    });
  });

  describe("mergeWordUpdate (Requirement 4.2 - preserve timestamps)", () => {
    test("should preserve timestamps when only text is modified", () => {
      const existingWord: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: 0.95,
      };
      const updates = { word: "hi" };
      const result = TranscriptValidationService.mergeWordUpdate(
        existingWord,
        updates
      );
      expect(result.word).toBe("hi");
      expect(result.start).toBe(0);
      expect(result.end).toBe(0.5);
      expect(result.confidence).toBe(0.95);
    });

    test("should update timing when provided", () => {
      const existingWord: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: 0.95,
      };
      const updates = { start: 0.1, end: 0.6 };
      const result = TranscriptValidationService.mergeWordUpdate(
        existingWord,
        updates
      );
      expect(result.word).toBe("hello");
      expect(result.start).toBe(0.1);
      expect(result.end).toBe(0.6);
      expect(result.confidence).toBe(0.95);
    });

    test("should update all fields when all provided", () => {
      const existingWord: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: 0.95,
      };
      const updates = {
        word: "hi",
        start: 0.1,
        end: 0.6,
        confidence: 0.99,
      };
      const result = TranscriptValidationService.mergeWordUpdate(
        existingWord,
        updates
      );
      expect(result.word).toBe("hi");
      expect(result.start).toBe(0.1);
      expect(result.end).toBe(0.6);
      expect(result.confidence).toBe(0.99);
    });

    test("should preserve all fields when no updates provided", () => {
      const existingWord: TranscriptWord = {
        word: "hello",
        start: 0,
        end: 0.5,
        confidence: 0.95,
      };
      const result = TranscriptValidationService.mergeWordUpdate(
        existingWord,
        {}
      );
      expect(result).toEqual(existingWord);
    });
  });

  describe("isTextOnlyUpdate", () => {
    test("should return true when only word is updated", () => {
      const updates = { word: "hi" };
      expect(TranscriptValidationService.isTextOnlyUpdate(updates)).toBe(true);
    });

    test("should return false when start is updated", () => {
      const updates = { word: "hi", start: 0.1 };
      expect(TranscriptValidationService.isTextOnlyUpdate(updates)).toBe(false);
    });

    test("should return false when end is updated", () => {
      const updates = { word: "hi", end: 0.6 };
      expect(TranscriptValidationService.isTextOnlyUpdate(updates)).toBe(false);
    });

    test("should return false when only timing is updated", () => {
      const updates = { start: 0.1, end: 0.6 };
      expect(TranscriptValidationService.isTextOnlyUpdate(updates)).toBe(false);
    });

    test("should return false when word is not provided", () => {
      const updates = { confidence: 0.99 };
      expect(TranscriptValidationService.isTextOnlyUpdate(updates)).toBe(false);
    });
  });

  describe("regenerateTranscriptText", () => {
    test("should concatenate words with spaces", () => {
      const words: TranscriptWord[] = [
        { word: "hello", start: 0, end: 0.5, confidence: 0.95 },
        { word: "world", start: 0.5, end: 1.0, confidence: 0.90 },
      ];
      const result = TranscriptValidationService.regenerateTranscriptText(words);
      expect(result).toBe("hello world");
    });

    test("should return empty string for empty array", () => {
      const result = TranscriptValidationService.regenerateTranscriptText([]);
      expect(result).toBe("");
    });

    test("should handle single word", () => {
      const words: TranscriptWord[] = [
        { word: "hello", start: 0, end: 0.5, confidence: 0.95 },
      ];
      const result = TranscriptValidationService.regenerateTranscriptText(words);
      expect(result).toBe("hello");
    });
  });
});
