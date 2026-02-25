import { createClient, DeepgramClient } from "@deepgram/sdk";
import { Readable } from "stream";

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface TranscriptResult {
  transcript: string;
  words: TranscriptWord[];
  duration: number;
  confidence: number;
  language: string;
}

/**
 * Supported languages for transcription
 * All languages require nova-3 model (default). nova-2 only supports a subset.
 * Validates: Requirements 24.1, 24.2, 24.3
 */
export const SUPPORTED_LANGUAGES = {
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
  uk: "Ukrainian",
  id: "Indonesian",
  vi: "Vietnamese",
  ta: "Tamil",
  te: "Telugu",
  bn: "Bengali",
  ur: "Urdu",
  multi: "Multilingual (e.g. Hindi + English)",
} as const;

export type SupportedLanguageCode = keyof typeof SUPPORTED_LANGUAGES;

/**
 * Options for transcription
 */
export interface TranscriptionOptions {
  /** 
   * Language code for transcription. If not provided, automatic language detection is used.
   * Validates: Requirements 24.1, 24.2
   */
  language?: SupportedLanguageCode;
  /** Model to use for transcription */
  model?: "nova-3" | "nova-2" | "nova" | "enhanced";
  /** Enable punctuation */
  punctuate?: boolean;
  /** Enable speaker diarization */
  diarize?: boolean;
}

/**
 * Validates if a language code is supported
 */
export function isValidLanguageCode(code: string): code is SupportedLanguageCode {
  return code in SUPPORTED_LANGUAGES;
}

/**
 * Get the list of supported language codes
 */
export function getSupportedLanguageCodes(): SupportedLanguageCode[] {
  return Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguageCode[];
}

export class DeepgramService {
  private static client: DeepgramClient | null = null;

