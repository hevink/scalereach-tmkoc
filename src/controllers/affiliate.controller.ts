import { Context } from "hono";
import { AffiliateModel } from "../models/affiliate.model";
import { UserModel } from "../models/user.model";

export class AffiliateController {
  private static logRequest(c: Context, operation: string, details?: any) {
    console.log(`[AFFILIATE CONTROLLER] ${operation}`, details ? JSON.stringify(details) : "");
  }

  // GET /api/affiliate/stats - Get current user's affiliate dashboard
  static async getStats(c: Context) {
    AffiliateController.logRequest(c, "GET_STATS");

    try {
      const sessionUser = c.get("user");
      if (!sessionUser) return c.json({ error: "Unauthorized" }, 401);

      // Fetch referralCode from DB (not in session object)
      const dbUser = await AffiliateModel.getReferralCodeForUser(sessionUser.id);
      const stats = await AffiliateModel.getAffiliateStats(sessionUser.id);

      return c.json({
        referralLink: dbUser?.referralCode
          ? `${process.env.FRONTEND_URL || "https://app.scalereach.ai"}/r/${dbUser.referralCode}`
          : null,
        referralCode: dbUser?.referralCode || null,
        username: sessionUser.username || null,
        commissionRate: 25,
        ...stats,
      });
    } catch (error: any) {
      console.error("[AFFILIATE CONTROLLER] GET_STATS error:", error);
      return c.json({ error: "Failed to get affiliate stats" }, 500);
    }
  }

  // POST /api/affiliate/track - Track a referral signup (called during registration)
  // Fix #1: Now requires auth — validates referredUserId matches authenticated user
  static async trackReferral(c: Context) {
    AffiliateController.logRequest(c, "TRACK_REFERRAL");

    try {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);

      const { referrerUsername, referredUserId } = await c.req.json();

      if (!referrerUsername || !referredUserId) {
        return c.json({ error: "referrerUsername and referredUserId are required" }, 400);
      }

      // Fix #1: Validate that the referredUserId matches the authenticated user
      if (referredUserId !== user.id) {
        return c.json({ error: "Cannot track referral for another user" }, 403);
      }

      // Look up referrer by referralCode (referrerUsername is actually the referralCode from /r/:code)
      const referrer = await AffiliateModel.getReferrerByUsername(referrerUsername);
      if (!referrer) {
        return c.json({ error: "Referrer not found" }, 404);
      }

      // Prevent self-referral
      if (referrer.id === referredUserId) {
        return c.json({ error: "Cannot refer yourself" }, 400);
      }

      const result = await AffiliateModel.createReferral({
        referrerUserId: referrer.id,
        referredUserId,
      });

      return c.json({ success: true, referral: result });
    } catch (error: any) {
      console.error("[AFFILIATE CONTROLLER] TRACK_REFERRAL error:", error);
      return c.json({ error: "Failed to track referral" }, 500);
    }
  }

  // GET /api/affiliate/resolve/:username - Resolve a referral username (public, for /r/:username page)
  static async resolveReferrer(c: Context) {
    const username = c.req.param("username");
    AffiliateController.logRequest(c, "RESOLVE_REFERRER", { username });

    try {
      if (!username) {
        return c.json({ error: "Username required" }, 400);
      }

      const referrer = await AffiliateModel.getReferrerByUsername(username);
      if (!referrer) {
        return c.json({ error: "Referrer not found" }, 404);
      }

      return c.json({
        valid: true,
        referralCode: referrer.referralCode,
        name: referrer.name,
      });
    } catch (error: any) {
      console.error("[AFFILIATE CONTROLLER] RESOLVE_REFERRER error:", error);
      return c.json({ error: "Failed to resolve referrer" }, 500);
    }
  }

  // GET /api/admin/affiliate/commissions - Admin: list all commissions
  static async adminGetCommissions(c: Context) {
    AffiliateController.logRequest(c, "ADMIN_GET_COMMISSIONS");

    try {
      const user = c.get("user");
      if (!user || user.role !== "admin") {
        return c.json({ error: "Admin access required" }, 403);
      }

      const page = parseInt(c.req.query("page") || "1");
      const limit = parseInt(c.req.query("limit") || "50");
      const status = c.req.query("status");

      const result = await AffiliateModel.getAllCommissions({ page, limit, status });
      return c.json(result);
    } catch (error: any) {
      console.error("[AFFILIATE CONTROLLER] ADMIN_GET_COMMISSIONS error:", error);
      return c.json({ error: "Failed to get commissions" }, 500);
    }
  }

  // POST /api/admin/affiliate/commissions/:id/pay - Admin: mark commission as paid
  static async adminMarkPaid(c: Context) {
    const commissionId = c.req.param("id");
    AffiliateController.logRequest(c, "ADMIN_MARK_PAID", { commissionId });

    try {
      const user = c.get("user");
      if (!user || user.role !== "admin") {
        return c.json({ error: "Admin access required" }, 403);
      }

      const result = await AffiliateModel.markCommissionPaid(commissionId);
      if (!result) {
        return c.json({ error: "Commission not found" }, 404);
      }

      return c.json({ success: true, commission: result });
    } catch (error: any) {
      console.error("[AFFILIATE CONTROLLER] ADMIN_MARK_PAID error:", error);
      return c.json({ error: "Failed to mark commission as paid" }, 500);
    }
  }

  // POST /api/admin/affiliate/commissions/bulk-pay - Admin: bulk mark as paid
  static async adminBulkMarkPaid(c: Context) {
    AffiliateController.logRequest(c, "ADMIN_BULK_MARK_PAID");

    try {
      const user = c.get("user");
      if (!user || user.role !== "admin") {
        return c.json({ error: "Admin access required" }, 403);
      }

      const { commissionIds } = await c.req.json();
      if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
        return c.json({ error: "commissionIds array required" }, 400);
      }

      const results = await AffiliateModel.bulkMarkPaid(commissionIds);
      return c.json({ success: true, paid: results.length });
    } catch (error: any) {
      console.error("[AFFILIATE CONTROLLER] ADMIN_BULK_MARK_PAID error:", error);
      return c.json({ error: "Failed to bulk mark commissions" }, 500);
    }
  }

  // GET /api/admin/affiliate/overview - Admin: get all affiliates with stats
  static async adminGetAffiliates(c: Context) {
    AffiliateController.logRequest(c, "ADMIN_GET_AFFILIATES");

    try {
      const user = c.get("user");
      if (!user || user.role !== "admin") {
        return c.json({ error: "Admin access required" }, 403);
      }

      const affiliates = await AffiliateModel.getAllAffiliates();
      return c.json({ affiliates });
    } catch (error: any) {
      console.error("[AFFILIATE CONTROLLER] ADMIN_GET_AFFILIATES error:", error);
      return c.json({ error: "Failed to get affiliates" }, 500);
    }
  }

  // GET /api/admin/affiliate/referrals/:userId - Admin: get referrals for a specific referrer
  static async adminGetReferrals(c: Context) {
    const userId = c.req.param("userId");
    AffiliateController.logRequest(c, "ADMIN_GET_REFERRALS", { userId });

    try {
      const user = c.get("user");
      if (!user || user.role !== "admin") {
        return c.json({ error: "Admin access required" }, 403);
      }

      const referrals = await AffiliateModel.getReferralsForReferrer(userId);
      return c.json({ referrals });
    } catch (error: any) {
      console.error("[AFFILIATE CONTROLLER] ADMIN_GET_REFERRALS error:", error);
      return c.json({ error: "Failed to get referrals" }, 500);
    }
  }
}
