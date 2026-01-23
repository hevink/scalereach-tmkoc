import { Hono } from "hono";
import { VideoController } from "../controllers/video.controller";
import { VideoConfigController } from "../controllers/video-config.controller";
import { TranscriptController } from "../controllers/transcript.controller";
import { ViralDetectionController } from "../controllers/viral-detection.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { nanoid } from "nanoid";
import { VideoModel } from "../models/video.model";
import { YouTubeService } from "../services/youtube.service";
import { addVideoProcessingJob } from "../jobs/queue";

const videoRouter = new Hono();

// Public route for URL validation
videoRouter.get("/validate-youtube", VideoController.validateYouTubeUrl);

// Test endpoint (no auth) - for development only
// This creates a video without requiring a real project
videoRouter.post("/test-upload", async (c) => {
  try {
    const body = await c.req.json();
    const { youtubeUrl } = body;

    if (!youtubeUrl) {
      return c.json({ error: "YouTube URL is required" }, 400);
    }

    if (!YouTubeService.isValidYouTubeUrl(youtubeUrl)) {
      return c.json({ error: "Invalid YouTube URL" }, 400);
    }

    const videoId = nanoid();
    const testUserId = "test-user-" + nanoid(8);

    // Add job directly to queue (skip database for testing)
    await addVideoProcessingJob({
      videoId,
      projectId: null,
      userId: testUserId,
      sourceType: "youtube",
      sourceUrl: youtubeUrl,
    });

    console.log(`[TEST] Video job added: ${videoId}`);

    return c.json({
      message: "Video submitted for processing (test mode)",
      videoId,
      userId: testUserId,
      youtubeUrl,
    }, 201);
  } catch (error) {
    console.error("[TEST] Error:", error);
    return c.json({ error: "Failed to submit video" }, 500);
  }
});

// Protected routes
videoRouter.use("/*", authMiddleware);
videoRouter.post("/youtube", VideoController.submitYouTubeUrl);
videoRouter.get("/my-videos", VideoController.getMyVideos);
videoRouter.get("/project/:projectId", VideoController.getVideosByProject);
videoRouter.get("/:id", VideoController.getVideoById);
videoRouter.get("/:id/status", VideoController.getVideoStatus);
videoRouter.delete("/:id", VideoController.deleteVideo);

// Transcript editing endpoints
// Validates: Requirements 4.1, 4.2, 4.3, 4.4
videoRouter.get("/:id/transcript", TranscriptController.getTranscript);
videoRouter.patch("/:id/transcript", TranscriptController.updateTranscript);
videoRouter.patch("/:id/transcript/words/:index", TranscriptController.updateWordTiming);

// Viral detection endpoints
// Validates: Requirements 5.1, 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
videoRouter.post("/:id/analyze", ViralDetectionController.analyzeVideo);
videoRouter.get("/:id/clips", ViralDetectionController.getVideoClips);

// Video configuration endpoints
// Validates: YouTube Upload Config Requirements 7.2, 7.3
videoRouter.get("/:id/config", VideoConfigController.getConfig);
videoRouter.post("/:id/configure", VideoConfigController.configure);
videoRouter.patch("/:id/config", VideoConfigController.updateConfig);

export default videoRouter;
