import { Hono } from "hono";
import { TranscriptController } from "../controllers/transcript.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const transcriptRouter = new Hono();

// All transcript routes require authentication
transcriptRouter.use("/*", authMiddleware);

/**
 * GET /api/videos/:id/transcript
 * Retrieve transcript with word-level timestamps
 * Validates: Requirement 4.1
 */
transcriptRouter.get("/:id/transcript", TranscriptController.getTranscript);

/**
 * PATCH /api/videos/:id/transcript
 * Update transcript text while preserving timestamps
 * Validates: Requirements 4.2, 4.4
 */
transcriptRouter.patch("/:id/transcript", TranscriptController.updateTranscript);

/**
 * PATCH /api/videos/:id/transcript/words/:index
 * Update individual word timing
 * Validates: Requirements 4.3, 4.4
 */
transcriptRouter.patch(
  "/:id/transcript/words/:index",
  TranscriptController.updateWordTiming
);

export default transcriptRouter;
