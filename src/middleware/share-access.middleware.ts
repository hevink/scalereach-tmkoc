import { Context, Next } from "hono";
import { WorkspaceModel } from "../models/workspace.model";
import { VideoModel } from "../models/video.model";
import { rateLimit } from "./rate-limit";
import { db } from "../db";
import { project } from "../db/schema/project.schema";
import { shareLinks } from "../db/schema/share.schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * Middleware to require Pro plan for share management endpoints
 * 
 * Stores video and workspace in context for downstream use,
 * avoiding duplicate DB lookups in controllers.
 */
export async function requireProPlan(c: Context, next: Next) {
  const user = c.get("user");
  
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let workspaceId = c.req.param("workspaceId") || c.get("workspaceId");
  
  // Try to resolve workspaceId from videoId — also cache the video in context
  if (!workspaceId) {
    const videoId = c.req.param("videoId");
    if (videoId) {
      try {
        const video = await VideoModel.getById(videoId);
        if (!video) {
          return c.json({ error: "Not Found", message: "Video not found" }, 404);
        }
        // Cache video in context so controller doesn't re-fetch
        c.set("video", video);

        workspaceId = video.workspaceId;
        if (!workspaceId && video.projectId) {
          const proj = await db.query.project.findFirst({
            where: eq(project.id, video.projectId),
            columns: { workspaceId: true },
          });
          workspaceId = proj?.workspaceId || undefined;
        }
      } catch (error) {
        console.error("[SHARE-ACCESS] Error fetching video:", error);
        return c.json({ error: "Internal Server Error", message: "Failed to fetch video" }, 500);
      }
    }
  }
  
  // Fallback: resolve from share token
  if (!workspaceId) {
    const token = c.req.param("token");
    if (token) {
      try {
        const shareLink = await db.query.shareLinks.findFirst({
          where: and(eq(shareLinks.token, token), isNull(shareLinks.revokedAt)),
          columns: { workspaceId: true },
        });
        if (!shareLink) {
          return c.json({ error: "Not Found", message: "Share link not found" }, 404);
        }
        workspaceId = shareLink.workspaceId;
      } catch (error) {
        console.error("[SHARE-ACCESS] Error fetching share link:", error);
        return c.json({ error: "Internal Server Error", message: "Failed to fetch share link" }, 500);
      }
    }
  }
  
  if (!workspaceId) {
    return c.json({ error: "Bad Request", message: "Workspace ID is required" }, 400);
  }

  try {
    const workspace = await WorkspaceModel.getById(workspaceId);
    
    if (!workspace) {
      return c.json({ error: "Not Found", message: "Workspace not found" }, 404);
    }

    if (workspace.plan !== "pro" && workspace.plan !== "pro-plus") {
      return c.json({ 
        error: "Pro plan required",
        message: "Clip sharing is available for Pro users only. Upgrade to share your clips publicly.",
        upgradeUrl: `/${workspace.slug}/settings/billing`,
        code: "PRO_PLAN_REQUIRED",
      }, 403);
    }

    c.set("workspace", workspace);
    await next();
  } catch (error) {
    console.error("[SHARE-ACCESS] Error checking Pro plan:", error);
    return c.json({ error: "Internal Server Error", message: "Failed to validate workspace plan" }, 500);
  }
}

/**
 * Rate limit middleware for public share access endpoints
 */
export const rateLimitPublicAccess = rateLimit({
  limit: 100,
  windowSeconds: 60,
  keyPrefix: "rl:share:public",
  message: "Too many requests. Please try again in a minute.",
});
