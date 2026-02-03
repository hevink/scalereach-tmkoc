import { Context } from "hono";
import { AdminModel } from "../models/admin.model";

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
      const days = parseInt(c.req.query("days") || "30", 10);
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
      const limit = parseInt(c.req.query("limit") || "10", 10);
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
      const days = parseInt(c.req.query("days") || "30", 10);
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
      const limit = parseInt(c.req.query("limit") || "20", 10);
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
      const page = parseInt(c.req.query("page") || "1", 10);
      const limit = parseInt(c.req.query("limit") || "20", 10);
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
      const page = parseInt(c.req.query("page") || "1", 10);
      const limit = parseInt(c.req.query("limit") || "20", 10);
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
      const days = parseInt(c.req.query("days") || "30", 10);
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
      const page = parseInt(c.req.query("page") || "1", 10);
      const limit = parseInt(c.req.query("limit") || "50", 10);
      const data = await AdminModel.getCreditTransactions(page, limit);
      return c.json(data);
    } catch (error) {
      console.error("[ADMIN] Failed to get credit transactions:", error);
      return c.json({ error: "Failed to get credit transactions" }, 500);
    }
  }
}
