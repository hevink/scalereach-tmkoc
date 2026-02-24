import { Context } from "hono";
import { AdminModel } from "../models/admin.model";
import { addVideoProcessingJob } from "../jobs/queue";
import { VideoModel } from "../models/video.model";
import { ClipModel } from "../models/clip.model";
import { R2Service } from "../services/r2.service";
import { db } from "../db";
import { videoExport, voiceDubbing, dubbedClipAudio } from "../db/schema";
import { inArray, eq } from "drizzle-orm";

export class AdminController {
  /**
   * Get dashboard overview stats
   * GET /api/admin/stats
   */
  static async getDashboardStats(c: Context) {
    try {
      const stats = await AdminModel.getDashboardStats();
      return c.json(stats);
    } catch (error) {
      console.error("[ADMIN] Failed to get dashboard stats:", error);
      return c.json({ error: "Failed to get dashboard stats" }, 500);
    }
  }

  /**
   * Get user growth data
   * GET /api/admin/analytics/user-growth?days=30
   */
  static async getUserGrowthData(c: Context) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(c.req.query("days") || "30", 10)));
      const data = await AdminModel.getUserGrowthData(days);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get user growth data:", error);
      return c.json({ error: "Failed to get user growth data" }, 500);
    }
  }

  /**
   * Get video processing stats
   * GET /api/admin/analytics/video-processing
   */
  static async getVideoProcessingStats(c: Context) {
    try {
      const stats = await AdminModel.getVideoProcessingStats();
      return c.json(stats);
    } catch (error) {
      console.error("[ADMIN] Failed to get video processing stats:", error);
      return c.json({ error: "Failed to get video processing stats" }, 500);
    }
  }

  /**
   * Get workspace plan distribution
   * GET /api/admin/analytics/workspace-plans
   */
  static async getWorkspacePlanDistribution(c: Context) {
    try {
      const data = await AdminModel.getWorkspacePlanDistribution();
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get workspace plan distribution:", error);
      return c.json({ error: "Failed to get workspace plan distribution" }, 500);
    }
  }

  /**
   * Get top workspaces
   * GET /api/admin/analytics/top-workspaces?limit=10
   */
  static async getTopWorkspaces(c: Context) {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "10", 10)));
      const data = await AdminModel.getTopWorkspaces(limit);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get top workspaces:", error);
      return c.json({ error: "Failed to get top workspaces" }, 500);
    }
  }

  /**
   * Get daily activity data
   * GET /api/admin/analytics/daily-activity?days=30
   */
  static async getDailyActivityData(c: Context) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(c.req.query("days") || "30", 10)));
      const data = await AdminModel.getDailyActivityData(days);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get daily activity data:", error);
      return c.json({ error: "Failed to get daily activity data" }, 500);
    }
  }

  /**
   * Get recent activity feed
   * GET /api/admin/activity
   */
  static async getRecentActivity(c: Context) {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
      const data = await AdminModel.getRecentActivity(limit);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get recent activity:", error);
      return c.json({ error: "Failed to get recent activity" }, 500);
    }
  }

  /**
   * Get all users with pagination
   * GET /api/admin/users?page=1&limit=20
   */
  static async getAllUsers(c: Context) {
    try {
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
      const data = await AdminModel.getAllUsers(page, limit);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get users:", error);
      return c.json({ error: "Failed to get users" }, 500);
    }
  }

  /**
   * Get all workspaces with pagination
   * GET /api/admin/workspaces?page=1&limit=20
   */
  static async getAllWorkspaces(c: Context) {
    try {
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
      const data = await AdminModel.getAllWorkspaces(page, limit);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get workspaces:", error);
      return c.json({ error: "Failed to get workspaces" }, 500);
    }
  }

  /**
   * Update user role
   * PUT /api/admin/users/:id/role
   */
  static async updateUserRole(c: Context) {
    try {
      const userId = c.req.param("id");
      const { role } = await c.req.json();

      if (!role || !["user", "admin"].includes(role)) {
        return c.json({ error: "Invalid role. Must be 'user' or 'admin'" }, 400);
      }

      const updatedUser = await AdminModel.updateUserRole(userId, role);
      if (!updatedUser) {
        return c.json({ error: "User not found" }, 404);
      }

      return c.json(updatedUser);
    } catch (error) {
      console.error("[ADMIN] Failed to update user role:", error);
      return c.json({ error: "Failed to update user role" }, 500);
    }
  }

  /**
   * Delete user
   * DELETE /api/admin/users/:id
   */
  static async deleteUser(c: Context) {
    try {
      const userId = c.req.param("id");
      const currentUser = c.get("user") as { id: string };

      // Prevent self-deletion
      if (userId === currentUser.id) {
        return c.json({ error: "Cannot delete your own account" }, 400);
      }

      // Clean up R2 files before DB delete
      const videos = await VideoModel.getByUserId(userId);
      const videoIds = videos.map(v => v.id);

      const clipKeys = videoIds.length > 0
        ? await ClipModel.getStorageKeysByVideoIds(videoIds)
        : [];

      const exportRows = videoIds.length > 0
        ? await db.select({ storageKey: videoExport.storageKey }).from(videoExport).where(eq(videoExport.userId, userId))
        : [];

      const dubbingRows = videoIds.length > 0
        ? await db.select({ dubbedAudioKey: voiceDubbing.dubbedAudioKey, mixedAudioKey: voiceDubbing.mixedAudioKey, id: voiceDubbing.id })
            .from(voiceDubbing).where(inArray(voiceDubbing.videoId, videoIds))
        : [];

      const dubbingIds = dubbingRows.map(d => d.id);
      const clipAudioRows = dubbingIds.length > 0
        ? await db.select({ audioKey: dubbedClipAudio.audioKey }).from(dubbedClipAudio).where(inArray(dubbedClipAudio.dubbingId, dubbingIds))
        : [];

      const r2Keys: string[] = [
        ...videos.flatMap(v =>
          [v.storageKey, v.audioStorageKey, v.thumbnailKey].filter(Boolean) as string[]
        ),
        ...clipKeys.flatMap(c =>
          [c.storageKey, c.rawStorageKey, c.thumbnailKey].filter(Boolean) as string[]
        ),
        ...exportRows.flatMap(e => [e.storageKey].filter(Boolean) as string[]),
        ...dubbingRows.flatMap(d => [d.dubbedAudioKey, d.mixedAudioKey].filter(Boolean) as string[]),
        ...clipAudioRows.flatMap(a => [a.audioKey].filter(Boolean) as string[]),
      ];

      await Promise.allSettled(r2Keys.map(key => R2Service.deleteFile(key)));

      await AdminModel.deleteUser(userId);
      return c.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("[ADMIN] Failed to delete user:", error);
      return c.json({ error: "Failed to delete user" }, 500);
    }
  }

  /**
   * Get system health metrics
   * GET /api/admin/system-health
   */
  static async getSystemHealth(c: Context) {
    try {
      const health = await AdminModel.getSystemHealth();
      return c.json(health);
    } catch (error) {
      console.error("[ADMIN] Failed to get system health:", error);
      return c.json({ error: "Failed to get system health" }, 500);
    }
  }

  /**
   * Get credit analytics
   * GET /api/admin/analytics/credits?days=30
   */
  static async getCreditAnalytics(c: Context) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(c.req.query("days") || "30", 10)));
      const data = await AdminModel.getCreditAnalytics(days);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get credit analytics:", error);
      return c.json({ error: "Failed to get credit analytics" }, 500);
    }
  }

  /**
   * Get credit transactions
   * GET /api/admin/transactions?page=1&limit=50
   */
  static async getCreditTransactions(c: Context) {
    try {
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
      const data = await AdminModel.getCreditTransactions(page, limit);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get credit transactions:", error);
      return c.json({ error: "Failed to get credit transactions" }, 500);
    }
  }

  /**
   * Get all videos with pagination and filters
   * GET /api/admin/videos?page=1&limit=20&status=failed&sourceType=youtube&search=test
   */
  static async getAllVideos(c: Context) {
    try {
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
      const filters = {
        status: c.req.query("status") || undefined,
        sourceType: c.req.query("sourceType") || undefined,
        search: c.req.query("search") || undefined,
        dateFrom: c.req.query("dateFrom") || undefined,
        dateTo: c.req.query("dateTo") || undefined,
      };
      const data = await AdminModel.getAllVideos(page, limit, filters);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get videos:", error);
      return c.json({ error: "Failed to get videos" }, 500);
    }
  }

  /**
   * Get video detail
   * GET /api/admin/videos/:id
   */
  static async getVideoDetail(c: Context) {
    try {
      const videoId = c.req.param("id");
      const data = await AdminModel.getVideoDetail(videoId);
      if (!data) {
        return c.json({ error: "Video not found" }, 404);
      }
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get video detail:", error);
      return c.json({ error: "Failed to get video detail" }, 500);
    }
  }

  /**
   * Get video analytics
   * GET /api/admin/videos/analytics?days=30
   */
  static async getVideoAnalytics(c: Context) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(c.req.query("days") || "30", 10)));
      const data = await AdminModel.getVideoAnalytics(days);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get video analytics:", error);
      return c.json({ error: "Failed to get video analytics" }, 500);
    }
  }

  /**
   * Retry a failed video
   * POST /api/admin/videos/:id/retry
   */
  static async retryVideo(c: Context) {
    try {
      const videoId = c.req.param("id");
      const result = await AdminModel.retryVideo(videoId);

      if (!result) {
        return c.json({ error: "Video not found" }, 404);
      }
      if ("error" in result) {
        return c.json({ error: result.error }, 400);
      }

      // Re-queue the video for processing
      await addVideoProcessingJob({
        videoId: result.id,
        projectId: result.projectId,
        userId: result.userId,
        sourceType: result.sourceType as "youtube" | "upload",
        sourceUrl: result.sourceUrl || "",
      });

      return c.json({ success: true, message: "Video queued for retry" });
    } catch (error) {
      console.error("[ADMIN] Failed to retry video:", error);
      return c.json({ error: "Failed to retry video" }, 500);
    }
  }

  /**
   * Get videos for a specific user
   * GET /api/admin/users/:id/videos?page=1&limit=20
   */
  static async getUserVideos(c: Context) {
    try {
      const userId = c.req.param("id");
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
      const data = await AdminModel.getUserVideos(userId, page, limit);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get user videos:", error);
      return c.json({ error: "Failed to get user videos" }, 500);
    }
  }

  /**
   * Get clips for a specific user
   * GET /api/admin/users/:id/clips?page=1&limit=20
   */
  static async getUserClips(c: Context) {
    try {
      const userId = c.req.param("id");
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
      const data = await AdminModel.getUserClips(userId, page, limit);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get user clips:", error);
      return c.json({ error: "Failed to get user clips" }, 500);
    }
  }
}
