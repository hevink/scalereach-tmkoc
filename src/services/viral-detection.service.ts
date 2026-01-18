import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

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
  ),
});

export type ViralClip = z.infer<typeof ViralClipSchema>["clips"][number];

export interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
}

export class ViralDetectionService {
  /**
   * Analyze transcript and detect viral clip opportunities
   */
  static async detectViralClips(
    transcript: string,
    transcriptWords: { word: string; start: number; end: number }[],
    options: {
      maxClips?: number;
      minDuration?: number;
      maxDuration?: number;
      videoTitle?: string;
    } = {}
  ): Promise<ViralClip[]> {
    const {
      maxClips = 5,
      minDuration = 15,
      maxDuration = 60,
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
      const { object } = await generateObject({
        model: openai("gpt-4o"),
        schema: ViralClipSchema,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.7,
      });

      console.log(`[VIRAL DETECTION] Found ${object.clips.length} viral clips`);

      // Sort by virality score descending
      const sortedClips = object.clips
        .map((clip) => ({
          ...clip,
          // Calculate duration
          duration: clip.endTime - clip.startTime,
        }))
        .filter((clip) => clip.duration >= minDuration && clip.duration <= maxDuration)
        .sort((a, b) => b.viralityScore - a.viralityScore);

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
