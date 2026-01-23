import { generateText, Output } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";

// Groq configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// Create Groq client
const groq = createGroq({
  apiKey: GROQ_API_KEY,
});

// Log configuration on startup (without exposing the key)
console.log(`[VIRAL DETECTION] Groq configured:`);
console.log(`  - API Key: ${GROQ_API_KEY ? "***set***" : "NOT SET"}`);

const ViralClipSchema = z.object({
  clips: z.array(
    z.object({
      title: z.string().describe("A catchy title for this viral clip"),
      startTime: z.number().describe("Start time in seconds"),
      endTime: z.number().describe("End time in seconds"),
      transcript: z.string().describe("The transcript text for this clip segment"),
      viralityScore: z
        .number()
        .min(0)
        .max(100)
        .describe("Virality score from 0-100"),
      viralityReason: z
        .string()
        .describe("Detailed explanation of why this clip would go viral"),
      hooks: z
        .array(z.string())
        .describe("Key hooks or attention-grabbing elements in this clip"),
      emotions: z
        .array(z.string())
        .describe("Primary emotions this clip evokes (e.g., humor, shock, inspiration)"),
    })
  ).describe("Array of viral clip opportunities"),
});

export type ViralClip = z.infer<typeof ViralClipSchema>["clips"][number];

export interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
}

