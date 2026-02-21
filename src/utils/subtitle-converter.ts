/**
 * Utility functions to convert caption words to various subtitle formats
 */

export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Format seconds to SRT timestamp (HH:MM:SS,mmm)
 */
function formatSRTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${millis.toString().padStart(3, "0")}`;
}

/**
 * Format seconds to VTT timestamp (HH:MM:SS.mmm)
 */
function formatVTTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

/**
 * Group words into caption segments (max 10 words or 3 seconds per segment)
 */
function groupWordsIntoSegments(words: CaptionWord[]): Array<{
  text: string;
  start: number;
  end: number;
}> {
  if (!words || words.length === 0) return [];

  const segments: Array<{ text: string; start: number; end: number }> = [];
  let currentSegment: string[] = [];
  let segmentStart = words[0].start;
  let segmentEnd = words[0].end;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentSegment.push(word.word);
    segmentEnd = word.end;

    // Create new segment if we have 10 words or 3 seconds duration
    const shouldBreak =
      currentSegment.length >= 10 ||
      segmentEnd - segmentStart >= 3 ||
      i === words.length - 1;

    if (shouldBreak) {
      segments.push({
        text: currentSegment.join(" "),
        start: segmentStart,
        end: segmentEnd,
      });

      // Start new segment
      if (i < words.length - 1) {
        currentSegment = [];
        segmentStart = words[i + 1].start;
        segmentEnd = words[i + 1].end;
      }
    }
  }

  return segments;
}

/**
 * Convert caption words to SRT format
 */
export function convertToSRT(words: CaptionWord[]): string {
  const segments = groupWordsIntoSegments(words);
  
  return segments
    .map((segment, index) => {
      const startTime = formatSRTTimestamp(segment.start);
      const endTime = formatSRTTimestamp(segment.end);
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`;
    })
    .join("\n");
}

/**
 * Convert caption words to VTT format
 */
export function convertToVTT(words: CaptionWord[]): string {
  const segments = groupWordsIntoSegments(words);
  
  const vttContent = segments
    .map((segment) => {
      const startTime = formatVTTTimestamp(segment.start);
      const endTime = formatVTTTimestamp(segment.end);
      return `${startTime} --> ${endTime}\n${segment.text}`;
    })
    .join("\n\n");

  return `WEBVTT\n\n${vttContent}`;
}

/**
 * Convert caption words to plain text
 */
export function convertToText(words: CaptionWord[]): string {
  return words.map((w) => w.word).join(" ");
}

/**
 * Convert caption words to JSON format
 */
export function convertToJSON(words: CaptionWord[]): string {
  return JSON.stringify(words, null, 2);
}
