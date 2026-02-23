import { Context } from "hono";
import { ScheduledPostModel } from "../models/scheduled-post.model";
import { SocialAccountModel } from "../models/social-account.model";
import { WorkspaceModel } from "../models/workspace.model";
import { addSocialPostingJob, socialPostingQueue } from "../jobs/queue";

export class SocialPostController {
  private static logRequest(c: Context, operation: string, details?: any) {
    console.log(
      `[SOCIAL POST CONTROLLER] ${operation} - ${c.req.method} ${c.req.url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  static async schedulePost(c: Context) {
    SocialPostController.logRequest(c, "SCHEDULE_POST");

    try {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json();
      const {
        workspaceId,
        clipId,
        socialAccountId,
        caption,
        hashtags,
        postType,
        scheduledAt,
        dripClips, // Array<{ clipId, socialAccountId }> for drip
      } = body;

      if (!workspaceId || !postType) {
        return c.json({ error: "workspaceId and postType are required" }, 400);
      }

      const members = await WorkspaceModel.getMembers(workspaceId);
      if (!members.some((m) => m.userId === user.id)) {
        return c.json({ error: "Access denied" }, 403);
      }

      if (postType === "drip") {
        if (!Array.isArray(dripClips) || dripClips.length === 0) {
          return c.json({ error: "dripClips array required for drip posts" }, 400);
        }

        const dripGroupId = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const posts = [];

        for (let i = 0; i < dripClips.length; i++) {
          const { clipId: dClipId, socialAccountId: dAccountId } = dripClips[i];
          const account = await SocialAccountModel.getById(dAccountId);
          if (!account || account.workspaceId !== workspaceId) {
            return c.json({ error: `Invalid socialAccountId at index ${i}` }, 400);
          }

          const delayMs = i * 24 * 60 * 60 * 1000; // 24h per slot
          const scheduledTime = new Date(Date.now() + delayMs);

          const post = await ScheduledPostModel.create({
            workspaceId,
            clipId: dClipId,
            socialAccountId: dAccountId,
            platform: account.platform,
            postType: "drip",
            caption,
            hashtags,
            scheduledAt: scheduledTime,
            dripGroupId,
            dripOrder: i,
            createdBy: user.id,
          });

          await addSocialPostingJob(
            {
              postId: post.id,
              workspaceId,
              clipId: dClipId,
              socialAccountId: dAccountId,
              platform: account.platform,
              caption,
              hashtags,
            },
            delayMs
          );

          posts.push(post);
        }

        return c.json({ posts, dripGroupId });
      }

      // immediate or scheduled
      if (!clipId || !socialAccountId) {
        return c.json({ error: "clipId and socialAccountId are required" }, 400);
      }

      const account = await SocialAccountModel.getById(socialAccountId);
      if (!account || account.workspaceId !== workspaceId) {
        return c.json({ error: "Invalid socialAccountId" }, 400);
      }

      let delayMs: number | undefined;
      let scheduledTime: Date | undefined;

      if (postType === "scheduled") {
        if (!scheduledAt) return c.json({ error: "scheduledAt required for scheduled posts" }, 400);
        const target = new Date(scheduledAt);
        delayMs = Math.max(0, target.getTime() - Date.now());
        scheduledTime = target;
      }

      const post = await ScheduledPostModel.create({
        workspaceId,
        clipId,
        socialAccountId,
        platform: account.platform,
        postType,
        caption,
        hashtags,
        scheduledAt: scheduledTime,
        createdBy: user.id,
      });

      await addSocialPostingJob(
        {
          postId: post.id,
          workspaceId,
          clipId,
          socialAccountId,
          platform: account.platform,
          caption,
          hashtags,
        },
        delayMs
      );

      return c.json(post, 201);
    } catch (error) {
      console.error("[SOCIAL POST CONTROLLER] SCHEDULE_POST error:", error);
      return c.json({ error: "Failed to schedule post" }, 500);
    }
  }

  static async listPosts(c: Context) {
    const workspaceId = c.req.query("workspaceId");
    SocialPostController.logRequest(c, "LIST_POSTS", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);

      const members = await WorkspaceModel.getMembers(workspaceId);
      if (!members.some((m) => m.userId === user.id)) {
        return c.json({ error: "Access denied" }, 403);
      }

      const status = c.req.query("status");
      const clipId = c.req.query("clipId");

      const posts = await ScheduledPostModel.getByWorkspace(workspaceId, {
        status: status || undefined,
        clipId: clipId || undefined,
      });

      return c.json(posts);
    } catch (error) {
      console.error("[SOCIAL POST CONTROLLER] LIST_POSTS error:", error);
      return c.json({ error: "Failed to list posts" }, 500);
    }
  }

  static async updatePost(c: Context) {
    const id = c.req.param("id");
    SocialPostController.logRequest(c, "UPDATE_POST", { id });

    try {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const post = await ScheduledPostModel.getById(id);
      if (!post) return c.json({ error: "Post not found" }, 404);

      const members = await WorkspaceModel.getMembers(post.workspaceId);
      if (!members.some((m) => m.userId === user.id)) {
        return c.json({ error: "Access denied" }, 403);
      }

      if (post.status !== "pending") {
        return c.json({ error: "Only pending posts can be edited" }, 400);
      }

      const body = await c.req.json();
      const { caption, hashtags, scheduledAt } = body;

      // Reschedule the BullMQ job if scheduledAt changed
      if (scheduledAt !== undefined && post.postType === "scheduled") {
        const job = await socialPostingQueue.getJob(`social-${id}`);
        if (job) await job.remove();

        const target = new Date(scheduledAt);
        const delayMs = Math.max(0, target.getTime() - Date.now());
        await addSocialPostingJob(
          {
            postId: post.id,
            workspaceId: post.workspaceId,
            clipId: post.clipId,
            socialAccountId: post.socialAccountId,
            platform: post.platform,
            caption: caption ?? post.caption ?? undefined,
            hashtags: hashtags ?? post.hashtags ?? [],
          },
          delayMs
        );
      }

      const updated = await ScheduledPostModel.update(id, {
        caption: caption !== undefined ? caption : post.caption ?? undefined,
        hashtags: hashtags !== undefined ? hashtags : post.hashtags ?? [],
        scheduledAt: scheduledAt !== undefined ? new Date(scheduledAt) : post.scheduledAt ?? undefined,
      });

      return c.json(updated);
    } catch (error) {
      console.error("[SOCIAL POST CONTROLLER] UPDATE_POST error:", error);
      return c.json({ error: "Failed to update post" }, 500);
    }
  }

  static async cancelPost(c: Context) {
    const id = c.req.param("id");
    SocialPostController.logRequest(c, "CANCEL_POST", { id });

    try {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const post = await ScheduledPostModel.getById(id);
      if (!post) return c.json({ error: "Post not found" }, 404);

      const members = await WorkspaceModel.getMembers(post.workspaceId);
      if (!members.some((m) => m.userId === user.id)) {
        return c.json({ error: "Access denied" }, 403);
      }

      if (post.status === "posted") {
        return c.json({ error: "Cannot cancel an already posted post" }, 400);
      }

      // Remove BullMQ job if pending
      const job = await socialPostingQueue.getJob(`social-${id}`);
      if (job) await job.remove();

      await ScheduledPostModel.cancel(id);
      return c.json({ success: true });
    } catch (error) {
      console.error("[SOCIAL POST CONTROLLER] CANCEL_POST error:", error);
      return c.json({ error: "Failed to cancel post" }, 500);
    }
  }
}
