import { Hono } from "hono";
import { nanoid } from "nanoid";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { BackgroundVideoModel } from "../models/background-video.model";
import { R2Service } from "../services/r2.service";
import { FFmpegService } from "../services/ffmpeg.service";

const backgroundVideoRouter = new Hono();

// All routes require auth
backgroundVideoRouter.use("*", authMiddleware);

/**
 * GET /api/backgrounds/categories
 * List all background categories with thumbnails
 */
backgroundVideoRouter.get("/categories", async (c) => {
  try {
    const categories = await BackgroundVideoModel.listCategories();
    return c.json({ success: true, data: categories });
  } catch (error) {
    console.error("[BG ROUTES] Failed to list categories:", error);
    return c.json({ error: "Failed to list categories" }, 500);
  }
});

/**
 * GET /api/backgrounds/categories/:id
 * List videos in a specific category
 */
backgroundVideoRouter.get("/categories/:id", async (c) => {
  try {
    const categoryId = c.req.param("id");
    const videos = await BackgroundVideoModel.listByCategory(categoryId);

    // Add thumbnail URLs
    const videosWithUrls = videos.map((v) => ({
      ...v,
      thumbnailUrl: v.thumbnailKey ? R2Service.getPublicUrl(v.thumbnailKey) : null,
    }));

    return c.json({ success: true, data: videosWithUrls });
  } catch (error) {
    console.error("[BG ROUTES] Failed to list videos:", error);
    return c.json({ error: "Failed to list videos" }, 500);
  }
});

/**
 * POST /api/backgrounds/categories (admin only)
 * Create a new background category
 */
backgroundVideoRouter.post("/categories", adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { slug, displayName, thumbnailUrl } = body;

    if (!slug || !displayName) {
      return c.json({ error: "slug and displayName are required" }, 400);
    }

    // Check for duplicate slug
    const existing = await BackgroundVideoModel.getCategoryBySlug(slug);
    if (existing) {
      return c.json({ error: `Category with slug "${slug}" already exists` }, 409);
    }

    const category = await BackgroundVideoModel.createCategory({
      id: nanoid(),
      slug,
      displayName,
      thumbnailUrl: thumbnailUrl || null,
    });

    return c.json({ success: true, data: category }, 201);
  } catch (error) {
    console.error("[BG ROUTES] Failed to create category:", error);
    return c.json({ error: "Failed to create category" }, 500);
  }
});

/**
 * POST /api/backgrounds/videos (admin only)
 * Upload a background video with validation
 */
backgroundVideoRouter.post("/videos", adminMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { categoryId, displayName, storageKey } = body;

    if (!categoryId || !displayName || !storageKey) {
      return c.json({ error: "categoryId, displayName, and storageKey are required" }, 400);
    }

    // Validate the video file using FFprobe
    const signedUrl = await R2Service.getSignedDownloadUrl(storageKey, 3600);
    const metadata = await FFmpegService.getVideoMetadata(signedUrl);

    // Validation: minimum 720p resolution
    const minDimension = Math.min(metadata.width || 0, metadata.height || 0);
    if (minDimension < 720) {
      return c.json({ error: `Video resolution too low (${metadata.width}x${metadata.height}). Minimum 720p required.` }, 400);
    }

    // Validation: minimum 30s duration
    if (metadata.duration < 30) {
      return c.json({ error: `Video too short (${metadata.duration.toFixed(1)}s). Minimum 30 seconds required.` }, 400);
    }

    // Generate thumbnail at 2s mark
    const thumbnailKey = `backgrounds/thumbnails/${nanoid()}.jpg`;
    let thumbnailResult;
    try {
      thumbnailResult = await FFmpegService.generateThumbnail(signedUrl, thumbnailKey, 2);
    } catch (thumbErr) {
      console.warn("[BG ROUTES] Thumbnail generation failed (non-fatal):", thumbErr);
    }

    const video = await BackgroundVideoModel.create({
      id: nanoid(),
      categoryId,
      displayName,
      storageKey,
      thumbnailKey: thumbnailResult?.thumbnailKey || null,
      duration: Math.round(metadata.duration),
      width: metadata.width || 0,
      height: metadata.height || 0,
      fileSize: 0, // Will be updated if we can get file size
    });

    return c.json({ success: true, data: video }, 201);
  } catch (error) {
    console.error("[BG ROUTES] Failed to upload background video:", error);
    return c.json({ error: "Failed to upload background video" }, 500);
  }
});

export default backgroundVideoRouter;
