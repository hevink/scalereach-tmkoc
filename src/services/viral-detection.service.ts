import { z } from "zod";
import { geminiService, type GeminiModel } from "./gemini.service";

// Platform types for recommendations
const PLATFORM_OPTIONS = [
  "youtube_shorts",
  "instagram_reels",
  "tiktok",
  "linkedin",
  "twitter",
  "facebook_reels",
] as const;

type RecommendedPlatform = (typeof PLATFORM_OPTIONS)[number];

const ViralClipSchema = z.object({
  clips: z.array(
    z.object({
      title: z.string().describe("A catchy title for this viral clip"),
      introTitle: z.string().describe("A short, punchy intro title (max 5-7 words) to display in the first 3 seconds of the video - should hook viewers immediately. Use empty string if not needed."),
      startTime: z.number().describe("Start time in seconds"),
      endTime: z.number().describe("End time in seconds"),
      transcript: z.string().describe("The transcript text for this clip segment"),
      transcriptWithEmojis: z.string().describe("The same transcript but with relevant emojis added naturally throughout to enhance engagement (e.g., 'This is amazing 🔥 and you won't believe 😱 what happens next'). Use empty string if emojis not needed."),
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
      recommendedPlatforms: z
        .array(z.enum(PLATFORM_OPTIONS))
        .min(1)
        .describe("REQUIRED: Best platforms for this clip based on content style, tone, and audience fit. Must include at least 1 platform."),
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
  model?: GeminiModel;      // Gemini model to use (default: gemini-2.5-flash-lite)
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
  "trailer": "Create a summarized highlight reel featuring the most catchy, intriguing, and representative moments from the video. Think of it as a movie trailer — tease the best parts to make viewers want to watch the full video.",
  "product-ads": "Focus on moments that showcase products or services in the best light. Look for demonstrations, benefits being explained, before/after comparisons, and compelling calls to action.",
  "testimonial": "Focus on finding genuine testimonial moments — real reactions, endorsements, success stories, and authentic praise for a product, service, or experience.",
  "instructions": "Focus on extracting clear, concise tutorial or how-to segments. Look for step-by-step instructions, tips, tricks, and practical demonstrations that can stand alone as quick tutorials.",
  "product-features": "Focus on moments that highlight specific product features, capabilities, and unique selling points. Each clip should showcase a distinct feature or benefit.",
  "positive-highlights": "Focus exclusively on positive moments — praise, success stories, exciting announcements, achievements, and uplifting content about the main topic.",
  "negative-highlights": "Focus on critical moments — criticisms, problems identified, negative reviews, warnings, and cautionary content about the main topic.",
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
      clipType = "viral-clips",
      model = "gemini-2.5-flash-lite",
      enableEmojis = false,
      enableIntroTitle = false,
    } = options;

    console.log(`[VIRAL DETECTION] Analyzing transcript for viral clips...`);
    console.log(`[VIRAL DETECTION] Using Gemini model: ${model}`);
    console.log(`[VIRAL DETECTION] Transcript length: ${transcript.length} chars`);
    console.log(`[VIRAL DETECTION] Options: clipType=${clipType}, enableEmojis=${enableEmojis}, enableIntroTitle=${enableIntroTitle}`);

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

    const systemPrompt = `You are an expert viral content analyst specializing in short-form video content for platforms like TikTok, Instagram Reels, and YouTube Shorts.

Your task is to analyze video transcripts and identify the most viral-worthy segments that would perform well as standalone clips.

CRITICAL DURATION REQUIREMENTS:
- Each clip MUST be between ${minDuration} and ${maxDuration} seconds long
- Calculate duration as: endTime - startTime
- If a moment is great but too short, EXTEND it to include more context
- If a moment is great but too long, find the CORE viral moment within it
- REJECT any clip that doesn't meet the duration requirement
${introTitleSection}${emojiSection}${clipTypeSection}
VIRAL CONTENT CRITERIA:
1. **Hook Factor**: Strong opening that grabs attention in first 3 seconds
2. **Emotional Impact**: Evokes strong emotions (humor, shock, inspiration, curiosity)
3. **Shareability**: Content people want to share with others
4. **Relatability**: Universal experiences or feelings
5. **Controversy/Hot Takes**: Bold opinions or unexpected perspectives
6. **Story Arc**: Mini narrative with setup and payoff
7. **Quotable Moments**: Memorable phrases or soundbites
8. **Visual Potential**: Moments that would be engaging to watch

PLATFORM RECOMMENDATION GUIDELINES (REQUIRED FOR EVERY CLIP):
You MUST recommend at least 2-3 platforms for each clip. Choose from:
- **youtube_shorts**: Educational content, tutorials, storytelling, broader audience appeal, longer attention spans
- **instagram_reels**: Lifestyle, aesthetic content, trending audio, visually appealing, aspirational content
- **tiktok**: Trendy, humorous, raw/authentic, younger audience, fast-paced, meme-worthy content
- **linkedin**: Professional insights, business tips, career advice, thought leadership, industry knowledge
- **twitter**: Hot takes, controversial opinions, news commentary, quick wit, conversation starters
- **facebook_reels**: Family-friendly, relatable everyday moments, broader age demographics, shareable stories

A clip can be recommended for multiple platforms if it fits well. NEVER leave recommendedPlatforms empty.

GUIDELINES:
- Clips should be self-contained and make sense without context
- Prioritize moments with high energy, emotion, or insight
- Look for natural start and end points (complete thoughts/sentences)
- Consider what would make someone stop scrolling
- Include enough context before and after the key moment`;

    // Build dynamic user prompt based on options
    const introTitleInstruction = enableIntroTitle 
      ? "2. An intro title (5-7 words max) to display in the first 3 seconds - make it hook viewers immediately\n" 
      : "";
    const emojiInstruction = enableEmojis 
      ? `${enableIntroTitle ? "5" : "4"}. The same transcript but with emojis added naturally (3-6 emojis, placed at emotional peaks)\n` 
      : "";

    const userPrompt = `Analyze this transcript from the video "${videoTitle}" and identify up to ${maxClips} viral clip opportunities.

CRITICAL DURATION REQUIREMENTS:
- Each clip MUST have a duration between ${minDuration}-${maxDuration} seconds
- Duration = endTime - startTime
- The startTime and endTime are in SECONDS (not minutes)
- Example: startTime=30, endTime=60 means a 30-second clip
- Double-check your math: if minDuration is 15, then endTime - startTime must be >= 15
- If a moment is too short, EXTEND it by including more context before/after
- If a moment is too long, find the CORE viral moment within it

TRANSCRIPT WITH TIMESTAMPS:
${formattedTranscript}

For each viral clip, provide:
1. A catchy title that would work as a video caption
${introTitleInstruction}${enableIntroTitle ? "3" : "2"}. Exact start and end times IN SECONDS - MUST result in ${minDuration}-${maxDuration}s duration
${enableIntroTitle ? "4" : "3"}. The transcript segment for that clip
${emojiInstruction}${enableIntroTitle && enableEmojis ? "6" : enableIntroTitle || enableEmojis ? "5" : "4"}. A virality score (0-100) based on viral potential
${enableIntroTitle && enableEmojis ? "7" : enableIntroTitle || enableEmojis ? "6" : "5"}. A detailed reason explaining why this clip would go viral
${enableIntroTitle && enableEmojis ? "8" : enableIntroTitle || enableEmojis ? "7" : "6"}. Key hooks that grab attention
${enableIntroTitle && enableEmojis ? "9" : enableIntroTitle || enableEmojis ? "8" : "7"}. Primary emotions the clip evokes
${enableIntroTitle && enableEmojis ? "10" : enableIntroTitle || enableEmojis ? "9" : "8"}. Recommended platforms (youtube_shorts, instagram_reels, tiktok, linkedin, twitter, facebook_reels)

EXAMPLE OF CORRECT TIMING:
If you want a 30-second clip starting at the 1-minute mark:
- startTime: 60 (seconds)
- endTime: 90 (seconds)
- Duration: 90 - 60 = 30 seconds ✓

REMEMBER: 
- All times are in SECONDS, not minutes
- Verify each clip is ${minDuration}-${maxDuration} seconds before including it
- Focus on finding the absolute BEST moments that would perform well on social media`;

    try {
      console.log(`[VIRAL DETECTION] Calling Gemini API...`);
      
      // Create JSON schema description for Gemini
      const schemaDescription = `{
  "clips": [
    {
      "title": "string - A catchy title for this viral clip",
      "introTitle": "string - A short, punchy intro title (max 5-7 words) to display in the first 3 seconds",
      "startTime": "number - Start time in seconds",
      "endTime": "number - End time in seconds",
      "transcript": "string - The transcript text for this clip segment",
      "transcriptWithEmojis": "string - The same transcript but with relevant emojis added naturally",
      "viralityScore": "number - Virality score from 0-100",
      "viralityReason": "string - Detailed explanation of why this clip would go viral",
      "hooks": ["string array - Key hooks or attention-grabbing elements"],
      "emotions": ["string array - Primary emotions this clip evokes"],
      "recommendedPlatforms": ["string array - Must include at least 1 platform from: youtube_shorts, instagram_reels, tiktok, linkedin, twitter, facebook_reels"]
    }
  ]
}`;

      const responseText = await geminiService.generateJSON<{ clips: ViralClip[] }>(
        userPrompt,
        {
          model,
          systemPrompt,
          temperature: 0.7,
          // maxTokens not specified - will use model's maximum (8192)
          schema: schemaDescription,
        }
      );

      if (!responseText || !responseText.clips) {
        throw new Error("No clips generated from model");
      }

      const output = responseText;
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
      // Validates: Requirements 5.6, 5.9
      const sortedClips = allClipsWithDuration
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
