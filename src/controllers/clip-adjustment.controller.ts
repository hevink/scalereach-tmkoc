/**
 * Clip Adjustment Controller
 * Handles API endpoints for manual clip boundary adjustments
 * 
 * Validates: Requirements 9.1, 9.3, 9.4, 9.5
 */

import { Context } from "hono";
import { ClipModel } from "../models/clip.model";
import { VideoModel } from "../models/video.model";
import { TranscriptWord } from "../services/deepgram.service";

/**
 * Duration constraints for manual clip adjustments
 * Validates: Requirements 9.3, 9.4
 */
export const MIN_CLIP_DURATION = 5; // seconds
export const MAX_CLIP_DURATION = 180; // seconds

/**
 * Request body for boundary adjustment
 */
export interface BoundaryAdjustmentRequest {
  startTime?: number;
  endTime?: number;
}

/**
 * Validation result for boundary adjustment
 */
export interface BoundaryValidationResult {
  valid: boolean;
  error?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

/**
 * Validate clip boundary adjustment
 * Validates: Requirements 9.3, 9.4
 */
export function validateBoundaryAdjustment(
  startTime: number,
  endTime: number,
  videoDuration?: number
): BoundaryValidationResult {
  // Validate start time is non-negative
  if (startTime < 0) {
    return {
      valid: false,
      error: "Start time cannot be negative",
    };
  }

  // Validate end time is greater than start time
  if (endTime <= startTime) {
    return {
      valid: false,
      error: "End time must be greater than start time",
    };
  }

  // Calculate duration
  const duration = endTime - startTime;

  // Validate minimum duration (5 seconds)
  if (duration < MIN_CLIP_DURATION) {
    return {
      valid: false,
      error: `Clip duration must be at least ${MIN_CLIP_DURATION} seconds. Current duration: ${duration.toFixed(1)} seconds`,
    };
  }

  // Validate maximum duration (180 seconds)
  if (duration > MAX_CLIP_DURATION) {
    return {
      valid: false,
      error: `Clip duration cannot exceed ${MAX_CLIP_DURATION} seconds. Current duration: ${duration.toFixed(1)} seconds`,
    };
  }

  // Validate against video duration if provided
  if (videoDuration !== undefined && videoDuration > 0) {
    if (endTime > videoDuration) {
      return {
        valid: false,
        error: `End time (${endTime.toFixed(1)}s) cannot exceed video duration (${videoDuration.toFixed(1)}s)`,
      };
    }
  }

  return {
    valid: true,
    startTime,
    endTime,
    duration,
  };
}

/**
 * Extract transcript text for a specific time range from word timestamps
 * Validates: Requirements 9.5
 * 
 * @param words - Array of transcript words with timestamps
 * @param startTime - Start time in seconds
 * @param endTime - End time in seconds
 * @returns Transcript text for the specified range
 */
export function getTranscriptForRange(
  words: TranscriptWord[],
  startTime: number,
  endTime: number
): string {
  if (!words || words.length === 0) {
    return "";
  }

  // Filter words that fall within the time range
  // A word is included if its start time is >= startTime AND its end time is <= endTime
  const wordsInRange = words.filter(
    (word) => word.start >= startTime && word.end <= endTime
  );

  // Join words with spaces
  return wordsInRange.map((w) => w.word).join(" ");
}

export class ClipAdjustmentController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[CLIP ADJUSTMENT CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * PATCH /api/clips/:id/boundaries
   * Update clip start and end times
   * Validates: Requirements 9.1, 9.3, 9.4, 9.5
   */
  static async updateBoundaries(c: Context) {
    const clipId = c.req.param("id");
    ClipAdjustmentController.logRequest(c, "UPDATE_BOUNDARIES", { clipId });

    try {
      // Get the clip
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Parse request body
      let body: BoundaryAdjustmentRequest;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid request body" }, 400);
      }

      // Validate that at least one boundary is provided
      if (body.startTime === undefined && body.endTime === undefined) {
        return c.json({ 
          error: "At least one of startTime or endTime must be provided" 
        }, 400);
      }

      // Get the video to access transcript words and duration
      const video = await VideoModel.getById(clip.videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Determine new boundaries (use existing values if not provided)
      const newStartTime = body.startTime !== undefined ? body.startTime : clip.startTime;
      const newEndTime = body.endTime !== undefined ? body.endTime : clip.endTime;

      // Validate the new boundaries
      const validation = validateBoundaryAdjustment(
        newStartTime,
        newEndTime,
        video.duration || undefined
      );

      if (!validation.valid) {
        return c.json({ 
          error: validation.error,
          constraints: {
            minDuration: MIN_CLIP_DURATION,
            maxDuration: MAX_CLIP_DURATION,
            videoDuration: video.duration,
          }
        }, 400);
      }

      // Recalculate transcript for the new range
      let newTranscript = clip.transcript || "";
      if (video.transcriptWords && Array.isArray(video.transcriptWords)) {
        newTranscript = getTranscriptForRange(
          video.transcriptWords as TranscriptWord[],
          newStartTime,
          newEndTime
        );
      }

      // Calculate new duration
      const newDuration = Math.round(newEndTime - newStartTime);

      // Update the clip
      // Reset status to 'detected' when boundaries change (clip needs to be regenerated)
      const updatedClip = await ClipModel.update(clipId, {
        startTime: Math.round(newStartTime),
        endTime: Math.round(newEndTime),
        duration: newDuration,
        transcript: newTranscript,
        status: "detected", // Reset status since boundaries changed
        // Clear storage info since clip needs to be regenerated
        storageKey: undefined,
        storageUrl: undefined,
        errorMessage: undefined,
      });

      if (!updatedClip) {
        return c.json({ error: "Failed to update clip" }, 500);
      }

      console.log(
        `[CLIP ADJUSTMENT CONTROLLER] Boundaries updated for clip ${clipId}: ` +
        `${clip.startTime}s-${clip.endTime}s -> ${newStartTime}s-${newEndTime}s`
      );

      return c.json({
        message: "Clip boundaries updated successfully",
        clip: updatedClip,
        changes: {
          previousStartTime: clip.startTime,
          previousEndTime: clip.endTime,
          previousDuration: clip.duration,
          newStartTime: Math.round(newStartTime),
          newEndTime: Math.round(newEndTime),
          newDuration,
          transcriptUpdated: newTranscript !== clip.transcript,
          statusReset: true,
        },
      });
    } catch (error) {
      console.error(`[CLIP ADJUSTMENT CONTROLLER] UPDATE_BOUNDARIES error:`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to update clip boundaries: ${errorMessage}` }, 500);
    }
  }

  /**
   * GET /api/clips/:id/boundaries
   * Get current clip boundaries and constraints
   */
  static async getBoundaries(c: Context) {
    const clipId = c.req.param("id");
    ClipAdjustmentController.logRequest(c, "GET_BOUNDARIES", { clipId });

    try {
      // Get the clip
      const clip = await ClipModel.getById(clipId);
      if (!clip) {
        return c.json({ error: "Clip not found" }, 404);
      }

      // Get the video for duration info
      const video = await VideoModel.getById(clip.videoId);

      return c.json({
        clipId,
        boundaries: {
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.duration || (clip.endTime - clip.startTime),
        },
        constraints: {
          minDuration: MIN_CLIP_DURATION,
          maxDuration: MAX_CLIP_DURATION,
          videoDuration: video?.duration || null,
          minStartTime: 0,
          maxEndTime: video?.duration || null,
        },
        status: clip.status,
        hasGeneratedClip: !!clip.storageUrl,
      });
    } catch (error) {
      console.error(`[CLIP ADJUSTMENT CONTROLLER] GET_BOUNDARIES error:`, error);
      return c.json({ error: "Failed to get clip boundaries" }, 500);
    }
  }
}
