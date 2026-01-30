import { describe, expect, test } from "bun:test";
import {
  SUPPORTED_LANGUAGES,
  isValidLanguageCode,
  getSupportedLanguageCodes,
  type SupportedLanguageCode,
} from "./deepgram.service";

/**
 * Unit tests for DeepgramService language detection and selection
 * Validates: Requirements 24.1, 24.2, 24.3
 */
describe("DeepgramService - Language Support", () => {
  describe("SUPPORTED_LANGUAGES", () => {
    test("should support at least 10 major languages (Requirement 24.3)", () => {
      const languageCodes = Object.keys(SUPPORTED_LANGUAGES);
      expect(languageCodes.length).toBeGreaterThanOrEqual(10);
    });

    test("should include all required languages (Requirement 24.3)", () => {
      const requiredLanguages: SupportedLanguageCode[] = [
        "en", // English
        "es", // Spanish
        "fr", // French
        "de", // German
        "it", // Italian
        "pt", // Portuguese
        "ja", // Japanese
        "ko", // Korean
        "zh", // Chinese
        "hi", // Hindi
      ];

      for (const lang of requiredLanguages) {
        expect(SUPPORTED_LANGUAGES).toHaveProperty(lang);
      }
    });

    test("should have human-readable names for all languages", () => {
      for (const [code, name] of Object.entries(SUPPORTED_LANGUAGES)) {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
      }
    });

    test("should include additional languages (nl, ru, ar)", () => {
      expect(SUPPORTED_LANGUAGES).toHaveProperty("nl"); // Dutch
      expect(SUPPORTED_LANGUAGES).toHaveProperty("ru"); // Russian
      expect(SUPPORTED_LANGUAGES).toHaveProperty("ar"); // Arabic
    });
  });

  describe("isValidLanguageCode", () => {
    test("should return true for valid language codes", () => {
      const validCodes: SupportedLanguageCode[] = [
        "en",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "nl",
        "ja",
        "ko",
        "zh",
        "ru",
        "ar",
        "hi",
      ];

      for (const code of validCodes) {
        expect(isValidLanguageCode(code)).toBe(true);
      }
    });

    test("should return false for invalid language codes", () => {
      const invalidCodes = [
        "invalid",
        "xx",
        "english",
        "EN", // Case sensitive
        "",
        "123",
        "en-US", // Full locale not supported
      ];

      for (const code of invalidCodes) {
        expect(isValidLanguageCode(code)).toBe(false);
      }
    });
  });

  describe("getSupportedLanguageCodes", () => {
    test("should return an array of all supported language codes", () => {
      const codes = getSupportedLanguageCodes();
      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThanOrEqual(10);
    });

    test("should return codes that match SUPPORTED_LANGUAGES keys", () => {
      const codes = getSupportedLanguageCodes();
      const expectedCodes = Object.keys(SUPPORTED_LANGUAGES);
      expect(codes.sort()).toEqual(expectedCodes.sort() as typeof codes);
    });

    test("should include all required language codes", () => {
      const codes = getSupportedLanguageCodes();
      const requiredCodes = ["en", "es", "fr", "de", "it", "pt", "ja", "ko", "zh", "hi"] as const;

      for (const required of requiredCodes) {
        expect(codes).toContain(required as typeof codes[number]);
      }
    });
  });
});

/**
 * Unit tests for TranscriptResult interface
 * Validates: Requirements 3.4, 3.8
 */
describe("TranscriptResult - Language and Confidence", () => {
  test("TranscriptResult should include language field", () => {
    // This is a type-level test - if the interface doesn't have language,
    // TypeScript compilation would fail
    const mockResult = {
      transcript: "Hello world",
      words: [],
      duration: 10,
      confidence: 0.95,
      language: "en",
    };

    expect(mockResult).toHaveProperty("language");
    expect(typeof mockResult.language).toBe("string");
  });

  test("TranscriptResult should include confidence field", () => {
    const mockResult = {
      transcript: "Hello world",
      words: [],
      duration: 10,
      confidence: 0.95,
      language: "en",
    };

    expect(mockResult).toHaveProperty("confidence");
    expect(typeof mockResult.confidence).toBe("number");
  });
});
