import { db } from "../db";
import { user, workspace, workspaceMember, video, viralClip, session, project, creditTransaction, videoExport } from "../db/schema";
import { eq, sql, desc, gte, and, count } from "drizzle-orm";
import { performance } from "perf_hooks";

export interface DashboardStats {
  totalUsers: number;
  totalWorkspaces: number;
  totalVideos: number;
  totalClips: number;
  totalExports: number;
  activeUsers: number; // Users with sessions in last 7 days
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
}

export interface UserGrowthData {
  date: string;
  users: number;
}

export interface VideoProcessingStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface WorkspacePlanDistribution {
  plan: string;
  count: number;
}

export interface TopWorkspace {
  id: string;
  name: string;
  slug: string;
  videoCount: number;
  clipCount: number;
  memberCount: number;
}

export class AdminModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[ADMIN MODEL] ${operation}`, details ? JSON.stringify(details) : "");
  }

  /**
   * Get dashboard overview stats
   */
  static async getDashboardStats(): Promise<DashboardStats> {
    this.logOperation("GET_DASHBOARD_STATS");
    const startTime = performance.now();

    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Run all queries in parallel
      const [
        usersResult,
        workspacesResult,
        videosResult,
        clipsResult,
        exportsResult,
        activeUsersResult,
        newUsersTodayResult,
        newUsersWeekResult,
        newUsersMonthResult,
      ] = await Promise.all([
        db.select({ count: count() }).from(user),
        db.select({ count: count() }).from(workspace),
        db.select({ count: count() }).from(video),
        db.select({ count: count() }).from(viralClip),
        db.select({ count: count() }).from(videoExport),
        db.select({ count: sql<number>`count(distinct ${session.userId})` })
          .from(session)
          .where(gte(session.createdAt, weekAgo)),
        db.select({ count: count() }).from(user).where(gte(user.createdAt, today)),
        db.select({ count: count() }).from(user).where(gte(user.createdAt, weekAgo)),
        db.select({ count: count() }).from(user).where(gte(user.createdAt, monthAgo)),
      ]);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_DASHBOARD_STATS completed in ${duration.toFixed(2)}ms`);

      return {
        totalUsers: usersResult[0]?.count ?? 0,
        totalWorkspaces: workspacesResult[0]?.count ?? 0,
        totalVideos: videosResult[0]?.count ?? 0,
        totalClips: clipsResult[0]?.count ?? 0,
        totalExports: exportsResult[0]?.count ?? 0,
        activeUsers: activeUsersResult[0]?.count ?? 0,
        newUsersToday: newUsersTodayResult[0]?.count ?? 0,
        newUsersThisWeek: newUsersWeekResult[0]?.count ?? 0,
        newUsersThisMonth: newUsersMonthResult[0]?.count ?? 0,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_DASHBOARD_STATS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }


  /**
   * Get user growth data for the last N days
   */
  static async getUserGrowthData(days: number = 30): Promise<UserGrowthData[]> {
    this.logOperation("GET_USER_GROWTH_DATA", { days });
    const startTime = performance.now();

    try {
      const result = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as users
        FROM "user"
        WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_USER_GROWTH_DATA completed in ${duration.toFixed(2)}ms`);

      return (result.rows as any[]).map(row => ({
        date: row.date,
        users: Number(row.users),
      }));
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_USER_GROWTH_DATA failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get video processing status distribution
   */
  static async getVideoProcessingStats(): Promise<VideoProcessingStats> {
    this.logOperation("GET_VIDEO_PROCESSING_STATS");
    const startTime = performance.now();

    try {
      const result = await db.execute(sql`
        SELECT 
          status,
          COUNT(*) as count
        FROM video
        GROUP BY status
      `);

      const stats: VideoProcessingStats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      };

      for (const row of result.rows as any[]) {
        const status = row.status as string;
        const count = Number(row.count);
        
        if (status === "pending" || status === "pending_config") {
          stats.pending += count;
        } else if (["downloading", "uploading", "transcribing", "analyzing"].includes(status)) {
          stats.processing += count;
        } else if (status === "completed") {
          stats.completed = count;
        } else if (status === "failed") {
          stats.failed = count;
        }
      }

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_VIDEO_PROCESSING_STATS completed in ${duration.toFixed(2)}ms`);

      return stats;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_VIDEO_PROCESSING_STATS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get workspace plan distribution
   */
  static async getWorkspacePlanDistribution(): Promise<WorkspacePlanDistribution[]> {
    this.logOperation("GET_WORKSPACE_PLAN_DISTRIBUTION");
    const startTime = performance.now();

    try {
      const result = await db.execute(sql`
        SELECT 
          COALESCE(plan, 'free') as plan,
          COUNT(*) as count
        FROM workspace
        GROUP BY plan
        ORDER BY count DESC
      `);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_WORKSPACE_PLAN_DISTRIBUTION completed in ${duration.toFixed(2)}ms`);

      return (result.rows as any[]).map(row => ({
        plan: row.plan || "free",
        count: Number(row.count),
      }));
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_WORKSPACE_PLAN_DISTRIBUTION failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get top workspaces by activity
   */
  static async getTopWorkspaces(limit: number = 10): Promise<TopWorkspace[]> {
    this.logOperation("GET_TOP_WORKSPACES", { limit });
    const startTime = performance.now();

    try {
      const result = await db.execute(sql`
        SELECT 
          w.id,
          w.name,
          w.slug,
          COALESCE(v.video_count, 0) as video_count,
          COALESCE(c.clip_count, 0) as clip_count,
          COALESCE(m.member_count, 0) as member_count
        FROM workspace w
        LEFT JOIN (
          SELECT p.workspace_id, COUNT(v.id) as video_count
          FROM project p
          LEFT JOIN video v ON v.project_id = p.id
          GROUP BY p.workspace_id
        ) v ON v.workspace_id = w.id
        LEFT JOIN (
          SELECT p.workspace_id, COUNT(vc.id) as clip_count
          FROM project p
          LEFT JOIN video vid ON vid.project_id = p.id
          LEFT JOIN viral_clip vc ON vc.video_id = vid.id
          GROUP BY p.workspace_id
        ) c ON c.workspace_id = w.id
        LEFT JOIN (
          SELECT workspace_id, COUNT(*) as member_count
          FROM workspace_member
          GROUP BY workspace_id
        ) m ON m.workspace_id = w.id
        ORDER BY video_count DESC, clip_count DESC
        LIMIT ${limit}
      `);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_TOP_WORKSPACES completed in ${duration.toFixed(2)}ms`);

      return (result.rows as any[]).map(row => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        videoCount: Number(row.video_count),
        clipCount: Number(row.clip_count),
        memberCount: Number(row.member_count),
      }));
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_TOP_WORKSPACES failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }


  /**
   * Get all users with pagination
   */
  static async getAllUsers(page: number = 1, limit: number = 20) {
    this.logOperation("GET_ALL_USERS_PAGINATED", { page, limit });
    const startTime = performance.now();

    try {
      const offset = (page - 1) * limit;

      const [users, totalResult] = await Promise.all([
        db.select({
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          image: user.image,
          role: user.role,
          emailVerified: user.emailVerified,
          isOnboarded: user.isOnboarded,
          twoFactorEnabled: user.twoFactorEnabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
        .from(user)
        .orderBy(desc(user.createdAt))
        .limit(limit)
        .offset(offset),
        db.select({ count: count() }).from(user),
      ]);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_ALL_USERS_PAGINATED completed in ${duration.toFixed(2)}ms`);

      return {
        users,
        total: totalResult[0]?.count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limit),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_ALL_USERS_PAGINATED failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get all workspaces with pagination
   */
  static async getAllWorkspaces(page: number = 1, limit: number = 20) {
    this.logOperation("GET_ALL_WORKSPACES_PAGINATED", { page, limit });
    const startTime = performance.now();

    try {
      const offset = (page - 1) * limit;

      const [workspaces, totalResult] = await Promise.all([
        db.select()
          .from(workspace)
          .orderBy(desc(workspace.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: count() }).from(workspace),
      ]);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_ALL_WORKSPACES_PAGINATED completed in ${duration.toFixed(2)}ms`);

      return {
        workspaces,
        total: totalResult[0]?.count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limit),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_ALL_WORKSPACES_PAGINATED failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Update user role
   */
  static async updateUserRole(userId: string, role: string) {
    this.logOperation("UPDATE_USER_ROLE", { userId, role });
    const startTime = performance.now();

    try {
      const result = await db
        .update(user)
        .set({ role, updatedAt: new Date() })
        .where(eq(user.id, userId))
        .returning();

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] UPDATE_USER_ROLE completed in ${duration.toFixed(2)}ms`);

      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] UPDATE_USER_ROLE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Delete user (admin action)
   */
  static async deleteUser(userId: string) {
    this.logOperation("DELETE_USER", { userId });
    const startTime = performance.now();

    try {
      await db.delete(user).where(eq(user.id, userId));

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] DELETE_USER completed in ${duration.toFixed(2)}ms`);
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] DELETE_USER failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get daily activity data (videos, clips, exports)
   */
  static async getDailyActivityData(days: number = 30) {
    this.logOperation("GET_DAILY_ACTIVITY_DATA", { days });
    const startTime = performance.now();

    try {
      const result = await db.execute(sql`
        WITH dates AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '${sql.raw(days.toString())} days',
            CURRENT_DATE,
            '1 day'::interval
          )::date as date
        ),
        video_counts AS (
          SELECT DATE(created_at) as date, COUNT(*) as count
          FROM video
          WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
          GROUP BY DATE(created_at)
        ),
        clip_counts AS (
          SELECT DATE(created_at) as date, COUNT(*) as count
          FROM viral_clip
          WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
          GROUP BY DATE(created_at)
        ),
        export_counts AS (
          SELECT DATE(created_at) as date, COUNT(*) as count
          FROM video_export
          WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
          GROUP BY DATE(created_at)
        )
        SELECT 
          d.date,
          COALESCE(v.count, 0) as videos,
          COALESCE(c.count, 0) as clips,
          COALESCE(e.count, 0) as exports
        FROM dates d
        LEFT JOIN video_counts v ON v.date = d.date
        LEFT JOIN clip_counts c ON c.date = d.date
        LEFT JOIN export_counts e ON e.date = d.date
        ORDER BY d.date ASC
      `);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_DAILY_ACTIVITY_DATA completed in ${duration.toFixed(2)}ms`);

      return (result.rows as any[]).map(row => ({
        date: row.date,
        videos: Number(row.videos),
        clips: Number(row.clips),
        exports: Number(row.exports),
      }));
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_DAILY_ACTIVITY_DATA failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get recent activity feed
   */
  static async getRecentActivity(limit: number = 20) {
    this.logOperation("GET_RECENT_ACTIVITY", { limit });
    const startTime = performance.now();

    try {
      // Get recent users
      const recentUsers = await db.select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(5);

      // Get recent videos
      const recentVideos = await db.select({
        id: video.id,
        title: video.title,
        status: video.status,
        createdAt: video.createdAt,
      })
      .from(video)
      .orderBy(desc(video.createdAt))
      .limit(5);

      // Get recent workspaces
      const recentWorkspaces = await db.select({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        createdAt: workspace.createdAt,
      })
      .from(workspace)
      .orderBy(desc(workspace.createdAt))
      .limit(5);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_RECENT_ACTIVITY completed in ${duration.toFixed(2)}ms`);

      return {
        recentUsers,
        recentVideos,
        recentWorkspaces,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_RECENT_ACTIVITY failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get system health metrics
   */
  static async getSystemHealth() {
    this.logOperation("GET_SYSTEM_HEALTH");
    const startTime = performance.now();

    try {
      // Get video processing stats for queue simulation
      const videoStats = await this.getVideoProcessingStats();
      
      // Calculate error rate from RECENT failed videos (last 7 days) - not all-time
      const recentErrorResult = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
          COUNT(*) as total_count
        FROM video
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);
      
      const recentStats = recentErrorResult.rows[0] as any;
      const recentTotal = Number(recentStats?.total_count || 0);
      const recentFailed = Number(recentStats?.failed_count || 0);
      const errorRate = recentTotal > 0 ? (recentFailed / recentTotal) * 100 : 0;

      // Get average processing times (simulated based on completed videos)
      const avgTimesResult = await db.execute(sql`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time
        FROM video
        WHERE status = 'completed'
        AND updated_at > created_at
        LIMIT 100
      `);

      const avgProcessingTime = (avgTimesResult.rows[0] as any)?.avg_processing_time || 0;

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_SYSTEM_HEALTH completed in ${duration.toFixed(2)}ms`);

      return {
        queueStats: {
          videoQueue: {
            waiting: videoStats.pending,
            active: videoStats.processing,
            completed: videoStats.completed,
            failed: videoStats.failed,
          },
          clipQueue: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
          },
        },
        processingTimes: {
          avgTranscriptionTime: Math.round(avgProcessingTime / 2),
          avgClipGenerationTime: Math.round(avgProcessingTime / 2),
        },
        errorRate: Math.round(errorRate * 100) / 100,
        uptime: 99.9, // Placeholder - would come from actual monitoring
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_SYSTEM_HEALTH failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get credit analytics
   */
  static async getCreditAnalytics(days: number = 30) {
    this.logOperation("GET_CREDIT_ANALYTICS", { days });
    const startTime = performance.now();

    try {
      // Get total credits used and added
      const totalsResult = await db.execute(sql`
        SELECT 
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_used,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_added
        FROM credit_transaction
        WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
      `);

      // Get credits by day
      const dailyResult = await db.execute(sql`
        SELECT 
          DATE(created_at) as date,
          COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as used,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as added
        FROM credit_transaction
        WHERE created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `);

      // Get top credit users
      const topUsersResult = await db.execute(sql`
        SELECT 
          ct.workspace_id,
          w.name,
          COALESCE(SUM(CASE WHEN ct.amount < 0 THEN ABS(ct.amount) ELSE 0 END), 0) as credits_used
        FROM credit_transaction ct
        JOIN workspace w ON w.id = ct.workspace_id
        WHERE ct.created_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'
        GROUP BY ct.workspace_id, w.name
        ORDER BY credits_used DESC
        LIMIT 10
      `);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_CREDIT_ANALYTICS completed in ${duration.toFixed(2)}ms`);

      const totals = totalsResult.rows[0] as any;
      return {
        totalCreditsUsed: Number(totals?.total_used || 0),
        totalCreditsAdded: Number(totals?.total_added || 0),
        creditsByDay: (dailyResult.rows as any[]).map(row => ({
          date: row.date,
          used: Number(row.used),
          added: Number(row.added),
        })),
        topCreditUsers: (topUsersResult.rows as any[]).map(row => ({
          workspaceId: row.workspace_id,
          name: row.name || "Unknown",
          email: "",
          creditsUsed: Number(row.credits_used),
        })),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_CREDIT_ANALYTICS failed after ${duration.toFixed(2)}ms:`, error);
      // Return empty data on error
      return {
        totalCreditsUsed: 0,
        totalCreditsAdded: 0,
        creditsByDay: [],
        topCreditUsers: [],
      };
    }
  }

  /**
   * Get credit transactions with pagination
   */
  static async getCreditTransactions(page: number = 1, limit: number = 50) {
    this.logOperation("GET_CREDIT_TRANSACTIONS", { page, limit });
    const startTime = performance.now();

    try {
      const offset = (page - 1) * limit;

      const [transactionsResult, totalResult] = await Promise.all([
        db.execute(sql`
          SELECT 
            ct.id,
            ct.workspace_id,
            w.name as workspace_name,
            ct.amount,
            ct.description,
            ct.created_at
          FROM credit_transaction ct
          LEFT JOIN workspace w ON w.id = ct.workspace_id
          ORDER BY ct.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `),
        db.select({ count: count() }).from(creditTransaction),
      ]);

      const duration = performance.now() - startTime;
      console.log(`[ADMIN MODEL] GET_CREDIT_TRANSACTIONS completed in ${duration.toFixed(2)}ms`);

      return {
        transactions: (transactionsResult.rows as any[]).map(row => ({
          id: row.id,
          workspaceId: row.workspace_id,
          workspaceName: row.workspace_name,
          amount: Number(row.amount),
          description: row.description,
          createdAt: row.created_at,
        })),
        total: totalResult[0]?.count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limit),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[ADMIN MODEL] GET_CREDIT_TRANSACTIONS failed after ${duration.toFixed(2)}ms:`, error);
      return {
        transactions: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }
  }
}
