/**
 * Emoji Timing Extraction Utility
 * Extracts emojis from transcriptWithEmojis and matches them
 * to word timestamps from captions for animated overlay rendering.
 */

const EMOJI_REGEX = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;

export interface EmojiOverlay {
  emoji: string;
  timestamp: number;
  duration: number;
  positionIndex: number;
}

/**
 * Extract emojis from transcriptWithEmojis and match them to word timestamps.
 *
 * Algorithm:
 * 1. Walk through the text, counting plain words
 * 2. When an emoji is found, anchor it to the preceding word's end time
 * 3. Return timed emoji overlays
 */
export function extractEmojiTimings(
  transcriptWithEmojis: string,
  words: Array<{ word: string; start: number; end: number }>
): EmojiOverlay[] {
  if (!transcriptWithEmojis || !words || words.length === 0) return [];

  const emojis: EmojiOverlay[] = [];

  // Split text into tokens: words and emojis
  // Replace emojis with a placeholder to count word positions
  const textWithoutEmojis = transcriptWithEmojis.replace(EMOJI_REGEX, " \0 ");
  const tokens = transcriptWithEmojis.split(/\s+/).filter(Boolean);

  let wordIndex = -1;
  let positionIndex = 0;

  for (const token of tokens) {
    // Check if this token contains an emoji
    const emojiMatches = token.match(EMOJI_REGEX);
    // Check if this token has non-emoji text (it's a word)
    const plainText = token.replace(EMOJI_REGEX, "").trim();

    if (plainText.length > 0) {
      wordIndex++;
    }

    if (emojiMatches) {
      for (const emoji of emojiMatches) {
        // Anchor to the preceding word's end time, or first word's start
        const anchorWord = wordIndex >= 0 && wordIndex < words.length
          ? words[wordIndex]
          : wordIndex >= words.length
            ? words[words.length - 1]
            : words[0];

        const timestamp = wordIndex >= 0 ? anchorWord.end : anchorWord.start;

        emojis.push({
          emoji,
          timestamp,
          duration: 1.5,
          positionIndex: positionIndex++,
        });
      }
    }
  }

  return emojis;
}