  private static getClient(): DeepgramClient {
    if (!this.client) {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        throw new Error("DEEPGRAM_API_KEY environment variable is not set");
      }
      this.client = createClient(apiKey);
    }
    return this.client;
  }

  /**
   * Transcribe audio from a URL
   * Validates: Requirements 24.1, 24.2, 24.3, 24.4
   */
  static async transcribeFromUrl(
    audioUrl: string,
    options?: TranscriptionOptions
  ): Promise<TranscriptResult> {
    console.log(`[DEEPGRAM] Transcribing from URL: ${audioUrl}`);
    if (options?.language) {
      console.log(`[DEEPGRAM] Using manual language selection: ${options.language}`);
    } else {
      console.log(`[DEEPGRAM] Using automatic language detection`);
    }

    const client = this.getClient();

    // Build transcription options
    const transcriptionConfig: Record<string, any> = {
      model: options?.model || "nova-3",
      smart_format: true,
      punctuate: options?.punctuate !== false,
      paragraphs: true,
      utterances: true,
      diarize: options?.diarize !== false,
    };

    // If language is specified, use it; otherwise use detect_language for best results
    if (options?.language && isValidLanguageCode(options.language)) {
      if (options.language === "multi") {
        transcriptionConfig.language = "multi";
        console.log(`[DEEPGRAM] Using multilingual mode (code-switching)`);
      } else {
        transcriptionConfig.language = options.language;
        console.log(`[DEEPGRAM] Language set to: ${options.language} (${SUPPORTED_LANGUAGES[options.language]})`);
      }
    } else {
      // Auto-detect with nova-3
      transcriptionConfig.detect_language = true;
      console.log(`[DEEPGRAM] Using auto language detection (nova-3)`);
    }

    const { result, error } = await client.listen.prerecorded.transcribeUrl(
      { url: audioUrl },
      transcriptionConfig
    );

    if (error) {
      console.error(`[DEEPGRAM] Transcription error:`, error);
      throw new Error(`Deepgram transcription failed: ${error.message}`);
    }

    return this.parseResult(result);
  }

  /**
   * Transcribe audio from a buffer
   * Validates: Requirements 24.1, 24.2, 24.3, 24.4
   */
  static async transcribeFromBuffer(
    buffer: Buffer,
    mimeType: string = "audio/m4a",
    options?: TranscriptionOptions
  ): Promise<TranscriptResult> {
    console.log(`[DEEPGRAM] Transcribing from buffer (${buffer.length} bytes)`);
    if (options?.language) {
      console.log(`[DEEPGRAM] Using manual language selection: ${options.language}`);
    } else {
      console.log(`[DEEPGRAM] Using automatic language detection`);
    }

    const client = this.getClient();

    // Build transcription options
    const transcriptionConfig: Record<string, any> = {
      model: options?.model || "nova-3",
      smart_format: true,
      punctuate: options?.punctuate !== false,
      paragraphs: true,
      utterances: true,
      diarize: options?.diarize !== false,
      mimetype: mimeType,
    };

    // If language is specified, use it; otherwise use detect_language for best results
    if (options?.language && isValidLanguageCode(options.language)) {
      if (options.language === "multi") {
        transcriptionConfig.language = "multi";
        console.log(`[DEEPGRAM] Using multilingual mode (code-switching)`);
      } else {
        transcriptionConfig.language = options.language;
        console.log(`[DEEPGRAM] Language set to: ${options.language} (${SUPPORTED_LANGUAGES[options.language]})`);
      }
    } else {
      // Auto-detect with nova-3
      transcriptionConfig.detect_language = true;
      console.log(`[DEEPGRAM] Using auto language detection (nova-3)`);
    }

    const { result, error } = await client.listen.prerecorded.transcribeFile(
      buffer,
      transcriptionConfig
    );

    if (error) {
      console.error(`[DEEPGRAM] Transcription error:`, error);
      throw new Error(`Deepgram transcription failed: ${error.message}`);
    }

    return this.parseResult(result);
  }

  /**
   * Transcribe audio from a readable stream
   * Validates: Requirements 24.1, 24.2, 24.3, 24.4
   */
  static async transcribeFromStream(
    stream: Readable,
    mimeType: string = "audio/m4a",
    options?: TranscriptionOptions
  ): Promise<TranscriptResult> {
    console.log(`[DEEPGRAM] Transcribing from stream`);

    // Collect stream into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return this.transcribeFromBuffer(buffer, mimeType, options);
  }

  /**
   * Parse Deepgram response into our format
   * Extracts detected language from response
   */
  private static parseResult(result: any): TranscriptResult {
    const channel = result.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];

    if (!alternative) {
      throw new Error("No transcription results found");
    }

    const words: TranscriptWord[] = (alternative.words || []).map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
    }));

    const transcript = alternative.transcript || "";
    const confidence = alternative.confidence || 0;
    const duration = result.metadata?.duration || 0;

    // Extract detected language from response
    let language = "en";
    if (channel?.detected_language) {
      language = channel.detected_language;
    } else if (alternative?.languages && alternative.languages.length > 0) {
      language = alternative.languages[0];
    } else if (result.metadata?.detected_language) {
      language = result.metadata.detected_language;
    } else if (result.metadata?.model_info?.language) {
      language = result.metadata.model_info.language;
    }

    console.log(
      `[DEEPGRAM] Transcription complete: ${words.length} words, ${duration.toFixed(1)}s duration, language: ${language}, confidence: ${confidence.toFixed(3)}`
    );

    return {
      transcript,
      words,
      duration,
      confidence,
      language,
    };
  }

  /**
   * Format transcript with timestamps for LLM analysis
   */
  static formatForLLM(result: TranscriptResult): string {
    const segments: string[] = [];
    let currentSegment = "";
    let segmentStart = 0;
    let wordCount = 0;

    for (const word of result.words) {
      if (wordCount === 0) {
        segmentStart = word.start;
      }

      currentSegment += (currentSegment ? " " : "") + word.word;
      wordCount++;

      // Create segments of ~20 words or at sentence end
      const isSentenceEnd = /[.!?]$/.test(word.word);
      if (wordCount >= 20 || isSentenceEnd) {
        const timestamp = this.formatTimestamp(segmentStart);
        segments.push(`[${timestamp}] ${currentSegment}`);
        currentSegment = "";
        wordCount = 0;
      }
    }

    // Add remaining words
    if (currentSegment) {
      const timestamp = this.formatTimestamp(segmentStart);
      segments.push(`[${timestamp}] ${currentSegment}`);
    }

    return segments.join("\n");
  }

  /**
   * Format seconds to MM:SS or HH:MM:SS
   */
  static formatTimestamp(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Get word-level timestamps for a specific time range
   */
  static getWordsInRange(
    result: TranscriptResult,
    startTime: number,
    endTime: number
  ): TranscriptWord[] {
    return result.words.filter(
      (word) => word.start >= startTime && word.end <= endTime
    );
  }

  /**
   * Get transcript text for a specific time range
   */
  static getTranscriptInRange(
    result: TranscriptResult,
    startTime: number,
    endTime: number
  ): string {
    const words = this.getWordsInRange(result, startTime, endTime);
    return words.map((w) => w.word).join(" ");
  }
}
