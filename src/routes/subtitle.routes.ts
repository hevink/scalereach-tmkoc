import { Hono } from "hono";
import { SubtitleController } from "../controllers/subtitle.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const subtitleRouter = new Hono();

// All subtitle routes require authentication
subtitleRouter.use("/*", authMiddleware);

// Video transcript download
subtitleRouter.get("/videos/:id/transcript/download", SubtitleController.downloadVideoTranscript);

// Clip captions download
subtitleRouter.get("/clips/:id/captions/download", SubtitleController.downloadClipCaptions);

export default subtitleRouter;
