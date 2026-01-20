import { Hono } from "hono";
import { ViralDetectionController } from "../controllers/viral-detection.controller";
import { ClipGenerationController } from "../controllers/clip-generation.controller";
import { ClipAdjustmentController } from "../controllers/clip-adjustment.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const clipRouter = new Hono();

// All clip routes require authentication
clipRouter.use("/*", authMiddleware);

// Clip management endpoints
// Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5
clipRouter.get("/:id", ViralDetectionController.getClipById);
clipRouter.delete("/:id", ViralDetectionController.deleteClip);
clipRouter.post("/:id/favorite", ViralDetectionController.toggleFavorite);

// Clip boundary adjustment endpoints
// Validates: Requirements 9.1, 9.3, 9.4, 9.5
clipRouter.patch("/:id/boundaries", ClipAdjustmentController.updateBoundaries);
clipRouter.get("/:id/boundaries", ClipAdjustmentController.getBoundaries);

// Clip generation endpoints
// Validates: Requirements 7.1, 7.6
clipRouter.post("/:id/generate", ClipGenerationController.generateClip);
clipRouter.get("/:id/status", ClipGenerationController.getClipStatus);
clipRouter.post("/:id/regenerate", ClipGenerationController.regenerateClip);

export default clipRouter;
