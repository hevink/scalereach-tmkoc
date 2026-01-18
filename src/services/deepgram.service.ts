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
   */
  static async transcribeFromUrl(audioUrl: string): Promise<TranscriptResult> {
    console.log(`[DEEPGRAM] Transcribing from URL: ${audioUrl}`);

    const client = this.getClient();

    const { result, error } = await client.listen.prerecorded.transcribeUrl(
      { url: audioUrl },
      {
        model: "nova-2",
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
        diarize: true,
      }
    );

    if (error) {
      console.error(`[DEEPGRAM] Transcription error:`, error);
      throw new Error(`Deepgram transcription failed: ${error.message}`);
    }

    return this.parseResult(result);
  }

  /**
   * Transcribe audio from a buffer
   */
  static async transcribeFromBuffer(
    buffer: Buffer,
    mimeType: string = "audio/m4a"
  ): Promise<TranscriptResult> {
    console.log(`[DEEPGRAM] Transcribing from buffer (${buffer.length} bytes)`);

    const client = this.getClient();

    const { result, error } = await client.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: "nova-2",
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
        diarize: true,
        mimetype: mimeType,
      }
    );

    if (error) {
      console.error(`[DEEPGRAM] Transcription error:`, error);
      throw new Error(`Deepgram transcription failed: ${error.message}`);
    }

    return this.parseResult(result);
  }

  /**
   * Transcribe audio from a readable stream
   */
  static async transcribeFromStream(
    stream: Readable,
    mimeType: string = "audio/m4a"
  ): Promise<TranscriptResult> {
    console.log(`[DEEPGRAM] Transcribing from stream`);

    // Collect stream into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return this.transcribeFromBuffer(buffer, mimeType);
  }

  /**
   * Parse Deepgram response into our format
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

    console.log(
      `[DEEPGRAM] Transcription complete: ${words.length} words, ${duration.toFixed(1)}s duration`
    );

    return {
      transcript,
      words,
      duration,
      confidence,
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
