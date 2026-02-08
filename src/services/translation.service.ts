import { TranslatedWord } from "../db/schema/translation.schema";

/**
 * Supported target languages for translation
 */
export const TRANSLATION_LANGUAGES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  tr: "Turkish",
  pl: "Polish",
  cs: "Czech",
  sv: "Swedish",
  da: "Danish",
  nb: "Norwegian",
  fi: "Finnish",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  uk: "Ukrainian",
  ro: "Romanian",
  hu: "Hungarian",
  el: "Greek",
} as const;

export type TranslationLanguageCode = keyof typeof TRANSLATION_LANGUAGES;

interface TranslateTextResult {
  translatedText: string;
  detectedSourceLanguage?: string;
}

/**
 * TranslationService - handles text translation via DeepL API
 * and timing re-alignment for translated captions
 */
export class TranslationService {
  private static DEEPL_API_URL =
    process.env.DEEPL_API_URL || "https://api-free.deepl.com";

  private static getApiKey(): string {
    const key = process.env.DEEPL_API_KEY;
    if (!key) {
      throw new Error("DEEPL_API_KEY environment variable is not set");
    }
    return key;
  }

  /**
   * Translate text using DeepL API
   */
  static async translateText(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<TranslateTextResult> {
    console.log(
      `[TRANSLATION] Translating ${text.length} chars from ${sourceLang} to ${targetLang}`
    );

    const apiKey = this.getApiKey();

    const response = await fetch(`${this.DEEPL_API_URL}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLang.toUpperCase(),
        target_lang: this.mapToDeepLLang(targetLang),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[TRANSLATION] DeepL API error: ${response.status} ${errorBody}`);
      throw new Error(`DeepL translation failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      translations: Array<{
        text: string;
        detected_source_language?: string;
      }>;
    };

    const result = data.translations[0];
    console.log(
      `[TRANSLATION] Translation complete: ${result.text.length} chars output`
    );

    return {
      translatedText: result.text,
      detectedSourceLanguage: result.detected_source_language?.toLowerCase(),
    };
  }

  /**
   * Translate a batch of texts
   */
  static async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<string[]> {
    console.log(
      `[TRANSLATION] Batch translating ${texts.length} texts from ${sourceLang} to ${targetLang}`
    );

    const apiKey = this.getApiKey();

    const response = await fetch(`${this.DEEPL_API_URL}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: texts,
        source_lang: sourceLang.toUpperCase(),
        target_lang: this.mapToDeepLLang(targetLang),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[TRANSLATION] DeepL batch error: ${response.status} ${errorBody}`);
      throw new Error(`DeepL batch translation failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      translations: Array<{ text: string }>;
    };

    return data.translations.map((t) => t.text);
  }

  /**
   * Translate transcript words and re-align timing
   *
   * Strategy:
   * 1. Group original words into sentence-like segments (by punctuation)
   * 2. Translate each segment to preserve context
   * 3. Re-distribute translated words proportionally within each segment's time range
   */
  static async translateTranscript(
    words: Array<{ word: string; start: number; end: number }>,
    sourceLang: string,
    targetLang: string
  ): Promise<{ translatedText: string; translatedWords: TranslatedWord[] }> {
    console.log(
      `[TRANSLATION] Translating transcript: ${words.length} words from ${sourceLang} to ${targetLang}`
    );

    // Group words into segments by sentence boundaries
    const segments = this.groupIntoSegments(words);
    console.log(`[TRANSLATION] Grouped into ${segments.length} segments`);

    // Extract segment texts for batch translation
    const segmentTexts = segments.map((seg) =>
      seg.words.map((w) => w.word).join(" ")
    );

    // Batch translate all segments
    const translatedTexts = await this.translateBatch(
      segmentTexts,
      sourceLang,
      targetLang
    );

    // Re-align translated words to original timing
    const translatedWords: TranslatedWord[] = [];
    let fullTranslatedText = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const translatedText = translatedTexts[i];
      const segmentStart = segment.words[0].start;
      const segmentEnd = segment.words[segment.words.length - 1].end;
      const segmentDuration = segmentEnd - segmentStart;

      // Split translated text into words
      const newWords = translatedText.split(/\s+/).filter((w) => w.length > 0);

      if (newWords.length === 0) continue;

      // Distribute translated words proportionally across the segment time range
      const wordDuration = segmentDuration / newWords.length;
      const minDuration = 0.15; // minimum 150ms per word

      for (let j = 0; j < newWords.length; j++) {
        const start = segmentStart + j * Math.max(wordDuration, minDuration);
        const end = Math.min(
          start + Math.max(wordDuration, minDuration),
          segmentEnd
        );

        translatedWords.push({
          word: newWords[j],
          start: Math.round(start * 1000) / 1000,
          end: Math.round(end * 1000) / 1000,
        });
      }

      fullTranslatedText += (fullTranslatedText ? " " : "") + translatedText;
    }

    console.log(
      `[TRANSLATION] Re-aligned ${translatedWords.length} translated words`
    );

    return {
      translatedText: fullTranslatedText,
      translatedWords,
    };
  }

