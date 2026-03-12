import { z } from "zod";
import { aiService } from "./ai.service";

// Platform types for recommendations
const PLATFORM_OPTIONS = [
  "youtube_shorts",
  "instagram_reels",
  "tiktok",
  "linkedin",
  "twitter",
  "facebook_reels",
] as const;

const ViralClipSchema = z.object({
  clips: z.array(
    z.object({
      title: z.string().describe("A catchy title for this viral clip"),
      introTitle: z.string().optional().default("").describe("A short, punchy intro title (max 5-7 words) to display in the first 3 seconds of the video - should hook viewers immediately. Use empty string if not needed."),
      startTime: z.number().describe("Start time in seconds"),
      endTime: z.number().describe("End time in seconds"),
      transcript: z.string().describe("The transcript text for this clip segment"),
      transcriptWithEmojis: z.string().optional().default("").describe("The same transcript but with relevant emojis added naturally throughout to enhance engagement. Use empty string if emojis not needed."),
      viralityScore: z
        .number()
        .min(0)
        .max(100)
        .describe("Virality score from 0-100"),
      viralityReason: z
        .string()
        .optional()
        .default("")
        .describe("Detailed explanation of why this clip would go viral"),
      hooks: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Key hooks or attention-grabbing elements in this clip"),
      emotions: z
        .array(z.string())
        .optional()
        .default([])
        .describe("Primary emotions this clip evokes (e.g., humor, shock, inspiration)"),
      recommendedPlatforms: z
        .array(z.enum(PLATFORM_OPTIONS))
        .optional()
        .default([])
        .describe("Best platforms for this clip based on content style, tone, and audience fit."),
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
  clipType?: string;        // Clip type template ID for targeted detection
  customPrompt?: string;    // Custom prompt for specific moment detection
  language?: string;        // Detected transcript language (e.g. "hi", "en", "ar")
  // Model is configured globally via AI_PROVIDER + AI_MODEL env vars
  // Editing options
  enableEmojis?: boolean;   // Whether to generate transcript with emojis
  enableIntroTitle?: boolean; // Whether to generate intro titles for clips
}

/**
 * Validation result for detection options
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Constants for validation
export const MIN_DURATION_LIMIT = 5;    // Minimum allowed minDuration (seconds)
export const MAX_DURATION_LIMIT = 180;  // Maximum allowed maxDuration (seconds)
export const DEFAULT_MIN_DURATION = 30; // Default minimum clip duration
export const DEFAULT_MAX_DURATION = 90; // Default maximum clip duration
export const DEFAULT_MAX_CLIPS = 10;    // Default maximum clips to detect

// Clip type template prompts for targeted detection
const CLIP_TYPE_PROMPTS: Record<string, string> = {
  "viral-clips": "Focus on finding high-impact, shareable moments that would go viral on social media. Look for strong hooks, emotional peaks, surprising reveals, and quotable soundbites.",
  "memorable-phrases": "Focus on finding the most quotable, shareable phrases and soundbites. Look for memorable one-liners, powerful statements, witty remarks, and phrases people would want to share or use as captions.",
  "topic-clips": "Focus on extracting clips that cover distinct main topics or key points discussed in the video. Each clip should be a self-contained explanation of a specific topic.",
  "trailer": "Create a summarized highlight reel featuring the most catchy, intriguing, and representative moments from the video. Think of it as a movie trailer - tease the best parts to make viewers want to watch the full video.",
  "product-ads": "Focus on moments that showcase products or services in the best light. Look for demonstrations, benefits being explained, before/after comparisons, and compelling calls to action.",
  "testimonial": "Focus on finding genuine testimonial moments - real reactions, endorsements, success stories, and authentic praise for a product, service, or experience.",
  "instructions": "Focus on extracting clear, concise tutorial or how-to segments. Look for step-by-step instructions, tips, tricks, and practical demonstrations that can stand alone as quick tutorials.",
  "product-features": "Focus on moments that highlight specific product features, capabilities, and unique selling points. Each clip should showcase a distinct feature or benefit.",
  "positive-highlights": "Focus exclusively on positive moments - praise, success stories, exciting announcements, achievements, and uplifting content about the main topic.",
  "negative-highlights": "Focus on critical moments - criticisms, problems identified, negative reviews, warnings, and cautionary content about the main topic.",
  "showcase": "Focus on practical use cases and demonstrations that show real-world value. Look for moments where the product/service is being used effectively, solving problems, or delivering results.",
  "multi-product-recap": "Focus on segments that cover different products or items being reviewed/compared. Each clip should highlight a distinct product with its key features and verdict.",
  "speakers-insights": "Focus on the speaker's most insightful, thought-provoking, or relatable opinions and observations. Look for unique perspectives, expert knowledge, and moments of wisdom.",
  "jokes-memes": "Focus on the funniest, most entertaining moments. Look for jokes, funny reactions, awkward moments, meme-worthy content, and anything that would make viewers laugh or share.",
  "podcast-jokes": "Focus on the funniest bits from podcast-style conversations. Look for witty banter, unexpected humor, funny stories, comedic timing, and moments that capture the fun dynamic between speakers.",
};

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
      minDuration,
      maxDuration,
    } = options;

    // Auto mode - no duration constraints, skip validation
    if (minDuration === undefined && maxDuration === undefined) {
      return { valid: true };
    }

    const min = minDuration ?? DEFAULT_MIN_DURATION;
    const max = maxDuration ?? DEFAULT_MAX_DURATION;

    // Requirement 6.4: Minimum duration must be at least 5 seconds
    if (min < MIN_DURATION_LIMIT) {
      return {
        valid: false,
        error: `Minimum duration must be at least ${MIN_DURATION_LIMIT} seconds`,
      };
    }

    // Requirement 6.5: Maximum duration must not exceed 180 seconds
    if (max > MAX_DURATION_LIMIT) {
      return {
        valid: false,
        error: `Maximum duration cannot exceed ${MAX_DURATION_LIMIT} seconds`,
      };
    }

    // Requirement 6.6: Minimum duration must be less than maximum duration
    if (min >= max) {
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
      videoTitle = "Unknown",
      clipType = "viral-clips",
      enableEmojis = false,
      enableIntroTitle = false,
      language = "en",
    } = options;

    const isNonEnglish = language !== "en";
    const languageNote = isNonEnglish
      ? `\nTRANSCRIPT LANGUAGE: The transcript is in "${language}" (non-English). Analyze it as-is - do NOT translate. Return titles and virality reasons in English, but keep transcript/transcriptWithEmojis fields in the original language.\n`
      : "";

    const isAutoMode = options.minDuration === undefined && options.maxDuration === undefined;
    const minDuration = options.minDuration ?? DEFAULT_MIN_DURATION;
    const maxDuration = options.maxDuration ?? DEFAULT_MAX_DURATION;

    console.log(`[VIRAL DETECTION] Analyzing transcript for viral clips...`);
    console.log(`[VIRAL DETECTION] Using AI service (provider configured via env)`);
    console.log(`[VIRAL DETECTION] Transcript length: ${transcript.length} chars`);
    console.log(`[VIRAL DETECTION] Options: clipType=${clipType}, enableEmojis=${enableEmojis}, enableIntroTitle=${enableIntroTitle}, duration=${isAutoMode ? 'AUTO' : `${minDuration}s-${maxDuration}s`}`);

    // Format transcript with timestamps for better context
    const formattedTranscript = this.formatTranscriptWithTimestamps(transcriptWords);

    // Build dynamic prompt sections based on options
    const introTitleSection = enableIntroTitle ? `
INTRO TITLE REQUIREMENTS:
- Create a short, punchy intro title (5-7 words max) for each clip
- This will be displayed as text overlay in the first 3 seconds
- Should immediately hook viewers and make them want to keep watching
- Examples: "Wait for it... 🔥", "This changed everything", "Nobody talks about this"
- Make it intriguing, provocative, or promise value
` : "";

    const emojiSection = enableEmojis ? `
EMOJI ENHANCEMENT REQUIREMENTS:
- Add relevant emojis naturally throughout the transcript
- Place emojis at emotional peaks, key points, or transitions
- Don't overdo it - 3-6 emojis per clip is ideal
- Match emoji to the emotion/content (🔥 for exciting, 😱 for shocking, 💡 for insights, etc.)
- Emojis should enhance, not distract from the message
` : "";

    // Build clip type instruction from template or custom prompt
    const clipTypePrompt = CLIP_TYPE_PROMPTS[clipType] || CLIP_TYPE_PROMPTS["viral-clips"];
    const customPromptText = options.customPrompt?.trim();
    const clipTypeSection = customPromptText
      ? `\nCLIP TYPE FOCUS:\n${customPromptText}\n`
      : `\nCLIP TYPE FOCUS:\n${clipTypePrompt}\n`;

    const systemPrompt = `You are an expert viral clip extractor for short-form video (TikTok, Reels, Shorts).

Extract clips from video transcripts that work as STANDALONE short videos. Each clip must be a complete mini-story - watchable and enjoyable with zero context from the full video.

CLIP STRUCTURE - every clip MUST have all three:
1. HOOK (first 3 seconds): A bold statement, surprising fact, clean question, or compelling setup. The viewer must instantly know what this clip is about.
2. DEVELOPMENT (middle): Builds tension, adds detail, or advances the story.
3. PAYOFF (ending): Delivers a punchline, insight, resolution, or emotional peak. Must be a COMPLETE thought.

OPENING RULES:
- First sentence must establish the clip's topic with zero warm-up.
- NEVER start mid-answer. If the clip contains an answer, include the question that prompted it.
- NEVER open with filler ("So...", "Yeah...", "I mean...", "Like...") - find the clean entry point seconds earlier.
- NEVER open with a response to something outside the clip ("That's a great point", "As I was saying...").
- When in doubt, move startTime earlier to capture the natural lead-in.

ENDING RULES:
- Last sentence must be a COMPLETE, resolved thought - never cut mid-sentence.
- If the speaker says "so basically..." or "the point is..." - include what follows.
- NEVER end on filler ("you know?", "right?", "anyway...") or topic transitions.
- When in doubt, extend endTime to capture the natural conclusion.

CLIP BOUNDARIES:
- Start at the beginning of a topic/story/example. End when it's fully resolved.
- No overlapping clips - each clip must cover a distinct moment.
- Clips must not share more than 5 seconds of content with any other clip.

QUALITY:
- Only include clips scoring >= 60 virality. Quality over quantity.
- Every clip must pass this test: "Would I watch this entire clip on TikTok without scrolling?"
- If only 2 moments are great, return 2 clips. Don't pad.

DURATION: ${isAutoMode
      ? `YOU decide optimal length per clip (15s–180s). Let content dictate duration. Punchy moments = 15-30s, stories/explanations = 1-3min.`
      : `Each clip MUST be ${minDuration}–${maxDuration} seconds (endTime - startTime).`}

TIMESTAMPS: Transcript uses [M:SS] format. Return startTime/endTime in SECONDS (e.g., [1:30] = 90 seconds).
${introTitleSection}${emojiSection}${clipTypeSection}
PLATFORM FIT (recommend for every clip):
- youtube_shorts: Educational, storytelling, broader appeal
- instagram_reels: Lifestyle, aesthetic, trending, aspirational
- tiktok: Trendy, humorous, raw/authentic, fast-paced
- linkedin: Professional insights, business tips, thought leadership
- twitter: Hot takes, controversial opinions, quick wit
- facebook_reels: Family-friendly, relatable, shareable stories${languageNote}`;

    // Build dynamic user prompt based on options (field instructions handled by Zod schema descriptions)

    const userPrompt = `Video: "${videoTitle}"

Extract standalone viral clips from this transcript. Each clip must be self-contained - a viewer with no context should understand and enjoy it.

CHECKLIST (verify for each clip before including):
- [ ] Opens with a clean hook, not mid-conversation or filler
- [ ] If it contains an answer, the question is included
- [ ] Ends on a complete, satisfying thought - not mid-sentence or filler
- [ ] Has clear setup → development → payoff arc
- [ ] No overlap with other clips (max 5s shared content)
- [ ] Virality score >= 60
- [ ] You'd actually watch this on TikTok without scrolling

Return startTime/endTime in SECONDS. Return at least 1 clip if any worthy content exists.

TRANSCRIPT:
${formattedTranscript}`;

    try {
      console.log(`[VIRAL DETECTION] Calling AI (generateObject with Zod schema)...`);
      
      const output = await aiService.generateObject(
        userPrompt,
        {
          schema: ViralClipSchema,
          systemPrompt,
          temperature: 0.3,
          maxTokens: 32000,
        }
      );

      console.log(`[VIRAL DETECTION] Found ${output.clips.length} viral clips`);

      // Log all clip durations for debugging
      const allClipsWithDuration = output.clips.map((clip) => ({
        ...clip,
        duration: clip.endTime - clip.startTime,
      }));
      
      console.log(`[VIRAL DETECTION] Raw clip durations:`, allClipsWithDuration.map(c => 
        `"${c.title.substring(0, 30)}...": ${c.duration.toFixed(1)}s (${c.startTime}-${c.endTime})`
      ));
      
      // Log recommended platforms for debugging
      console.log(`[VIRAL DETECTION] Recommended platforms from AI:`, allClipsWithDuration.map(c => 
        `"${c.title.substring(0, 20)}...": ${JSON.stringify(c.recommendedPlatforms)}`
      ));

      // Filter clips by duration constraints and sort by virality score descending
      let sortedClips;
      
      if (isAutoMode) {
        // Auto mode: enforce min 15s and max 180s, sort by score
        sortedClips = allClipsWithDuration
          .filter((clip) => clip.duration >= 15 && clip.duration <= MAX_DURATION_LIMIT)
          .filter((clip) => clip.viralityScore >= 60)
          .sort((a, b) => b.viralityScore - a.viralityScore);
      } else {
        // Manual mode: filter by duration tolerance
        const toleranceMin = minDuration * 0.8;
        const toleranceMax = maxDuration * 1.2;
        
        sortedClips = allClipsWithDuration
          .filter((clip) => clip.duration >= toleranceMin && clip.duration <= toleranceMax)
          .filter((clip) => clip.viralityScore >= 60)
          .sort((a, b) => b.viralityScore - a.viralityScore);

        // Fallback: if strict filtering returns nothing, take the best clips anyway
        if (sortedClips.length === 0 && allClipsWithDuration.length > 0) {
          console.log(`[VIRAL DETECTION] No clips within duration tolerance, returning best clips regardless`);
          sortedClips = allClipsWithDuration
            .sort((a, b) => b.viralityScore - a.viralityScore);
        }
        
        console.log(`[VIRAL DETECTION] After filtering: ${sortedClips.length} clips (tolerance: ${toleranceMin.toFixed(0)}-${toleranceMax.toFixed(0)}s)`);
      }

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
