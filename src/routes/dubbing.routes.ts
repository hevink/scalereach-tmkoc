import { Hono } from "hono";
import { DubbingController } from "../controllers/dubbing.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const dubbingRouter = new Hono();

// All routes are protected
const protectedRoutes = new Hono();
protectedRoutes.use("*", authMiddleware);

// Start dubbing for a translation
protectedRoutes.post("/translations/:translationId", DubbingController.startDubbing);

// Get all dubbings for a video
protectedRoutes.get("/videos/:videoId", DubbingController.getDubbingsByVideo);

// List TTS voices
protectedRoutes.get("/voices", DubbingController.listVoices);

// Get dubbing details
protectedRoutes.get("/:dubbingId", DubbingController.getDubbing);

// Delete a dubbing
protectedRoutes.delete("/:dubbingId", DubbingController.deleteDubbing);

// Get signed URL for audio preview
protectedRoutes.get("/:dubbingId/preview", DubbingController.getPreview);

// Get dubbed audio for a specific clip
protectedRoutes.get("/clips/:clipId/audio/:dubbingId", DubbingController.getClipAudio);

dubbingRouter.route("/", protectedRoutes);

export default dubbingRouter;
