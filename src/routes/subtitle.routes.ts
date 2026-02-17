import { Hono } from "hono";
import { SubtitleController } from "../controllers/subtitle.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const subtitleRouter = new Hono();

// Video transcript download
subtitleRouter.get("/videos/:id/transcript/download", authMiddleware, SubtitleController.downloadVideoTranscript);

// Clip captions download
subtitleRouter.get("/clips/:id/captions/download", authMiddleware, SubtitleController.downloadClipCaptions);

export default subtitleRouter;
