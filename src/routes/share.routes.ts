/**
 * Share Routes
 * Authenticated endpoints for share link management and public endpoints for viewing
 * 
 * Authenticated routes require Pro plan access via requireProPlan middleware
 * Public routes require rate limiting via rateLimitPublicAccess middleware
 */

import { Hono } from "hono";
import { ShareController } from "../controllers/share.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireProPlan, rateLimitPublicAccess } from "../middleware/share-access.middleware";

const shareRouter = new Hono();

// ============================================================================
// AUTHENTICATED ROUTES (require Pro plan)
// Apply middleware inline per-route so :videoId param is available
// ============================================================================

shareRouter.get("/videos/:videoId/share", authMiddleware, requireProPlan, ShareController.getShareStatus);
shareRouter.post("/videos/:videoId/share", authMiddleware, requireProPlan, ShareController.createShareLink);
shareRouter.delete("/videos/:videoId/share", authMiddleware, requireProPlan, ShareController.revokeShareLink);
shareRouter.post("/videos/:videoId/share/regenerate", authMiddleware, requireProPlan, ShareController.regenerateShareLink);

// Analytics endpoint (requires Pro plan and ownership validation)
shareRouter.get("/share/:token/analytics", authMiddleware, requireProPlan, ShareController.getShareAnalytics);

// ============================================================================
// PUBLIC ROUTES (no authentication, rate limited)
// ============================================================================

shareRouter.get("/share/:token", rateLimitPublicAccess, ShareController.getPublicShareData);
shareRouter.get("/share/:token/download/batch", rateLimitPublicAccess, ShareController.downloadBatch);
shareRouter.get("/share/:token/download/:clipId", rateLimitPublicAccess, ShareController.downloadClip);

export default shareRouter;
