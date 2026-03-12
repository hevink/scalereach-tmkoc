import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { SocialAccountController } from "../controllers/social-account.controller";
import { SocialPostController } from "../controllers/social-post.controller";
import { db } from "../db";
import { viralClip } from "../db/schema/project.schema";
import { video } from "../db/schema/project.schema";
import { socialMedia } from "../db/schema/social.schema";
import { eq, and, desc } from "drizzle-orm";
import type { AuthContext } from "../lib/auth";

const socialRouter = new Hono<{ Variables: AuthContext }>();
const protected_ = new Hono<{ Variables: AuthContext }>();
protected_.use("*", authMiddleware);

protected_.get("/accounts", SocialAccountController.listAccounts);
protected_.get("/accounts/:platform/connect", SocialAccountController.initiateOAuth);
protected_.delete("/accounts/:id", SocialAccountController.disconnectAccount);

protected_.post("/posts", SocialPostController.schedulePost);
protected_.get("/posts", SocialPostController.listPosts);
protected_.patch("/posts/:id", SocialPostController.updatePost);
protected_.delete("/posts/:id", SocialPostController.cancelPost);

// Presigned upload URL for custom social media posts - also creates a media library record
protected_.post("/media/upload-url", async (c) => {
  try {
    const user = c.get("user") as { id: string };
    const { workspaceId, filename, contentType, fileSize } = await c.req.json();

    if (!workspaceId || !filename || !contentType) {
      return c.json({ error: "workspaceId, filename, and contentType are required" }, 400);
    }

    const allowedTypes = ["video/mp4", "video/quicktime", "video/webm", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(contentType)) {
      return c.json({ error: `Unsupported file type. Allowed: ${allowedTypes.join(", ")}` }, 400);
    }

    const { R2Service } = await import("../services/r2.service");
    const ext = filename.split(".").pop()?.toLowerCase() || "mp4";
    const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const storageKey = `social-media/${workspaceId}/${id}.${ext}`;
    const isVideo = contentType.startsWith("video/");

    const uploadUrl = await R2Service.getSignedUploadUrl(storageKey, contentType, 3600);
    const publicUrl = R2Service.getPublicUrl(storageKey);

    // Save to media library
    await db.insert(socialMedia).values({
      id,
      workspaceId,
      filename,
      storageKey,
      url: publicUrl,
      contentType,
      mediaType: isVideo ? "video" : "image",
      fileSize: fileSize || null,
      uploadedBy: user.id,
    });

    return c.json({ uploadUrl, storageKey, publicUrl, mediaId: id });
  } catch (error) {
    console.error("[SOCIAL ROUTES] MEDIA_UPLOAD_URL error:", error);
    return c.json({ error: "Failed to generate upload URL" }, 500);
  }
});

// List uploaded media for a workspace
protected_.get("/media", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);

  const rows = await db
    .select()
    .from(socialMedia)
    .where(eq(socialMedia.workspaceId, workspaceId))
    .orderBy(desc(socialMedia.createdAt));

  return c.json(rows);
});

// Delete uploaded media
protected_.delete("/media/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const rows = await db.select().from(socialMedia).where(eq(socialMedia.id, id));
    const media = rows[0];
    if (!media) return c.json({ error: "Not found" }, 404);

    // Delete from R2
    const { R2Service } = await import("../services/r2.service");
    await R2Service.deleteFile(media.storageKey).catch(() => {});

    // Delete record
    await db.delete(socialMedia).where(eq(socialMedia.id, id));
    return c.json({ success: true });
  } catch (error) {
    console.error("[SOCIAL ROUTES] DELETE_MEDIA error:", error);
    return c.json({ error: "Failed to delete media" }, 500);
  }
});

// Workspace clips for the scheduler modal - only ready clips with a storageUrl
protected_.get("/clips", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);

  const rows = await db
    .select({
      id: viralClip.id,
      title: viralClip.title,
      thumbnailUrl: viralClip.thumbnailUrl,
      storageUrl: viralClip.storageUrl,
      score: viralClip.score,
      duration: viralClip.duration,
      aspectRatio: viralClip.aspectRatio,
      hooks: viralClip.hooks,
      recommendedPlatforms: viralClip.recommendedPlatforms,
    })
    .from(viralClip)
    .innerJoin(video, eq(viralClip.videoId, video.id))
    .where(
      and(
        eq(video.workspaceId, workspaceId),
        eq(viralClip.status, "ready")
      )
    )
    .orderBy(desc(viralClip.createdAt));

  return c.json(rows);
});

// Public routes - must be registered BEFORE mounting the protected sub-router
// OAuth callback: Meta redirects here without auth cookies
socialRouter.get("/accounts/:platform/callback", SocialAccountController.handleOAuthCallback);
// Also handle trailing-slash variant so Instagram redirects don't lose query params via 301
socialRouter.get("/accounts/:platform/callback/", SocialAccountController.handleOAuthCallback);

// Webhook verification (GET) and events (POST) - must be public
socialRouter.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("[WEBHOOK] Verified successfully");
    return c.text(challenge ?? "", 200);
  }

  console.warn("[WEBHOOK] Verification failed - token mismatch");
  return c.json({ error: "Forbidden" }, 403);
});

socialRouter.post("/webhook", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  console.log("[WEBHOOK] Received event:", JSON.stringify(body));
  return c.json({ received: true }, 200);
});

// Mount protected routes last
socialRouter.route("/", protected_);

export default socialRouter;