  /**
   * Group words into segments by sentence boundaries (punctuation)
   */
  private static groupIntoSegments(
    words: Array<{ word: string; start: number; end: number }>
  ): Array<{ words: Array<{ word: string; start: number; end: number }> }> {
    const segments: Array<{
      words: Array<{ word: string; start: number; end: number }>;
    }> = [];
    let currentSegment: Array<{ word: string; start: number; end: number }> = [];

    for (const word of words) {
      currentSegment.push(word);

      // Split on sentence-ending punctuation or after ~15 words
      const isSentenceEnd = /[.!?;]$/.test(word.word);
      if (isSentenceEnd || currentSegment.length >= 15) {
        segments.push({ words: [...currentSegment] });
        currentSegment = [];
      }
    }

    // Push remaining words
    if (currentSegment.length > 0) {
      segments.push({ words: currentSegment });
    }

    return segments;
  }

  /**
   * Get language-specific caption style overrides
   * (e.g., CJK needs fewer words per line, RTL needs right alignment)
   */
  static getLanguageStyleOverrides(
    targetLang: string
  ): Partial<{ wordsPerLine: number; alignment: "left" | "center" | "right"; fontFamily: string }> {
    const cjkLangs = ["ja", "ko", "zh"];
    const rtlLangs = ["ar", "he"];

    if (cjkLangs.includes(targetLang)) {
      return {
        wordsPerLine: 3,
        fontFamily: "Noto Sans CJK",
      };
    }

    if (rtlLangs.includes(targetLang)) {
      return {
        alignment: "right",
        fontFamily: "Noto Sans Arabic",
      };
    }

    if (targetLang === "hi") {
      return {
        fontFamily: "Noto Sans Devanagari",
      };
    }

    return {};
  }

  /**
   * Map language codes to DeepL format
   * DeepL uses uppercase codes and some differ from ISO 639-1
   */
  private static mapToDeepLLang(lang: string): string {
    const mapping: Record<string, string> = {
      en: "EN",
      es: "ES",
      fr: "FR",
      de: "DE",
      it: "IT",
      pt: "PT",
      nl: "NL",
      ja: "JA",
      ko: "KO",
      zh: "ZH",
      ru: "RU",
      ar: "AR",
      hi: "HI",
      tr: "TR",
      pl: "PL",
      cs: "CS",
      sv: "SV",
      da: "DA",
      nb: "NB",
      fi: "FI",
      el: "EL",
      hu: "HU",
      ro: "RO",
      uk: "UK",
      id: "ID",
      ms: "MS",
      th: "TH",
      vi: "VI",
    };
    return mapping[lang.toLowerCase()] || lang.toUpperCase();
  }

  /**
   * Get list of supported translation languages
   */
  static getSupportedLanguages() {
    return Object.entries(TRANSLATION_LANGUAGES).map(([code, name]) => ({
      code,
      name,
    }));
  }

  /**
   * Check if a language code is supported for translation
   */
  static isSupported(lang: string): boolean {
    return lang.toLowerCase() in TRANSLATION_LANGUAGES;
  }
}
