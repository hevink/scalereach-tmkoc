import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.middleware";
import { SocialAccountController } from "../controllers/social-account.controller";
import { SocialPostController } from "../controllers/social-post.controller";
import { db } from "../db";
import { viralClip } from "../db/schema/project.schema";
import { video } from "../db/schema/project.schema";
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
protected_.delete("/posts/:id", SocialPostController.cancelPost);

// Workspace clips for the scheduler modal — only ready clips with a storageUrl
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

socialRouter.route("/", protected_);

// OAuth callback must be public — Google redirects without auth cookies
socialRouter.get("/accounts/:platform/callback", SocialAccountController.handleOAuthCallback);

export default socialRouter;

