import { Context } from "hono";
import { VideoModel } from "../models/video.model";
import {
  TranscriptValidationService,
  type TranscriptWord,
} from "../services/transcript-validation.service";

// Re-export TranscriptWord for external use
export type { TranscriptWord } from "../services/transcript-validation.service";

/**
 * Transcript Controller
 * Handles transcript retrieval and editing operations
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 */
export class TranscriptController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[TRANSCRIPT CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * GET /api/videos/:id/transcript
   * Retrieve transcript with word-level timestamps
   * Validates: Requirement 4.1
   */
  static async getTranscript(c: Context) {
    const videoId = c.req.param("id");
    TranscriptController.logRequest(c, "GET_TRANSCRIPT", { videoId });

    try {
      const video = await VideoModel.getById(videoId);

      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Convert transcriptWords to segments for frontend
      const transcriptWords = (video.transcriptWords as TranscriptWord[]) || [];
      const segments = TranscriptController.wordsToSegments(transcriptWords);

      // Return transcript data with timestamps
      return c.json({
        videoId: video.id,
        transcript: video.transcript || "",
        transcriptWords: transcriptWords,
        transcriptLanguage: video.transcriptLanguage || null,
        transcriptConfidence: video.transcriptConfidence || null,
        duration: video.duration || null,
        segments: segments,
      });
    } catch (error) {
      console.error(`[TRANSCRIPT CONTROLLER] GET_TRANSCRIPT error:`, error);
      return c.json({ error: "Failed to fetch transcript" }, 500);
    }
  }

  /**
   * Convert flat word array to segments (grouped by ~10 words or sentence boundaries)
   */
  private static wordsToSegments(words: TranscriptWord[]): Array<{
    id: string;
    text: string;
    startTime: number;
    endTime: number;
    words: TranscriptWord[];
  }> {
    if (!words || words.length === 0) return [];

    const segments: Array<{
      id: string;
      text: string;
      startTime: number;
      endTime: number;
      words: TranscriptWord[];
    }> = [];

    let currentSegmentWords: TranscriptWord[] = [];
    let segmentIndex = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      currentSegmentWords.push(word);

      // Check if we should end the segment
      const isSentenceEnd = /[.!?]$/.test(word.word);
      const isMaxWords = currentSegmentWords.length >= 15;
      const isLastWord = i === words.length - 1;

      if (isSentenceEnd || isMaxWords || isLastWord) {
        if (currentSegmentWords.length > 0) {
          segments.push({
            id: `segment-${segmentIndex}`,
            text: currentSegmentWords.map(w => w.word).join(" "),
            startTime: currentSegmentWords[0].start,
            endTime: currentSegmentWords[currentSegmentWords.length - 1].end,
            words: currentSegmentWords,
          });
          segmentIndex++;
          currentSegmentWords = [];
        }
      }
    }

    return segments;
  }

  /**
   * PATCH /api/videos/:id/transcript
   * Update transcript text while preserving word-level timestamps
   * Validates: Requirements 4.2, 4.4
   */
  static async updateTranscript(c: Context) {
    const videoId = c.req.param("id");
    TranscriptController.logRequest(c, "UPDATE_TRANSCRIPT", { videoId });

    try {
      const body = await c.req.json();
      const { transcript, transcriptWords } = body;

      // Validate that at least one field is provided
      if (transcript === undefined && transcriptWords === undefined) {
        return c.json(
          { error: "Either transcript or transcriptWords must be provided" },
          400
        );
      }

      const video = await VideoModel.getById(videoId);

      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Prepare update data
      const updateData: {
        transcript?: string;
        transcriptWords?: TranscriptWord[];
      } = {};

      // If only transcript text is updated, preserve existing timestamps
      // Validates: Requirement 4.2 - preserve word-level timestamps when text is modified
      if (transcript !== undefined) {
        updateData.transcript = transcript;
      }

      // If transcriptWords is provided, validate and update
      if (transcriptWords !== undefined) {
        // Validate transcriptWords array using validation service
        const validation =
          TranscriptValidationService.validateTranscriptWords(transcriptWords);
        if (!validation.valid) {
          return c.json({ error: validation.error }, 400);
        }

        updateData.transcriptWords = transcriptWords;

        // If transcriptWords is updated but transcript is not provided,
        // regenerate the transcript text from words
        if (transcript === undefined) {
          updateData.transcript =
            TranscriptValidationService.regenerateTranscriptText(
              transcriptWords
            );
        }
      }

      // Update the video record
      const updatedVideo = await VideoModel.update(videoId, updateData);

      console.log(
        `[TRANSCRIPT CONTROLLER] UPDATE_TRANSCRIPT success - updated video: ${videoId}`
      );

      return c.json({
        message: "Transcript updated successfully",
        videoId: updatedVideo?.id,
        transcript: updatedVideo?.transcript,
        transcriptWords: updatedVideo?.transcriptWords,
      });
    } catch (error) {
      console.error(`[TRANSCRIPT CONTROLLER] UPDATE_TRANSCRIPT error:`, error);
      return c.json({ error: "Failed to update transcript" }, 500);
    }
  }

  /**
   * PATCH /api/videos/:id/transcript/words/:index
   * Update individual word timing
   * Validates: Requirements 4.3, 4.4
   */
  static async updateWordTiming(c: Context) {
    const videoId = c.req.param("id");
    const wordIndex = parseInt(c.req.param("index"), 10);
    TranscriptController.logRequest(c, "UPDATE_WORD_TIMING", {
      videoId,
      wordIndex,
    });

    try {
      // Validate word index
      if (isNaN(wordIndex) || wordIndex < 0) {
        return c.json({ error: "Invalid word index" }, 400);
      }

      const body = await c.req.json();
      const { word, start, end, confidence } = body;

      const video = await VideoModel.getById(videoId);

      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Get existing transcript words
      const transcriptWords = (video.transcriptWords as TranscriptWord[]) || [];

      // Validate word index is within bounds
      if (wordIndex >= transcriptWords.length) {
        return c.json(
          {
            error: `Word index ${wordIndex} is out of bounds. Transcript has ${transcriptWords.length} words.`,
          },
          400
        );
      }

      // Get the existing word
      const existingWord = transcriptWords[wordIndex];

      // Build updated word using validation service
      const updates: Partial<TranscriptWord> = {};
      if (word !== undefined) updates.word = word;
      if (start !== undefined) updates.start = start;
      if (end !== undefined) updates.end = end;
      if (confidence !== undefined) updates.confidence = confidence;

      const updatedWord = TranscriptValidationService.mergeWordUpdate(
        existingWord,
        updates
      );

      // Validate the updated word timing
      // Validates: Requirement 4.3 - start time < end time
      const validation = TranscriptValidationService.validateCompleteWord(
        updatedWord,
        wordIndex
      );
      if (!validation.valid) {
        return c.json({ error: validation.error }, 400);
      }

      // Update the word in the array
      transcriptWords[wordIndex] = updatedWord;

      // Regenerate transcript text if word text was changed
      let newTranscript = video.transcript;
      if (word !== undefined && word !== existingWord.word) {
        newTranscript =
          TranscriptValidationService.regenerateTranscriptText(transcriptWords);
      }

      // Update the video record
      const updatedVideo = await VideoModel.update(videoId, {
        transcriptWords,
        transcript: newTranscript || undefined,
      });

      console.log(
        `[TRANSCRIPT CONTROLLER] UPDATE_WORD_TIMING success - updated word ${wordIndex} in video: ${videoId}`
      );

      return c.json({
        message: "Word timing updated successfully",
        videoId: updatedVideo?.id,
        wordIndex,
        updatedWord,
        transcript: updatedVideo?.transcript,
      });
    } catch (error) {
      console.error(
        `[TRANSCRIPT CONTROLLER] UPDATE_WORD_TIMING error:`,
        error
      );
      return c.json({ error: "Failed to update word timing" }, 500);
    }
  }
}
