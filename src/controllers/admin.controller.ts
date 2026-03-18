import { Context } from "hono";
import { AdminModel } from "../models/admin.model";
import { addVideoProcessingJob } from "../jobs/queue";
import { VideoModel } from "../models/video.model";
import { ClipModel } from "../models/clip.model";
import { R2Service } from "../services/r2.service";
import { db } from "../db";
import { videoExport, voiceDubbing, dubbedClipAudio, session as sessionTable } from "../db/schema";
import { inArray, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

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
   * Get workspaces with subscription data for a user
   * GET /api/admin/users/:id/workspaces
   */
  static async getUserWorkspaces(c: Context) {
    try {
      const userId = c.req.param("id");
      const data = await AdminModel.getUserWorkspaces(userId);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get user workspaces:", error);
      return c.json({ error: "Failed to get user workspaces" }, 500);
    }
  }

  /**
   * Get a single user by ID
   * GET /api/admin/users/:id
   */
  static async getUserById(c: Context) {
    try {
      const userId = c.req.param("id");
      const user = await AdminModel.getUserById(userId);
      if (!user) return c.json({ error: "User not found" }, 404);
      return c.json(user);
    } catch (error) {
      console.error("[ADMIN] Failed to get user:", error);
      return c.json({ error: "Failed to get user" }, 500);
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
   * Retry a failed clip (admin)
   * POST /api/admin/clips/:id/retry
   */
  static async retryClip(c: Context) {
    try {
      const clipId = c.req.param("id");
      const clip = await ClipModel.getById(clipId);
      if (!clip) return c.json({ error: "Clip not found" }, 404);
      if (clip.status !== "failed") return c.json({ error: "Clip is not in failed state" }, 400);

      // Reset clip status to detected so it can be re-queued
      await ClipModel.update(clipId, { status: "detected", errorMessage: undefined });

      return c.json({ success: true, message: "Clip reset to detected - re-queue via video regeneration" });
    } catch (error) {
      console.error("[ADMIN] Failed to retry clip:", error);
      return c.json({ error: "Failed to retry clip" }, 500);
    }
  }

  /**
   * Get all failed videos and clips (admin)
   * GET /api/admin/failed?page=1&limit=20
   */
  static async getFailedItems(c: Context) {
    try {
      const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
      const offset = (page - 1) * limit;

      const [failedVideos, failedClips, totalVideos, totalClips] = await Promise.all([
        db.execute(sql`
          SELECT v.id, v.title, v.status, v.source_type, v.error_message,
                 v.created_at, v.updated_at, v.user_id,
                 u.name as user_name, u.email as user_email,
                 w.name as workspace_name
          FROM video v
          LEFT JOIN "user" u ON u.id = v.user_id
          LEFT JOIN workspace w ON w.id = v.workspace_id
          WHERE v.status = 'failed'
          ORDER BY v.updated_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `),
        db.execute(sql`
          SELECT vc.id, vc.title, vc.status, vc.created_at, vc.updated_at,
                 v.id as video_id, v.title as video_title, v.user_id,
                 u.name as user_name, u.email as user_email,
                 w.name as workspace_name
          FROM viral_clip vc
          JOIN video v ON v.id = vc.video_id
          LEFT JOIN "user" u ON u.id = v.user_id
          LEFT JOIN workspace w ON w.id = v.workspace_id
          WHERE vc.status = 'failed'
          ORDER BY vc.updated_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `),
        db.execute(sql`SELECT COUNT(*) as count FROM video WHERE status = 'failed'`),
        db.execute(sql`
          SELECT COUNT(*) as count FROM viral_clip WHERE status = 'failed'
        `),
      ]);

      return c.json({
        failedVideos: (failedVideos.rows as any[]).map(r => ({
          id: r.id, title: r.title, status: r.status, sourceType: r.source_type,
          errorMessage: r.error_message, createdAt: r.created_at, updatedAt: r.updated_at,
          userId: r.user_id, userName: r.user_name, userEmail: r.user_email,
          workspaceName: r.workspace_name,
        })),
        failedClips: (failedClips.rows as any[]).map(r => ({
          id: r.id, title: r.title, status: r.status, createdAt: r.created_at,
          updatedAt: r.updated_at, videoId: r.video_id, videoTitle: r.video_title,
          userId: r.user_id, userName: r.user_name, userEmail: r.user_email,
          workspaceName: r.workspace_name,
        })),
        totalFailedVideos: Number((totalVideos.rows[0] as any)?.count ?? 0),
        totalFailedClips: Number((totalClips.rows[0] as any)?.count ?? 0),
        page, limit,
      });
    } catch (error) {
      console.error("[ADMIN] Failed to get failed items:", error);
      return c.json({ error: "Failed to get failed items" }, 500);
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

  /**
   * Generate a magic login link for a user (admin only)
   * POST /api/admin/users/:id/magic-link
   */
  static async generateMagicLink(c: Context) {
    try {
      const userId = c.req.param("id");
      const user = await AdminModel.getUserById(userId);
      if (!user) return c.json({ error: "User not found" }, 404);

      const token = nanoid(48);
      const sessionId = nanoid();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

      await db.insert(sessionTable).values({
        id: sessionId,
        token,
        userId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        ipAddress: "admin-magic-link",
      });

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const backendUrl = process.env.BETTER_AUTH_URL || "http://localhost:3001";
      const magicLink = `${backendUrl}/api/magic-login?token=${token}`;

      return c.json({ magicLink });
    } catch (error) {
      console.error("[ADMIN] Failed to generate magic link:", error);
      return c.json({ error: "Failed to generate magic link" }, 500);
    }
  }

  /**
   * Proxy YouTube health status from worker
   * GET /api/admin/youtube-health
   * POST /api/admin/youtube-health (with { url } body to run a live test)
   */
  static async getYouTubeHealth(c: Context) {
    try {
      const workerUrl = process.env.WORKER_URL;
      if (!workerUrl) {
        return c.json({ error: "WORKER_URL not configured" }, 500);
      }
      const workerSecret = process.env.WORKER_SECRET;
      if (!workerSecret) {
        return c.json({ error: "WORKER_SECRET not configured" }, 500);
      }
      const method = c.req.method;
      const fetchOptions: RequestInit = {
        method,
        headers: {
          "Authorization": `Bearer ${workerSecret}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(35000),
      };
      if (method === "POST") {
        const body = await c.req.json().catch(() => ({}));
        fetchOptions.body = JSON.stringify(body);
      }
      const res = await fetch(`${workerUrl}/health/youtube-status`, fetchOptions);
      const data = await res.json();
      // Don't pass through worker auth errors as 401 - that confuses the frontend
      // into thinking the admin session is invalid
      if (res.status === 401 || res.status === 403) {
        return c.json({ error: "Worker rejected request - check WORKER_SECRET env var on API server" }, 502);
      }
      return c.json(data, res.status as any);
    } catch (error) {
      console.error("[ADMIN] Failed to get YouTube health:", error instanceof Error ? error.message : error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to reach worker: ${msg}` }, 502);
    }
  }

  /**
   * Proxy worker debug dashboard data
   * GET /api/admin/worker-status
   */
  static async getWorkerStatus(c: Context) {
    try {
      const workerUrl = process.env.WORKER_URL;
      if (!workerUrl) return c.json({ error: "WORKER_URL not configured" }, 500);
      const workerSecret = process.env.WORKER_SECRET;
      if (!workerSecret) return c.json({ error: "WORKER_SECRET not configured" }, 500);

      const res = await fetch(`${workerUrl}/health/hevin`, {
        headers: { "Authorization": `Bearer ${workerSecret}` },
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        return c.json({ error: "Worker rejected request - check WORKER_SECRET" }, 502);
      }
      return c.json(data, res.status as any);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to reach worker: ${msg}` }, 502);
    }
  }

  /**
   * Proxy worker log stream (SSE)
   * GET /api/admin/worker-logs/stream?type=out|err|both&lines=100
   */
  static async getWorkerLogStream(c: Context) {
    try {
      const workerUrl = process.env.WORKER_URL;
      if (!workerUrl) return c.json({ error: "WORKER_URL not configured" }, 500);
      const workerSecret = process.env.WORKER_SECRET;
      if (!workerSecret) return c.json({ error: "WORKER_SECRET not configured" }, 500);

      const type = c.req.query("type") || "both";
      const lines = c.req.query("lines") || "100";

      const res = await fetch(
        `${workerUrl}/health/hevin/logs/stream?type=${type}&lines=${lines}`,
        {
          headers: { "Authorization": `Bearer ${workerSecret}` },
          signal: c.req.raw.signal,
        }
      );

      if (res.status === 401 || res.status === 403) {
        return c.json({ error: "Worker rejected request - check WORKER_SECRET" }, 502);
      }

      if (!res.body) {
        return c.json({ error: "No stream body from worker" }, 502);
      }

      return new Response(res.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to reach worker: ${msg}` }, 502);
    }
  }

  // ── EC2 Instance Management ─────────────────────────────────

  private static getEC2Client() {
    const { EC2Client } = require("@aws-sdk/client-ec2");
    return new EC2Client({ region: process.env.AWS_REGION || "us-east-1" });
  }

  /**
   * Get EC2 instance statuses for base + burst
   * GET /api/admin/ec2/status
   */
  static async getEC2Status(c: Context) {
    try {
      const { DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
      const ec2 = AdminController.getEC2Client();

      const baseId = process.env.BASE_INSTANCE_ID;
      const burstId = process.env.BURST_INSTANCE_ID;
      if (!baseId || !burstId) {
        return c.json({ error: "EC2 instance IDs not configured" }, 500);
      }

      const res = await ec2.send(
        new DescribeInstancesCommand({ InstanceIds: [baseId, burstId] })
      );

      const instances = (res.Reservations || []).flatMap((r: any) => r.Instances || []);
      const format = (inst: any) => ({
        id: inst.InstanceId,
        state: inst.State?.Name || "unknown",
        type: inst.InstanceType,
        ip: inst.PublicIpAddress || null,
        launchTime: inst.LaunchTime?.toISOString() || null,
        cpuCount: inst.CpuOptions?.CoreCount ? inst.CpuOptions.CoreCount * (inst.CpuOptions.ThreadsPerCore || 1) : null,
      });

      const baseInst = instances.find((i: any) => i.InstanceId === baseId);
      const burstInst = instances.find((i: any) => i.InstanceId === burstId);

      return c.json({
        base: baseInst ? { ...format(baseInst), role: "base", label: "Base (8GB)" } : { id: baseId, state: "unknown", role: "base" },
        burst: burstInst ? { ...format(burstInst), role: "burst", label: "Burst (32GB)" } : { id: burstId, state: "unknown", role: "burst" },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `EC2 status failed: ${msg}` }, 500);
    }
  }

  /**
   * Start or stop an EC2 instance
   * POST /api/admin/ec2/control
   * Body: { instanceId: string, action: "start" | "stop" }
   */
  static async controlEC2Instance(c: Context) {
    try {
      const { StartInstancesCommand, StopInstancesCommand } = require("@aws-sdk/client-ec2");
      const ec2 = AdminController.getEC2Client();

      const body = await c.req.json();
      const { instanceId, action } = body;

      const baseId = process.env.BASE_INSTANCE_ID;
      const burstId = process.env.BURST_INSTANCE_ID;

      // Only allow controlling known instances
      if (instanceId !== baseId && instanceId !== burstId) {
        return c.json({ error: "Unknown instance ID" }, 400);
      }

      if (action === "start") {
        await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
        return c.json({ success: true, message: `Starting instance ${instanceId}` });
      } else if (action === "stop") {
        await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
        return c.json({ success: true, message: `Stopping instance ${instanceId}` });
      } else {
        return c.json({ error: "Invalid action. Use 'start' or 'stop'" }, 400);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `EC2 control failed: ${msg}` }, 500);
    }
  }

  /**
   * Get burst worker status (proxied via burst instance IP)
   * GET /api/admin/burst-status
   */
  static async getBurstWorkerStatus(c: Context) {
    try {
      const { DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
      const ec2 = AdminController.getEC2Client();
      const burstId = process.env.BURST_INSTANCE_ID;
      if (!burstId) return c.json({ error: "BURST_INSTANCE_ID not configured" }, 500);

      // Get burst instance IP
      const desc = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [burstId] }));
      const inst = desc.Reservations?.[0]?.Instances?.[0];
      if (!inst || inst.State?.Name !== "running") {
        return c.json({ error: "Burst instance not running", state: inst?.State?.Name || "unknown" }, 200);
      }

      const burstIp = inst.PublicIpAddress;
      if (!burstIp) return c.json({ error: "Burst instance has no public IP" }, 200);

      const burstPort = process.env.BURST_HEALTH_PORT || "3003";
      const res = await fetch(`http://${burstIp}:${burstPort}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      return c.json(data, res.status as any);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      const isConnectError = msg.includes("Unable to connect") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("fetch failed");
      const hint = isConnectError
        ? ` (Check: 1) EC2 security group allows inbound TCP on port ${process.env.BURST_HEALTH_PORT || "3003"}, 2) burst worker process is running on the instance)`
        : "";
      return c.json({ error: `Failed to reach burst worker: ${msg}${hint}` }, 200);
    }
  }

  /**
   * Get autoscaler state from Redis
   * GET /api/admin/scaler-state
   */
  static async getScalerState(c: Context) {
    try {
      const IORedis = require("ioredis");
      const redisUrl = process.env.REDIS_URL;
      const redisHost = process.env.REDIS_HOST || "localhost";
      const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
      const redisPassword = process.env.REDIS_PASSWORD || undefined;

      const redisOpts: any = { maxRetriesPerRequest: 1, connectTimeout: 5000, lazyConnect: true };
      const redis = redisUrl
        ? new IORedis(redisUrl, redisOpts)
        : new IORedis({ host: redisHost, port: redisPort, password: redisPassword, ...redisOpts });

      await redis.connect();
      const raw = await redis.get("scaler:state");
      await redis.quit();

      if (!raw) return c.json({ error: "No scaler state found — scaler may not be running" }, 200);
      return c.json(JSON.parse(raw));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to read scaler state: ${msg}` }, 200);
    }
  }

  /**
   * Force the autoscaler to check the queue immediately
   * POST /api/admin/scaler-check
   */
  static async forceScalerCheck(c: Context) {
    try {
      const IORedis = require("ioredis");
      const redisUrl = process.env.REDIS_URL;
      const redisHost = process.env.REDIS_HOST || "localhost";
      const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
      const redisPassword = process.env.REDIS_PASSWORD || undefined;

      const redisOpts: any = { maxRetriesPerRequest: 1, connectTimeout: 5000, lazyConnect: true };
      const redis = redisUrl
        ? new IORedis(redisUrl, redisOpts)
        : new IORedis({ host: redisHost, port: redisPort, password: redisPassword, ...redisOpts });

      await redis.connect();
      await redis.publish("scaler:force-check", "1");
      await redis.quit();

      return c.json({ success: true, message: "Force check triggered" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to trigger check: ${msg}` }, 500);
    }
  }

  /**
   * List burst instance logs from R2
   * GET /api/admin/burst-logs
   */
  static async getBurstLogs(c: Context) {
    try {
      const { R2Service } = require("../services/r2.service");
      const files = await R2Service.listFiles("logs/burst/");
      // Separate latest from historical, exclude "latest" files from the list
      const latest = {
        out: files.find((f: any) => f.key === "logs/burst/burst-out-latest.log") || null,
        error: files.find((f: any) => f.key === "logs/burst/burst-error-latest.log") || null,
      };
      const historical = files.filter(
        (f: any) => !f.key.includes("-latest.log")
      ).map((f: any) => ({
        ...f,
        type: f.key.includes("burst-error") ? "error" : "out",
        timestamp: f.key.match(/burst-(?:out|error)-(.+)\.log$/)?.[1]?.replace(/-/g, (m: string, i: number) => {
          // Restore ISO format: first two dashes are date separators, T separator, then colons and dots
          return i < 20 ? m : m;
        }) || null,
      }));
      return c.json({ latest, historical, total: historical.length });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to list burst logs: ${msg}` }, 500);
    }
  }

  /**
   * Trigger on-demand burst log sync (calls burst instance directly to upload to R2)
   * POST /api/admin/burst-logs/sync
   */
  static async syncBurstLogs(c: Context) {
    try {
      const { DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
      const ec2 = AdminController.getEC2Client();
      const burstId = process.env.BURST_INSTANCE_ID;
      if (!burstId) return c.json({ error: "BURST_INSTANCE_ID not configured" }, 500);

      // Get burst instance IP
      const desc = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [burstId] }));
      const inst = desc.Reservations?.[0]?.Instances?.[0];
      if (!inst || inst.State?.Name !== "running") {
        return c.json({ error: "Burst instance not running", state: inst?.State?.Name || "unknown" }, 200);
      }

      const burstIp = inst.PublicIpAddress;
      if (!burstIp) return c.json({ error: "Burst instance has no public IP" }, 200);

      const burstPort = process.env.BURST_HEALTH_PORT || "3003";
      const res = await fetch(`http://${burstIp}:${burstPort}/health/upload-logs`, {
        method: "POST",
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      return c.json(data, res.status as any);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to sync burst logs: ${msg}` }, 500);
    }
  }

  /**
   * Fetch a burst log file content from R2 (proxied to avoid CORS issues)
   * GET /api/admin/burst-logs/content?key=logs/burst/burst-out-latest.log
   */
  static async getBurstLogContent(c: Context) {
    try {
      const key = c.req.query("key");
      if (!key || !key.startsWith("logs/burst/")) {
        return c.json({ error: "Invalid log key" }, 400);
      }
      const { R2Service } = require("../services/r2.service");
      const url = R2Service.getPublicUrl(key);
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        return c.json({ error: `Log file not found (${res.status})` }, 404);
      }
      const content = await res.text();
      return c.text(content, 200, { "Content-Type": "text/plain; charset=utf-8" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to fetch log content: ${msg}` }, 500);
    }
  }

  /**
   * Test yt-dlp on burst instance
   * POST /api/admin/burst-youtube-test
   * Body: { url: string }
   */
  static async testBurstYouTube(c: Context) {
    try {
      const { DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
      const ec2 = AdminController.getEC2Client();
      const burstId = process.env.BURST_INSTANCE_ID;
      if (!burstId) return c.json({ error: "BURST_INSTANCE_ID not configured" }, 500);

      const desc = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [burstId] }));
      const inst = desc.Reservations?.[0]?.Instances?.[0];
      if (!inst || inst.State?.Name !== "running") {
        return c.json({ instance: "burst", test: { ok: false, error: "Burst instance is offline" }, state: inst?.State?.Name || "unknown" }, 200);
      }

      const burstIp = inst.PublicIpAddress;
      if (!burstIp) return c.json({ instance: "burst", test: { ok: false, error: "Burst instance has no public IP" } }, 200);

      const burstPort = process.env.BURST_HEALTH_PORT || "3003";
      const body = await c.req.json().catch(() => ({}));
      const res = await fetch(`http://${burstIp}:${burstPort}/health/youtube-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35000),
      });
      const data = await res.json();
      return c.json(data, res.status as any);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ instance: "burst", test: { ok: false, error: `Failed to reach burst: ${msg}` } }, 200);
    }
  }

  /**
   * Read live logs directly from burst instance (no R2, instant)
   * GET /api/admin/burst-logs/live?type=out|error&lines=500
   */
  static async getBurstLogsLive(c: Context) {
    try {
      const { DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
      const ec2 = AdminController.getEC2Client();
      const burstId = process.env.BURST_INSTANCE_ID;
      if (!burstId) return c.json({ error: "BURST_INSTANCE_ID not configured" }, 500);

      const desc = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [burstId] }));
      const inst = desc.Reservations?.[0]?.Instances?.[0];
      if (!inst || inst.State?.Name !== "running") {
        return c.json({ error: "Burst instance not running", state: inst?.State?.Name || "unknown" }, 200);
      }

      const burstIp = inst.PublicIpAddress;
      if (!burstIp) return c.json({ error: "Burst instance has no public IP" }, 200);

      const type = c.req.query("type") || "out";
      const lines = c.req.query("lines") || "500";
      const burstPort = process.env.BURST_HEALTH_PORT || "3003";
      const res = await fetch(`http://${burstIp}:${burstPort}/health/logs?type=${type}&lines=${lines}`, {
        signal: AbortSignal.timeout(15000),
      });
      const content = await res.text();
      return c.text(content, res.status as any, { "Content-Type": "text/plain; charset=utf-8" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to read burst logs: ${msg}` }, 500);
    }
  }
}