/**
 * Viral detection configuration options
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export interface ViralDetectionOptions {
  maxClips?: number;        // Maximum number of clips to detect (default: 10)
  minDuration?: number;     // Minimum clip duration in seconds (default: 15, min: 10)
  maxDuration?: number;     // Maximum clip duration in seconds (default: 60, max: 90)
  videoTitle?: string;      // Video title for context
  genre?: string;           // Content genre for better detection (Auto, Podcast, Gaming, etc.)
  customPrompt?: string;    // Custom prompt for specific moment detection
}

/**
 * Validation result for detection options
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Constants for validation
export const MIN_DURATION_LIMIT = 10;   // Minimum allowed minDuration (seconds)
export const MAX_DURATION_LIMIT = 90;   // Maximum allowed maxDuration (seconds)
export const DEFAULT_MIN_DURATION = 15; // Default minimum clip duration
export const DEFAULT_MAX_DURATION = 60; // Default maximum clip duration
export const DEFAULT_MAX_CLIPS = 10;    // Default maximum clips to detect

export class ViralDetectionService {
  /**
   * Validate viral detection configuration options
   * Validates: Requirements 6.4, 6.5, 6.6
   * 
   * @param options - Detection options to validate
   * @returns ValidationResult with valid flag and optional error message
   */
  static validateOptions(options: ViralDetectionOptions): ValidationResult {
    const {
      minDuration = DEFAULT_MIN_DURATION,
      maxDuration = DEFAULT_MAX_DURATION,
    } = options;

    // Requirement 6.4: Minimum duration must be at least 10 seconds
    if (minDuration < MIN_DURATION_LIMIT) {
      return {
        valid: false,
        error: `Minimum duration must be at least ${MIN_DURATION_LIMIT} seconds`,
      };
    }

    // Requirement 6.5: Maximum duration must not exceed 90 seconds
    if (maxDuration > MAX_DURATION_LIMIT) {
      return {
        valid: false,
        error: `Maximum duration cannot exceed ${MAX_DURATION_LIMIT} seconds`,
      };
    }

    // Requirement 6.6: Minimum duration must be less than maximum duration
    if (minDuration >= maxDuration) {
      return {
        valid: false,
        error: "Minimum duration must be less than maximum duration",
      };
    }

    return { valid: true };
  }

  /**
   * Analyze transcript and detect viral clip opportunities
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9
   * Validates: Requirements 6.1, 6.2, 6.3
   */
  static async detectViralClips(
    transcript: string,
    transcriptWords: { word: string; start: number; end: number }[],
    options: ViralDetectionOptions = {}
  ): Promise<ViralClip[]> {
    // Validate options first
    const validation = this.validateOptions(options);
    if (!validation.valid) {
      throw new Error(`Invalid detection options: ${validation.error}`);
    }

    const {
      maxClips = DEFAULT_MAX_CLIPS,
      minDuration = DEFAULT_MIN_DURATION,
      maxDuration = DEFAULT_MAX_DURATION,
      videoTitle = "Unknown",
    } = options;

    console.log(`[VIRAL DETECTION] Analyzing transcript for viral clips...`);
    console.log(`[VIRAL DETECTION] Transcript length: ${transcript.length} chars`);

    // Format transcript with timestamps for better context
    const formattedTranscript = this.formatTranscriptWithTimestamps(transcriptWords);

    const systemPrompt = `You are an expert viral content analyst specializing in short-form video content for platforms like TikTok, Instagram Reels, and YouTube Shorts.

Your task is to analyze video transcripts and identify the most viral-worthy segments that would perform well as standalone clips.

VIRAL CONTENT CRITERIA:
1. **Hook Factor**: Strong opening that grabs attention in first 3 seconds
2. **Emotional Impact**: Evokes strong emotions (humor, shock, inspiration, curiosity)
3. **Shareability**: Content people want to share with others
4. **Relatability**: Universal experiences or feelings
5. **Controversy/Hot Takes**: Bold opinions or unexpected perspectives
6. **Story Arc**: Mini narrative with setup and payoff
7. **Quotable Moments**: Memorable phrases or soundbites
8. **Visual Potential**: Moments that would be engaging to watch

GUIDELINES:
- Each clip should be ${minDuration}-${maxDuration} seconds long
- Clips should be self-contained and make sense without context
- Prioritize moments with high energy, emotion, or insight
- Look for natural start and end points
- Consider what would make someone stop scrolling`;

    const userPrompt = `Analyze this transcript from the video "${videoTitle}" and identify up to ${maxClips} viral clip opportunities.

TRANSCRIPT WITH TIMESTAMPS:
${formattedTranscript}

For each viral clip, provide:
1. A catchy title that would work as a video caption
2. Exact start and end times (in seconds)
3. The transcript segment for that clip
4. A virality score (0-100) based on viral potential
5. A detailed reason explaining why this clip would go viral
6. Key hooks that grab attention
7. Primary emotions the clip evokes

Focus on finding the absolute BEST moments that would perform well on social media.`;

    try {
      console.log(`[VIRAL DETECTION] Using Groq with mixtral-8x7b-32768`);
      
      const { output } = await generateText({
        model: groq("openai/gpt-oss-20b"),
        output: Output.object({
          name: "ViralClips",
          description: "Viral clip opportunities detected from video transcript",
          schema: ViralClipSchema,
        }),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
      });

      if (!output) {
        throw new Error("No output generated from model");
      }

      console.log(`[VIRAL DETECTION] Found ${output.clips.length} viral clips`);

      // Filter clips by duration constraints and sort by virality score descending
      // Validates: Requirements 5.6, 5.9
      const sortedClips = output.clips
        .map((clip) => ({
          ...clip,
          // Calculate duration
          duration: clip.endTime - clip.startTime,
        }))
        .filter((clip) => clip.duration >= minDuration && clip.duration <= maxDuration)
        .sort((a, b) => b.viralityScore - a.viralityScore)
        .slice(0, maxClips); // Limit to maxClips (Requirement 5.2)

      console.log(`[VIRAL DETECTION] After filtering: ${sortedClips.length} clips within duration constraints`);

      return sortedClips;
    } catch (error) {
      console.error(`[VIRAL DETECTION] Error analyzing transcript:`, error);
      throw error;
    }
  }

  /**
   * Format transcript words into timestamped segments
   */
  private static formatTranscriptWithTimestamps(
    words: { word: string; start: number; end: number }[]
  ): string {
    const segments: string[] = [];
    let currentSegment = "";
    let segmentStart = 0;
    let wordCount = 0;

    for (const word of words) {
      if (wordCount === 0) {
        segmentStart = word.start;
      }

      currentSegment += (currentSegment ? " " : "") + word.word;
      wordCount++;

      // Create segments of ~15 words or at sentence end
      const isSentenceEnd = /[.!?]$/.test(word.word);
      if (wordCount >= 15 || isSentenceEnd) {
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
   * Format seconds to MM:SS
   */
  private static formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Get transcript text for a specific time range
   */
  static getTranscriptForRange(
    words: { word: string; start: number; end: number }[],
    startTime: number,
    endTime: number
  ): string {
    return words
      .filter((w) => w.start >= startTime && w.end <= endTime)
      .map((w) => w.word)
      .join(" ");
  }
}
