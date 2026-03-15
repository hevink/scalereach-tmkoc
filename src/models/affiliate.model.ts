import { db } from "../db";
import { referral, affiliateCommission } from "../db/schema";
import { user } from "../db/schema";
import { eq, and, desc, sql, sum } from "drizzle-orm";
import { performance } from "perf_hooks";
import { emailService } from "../services/email.service";

export class AffiliateModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[AFFILIATE MODEL] ${operation}`, details ? JSON.stringify(details) : "");
  }

  private static generateId(): string {
    return crypto.randomUUID();
  }

  // Create a referral when a referred user signs up
  static async createReferral(params: {
    referrerUserId: string;
    referredUserId: string;
    referredWorkspaceId?: string;
  }) {
    this.logOperation("CREATE_REFERRAL", params);
    const startTime = performance.now();

    try {
      // Check if user was already referred
      const existing = await db
        .select()
        .from(referral)
        .where(eq(referral.referredUserId, params.referredUserId))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[AFFILIATE MODEL] User ${params.referredUserId} already referred, skipping`);
        return existing[0];
      }

      // Prevent self-referral
      if (params.referrerUserId === params.referredUserId) {
        console.log(`[AFFILIATE MODEL] Self-referral attempt blocked`);
        return null;
      }

      // Fix #11: Prevent mutual referral rings (A→B→A)
      const reverseReferral = await db
        .select()
        .from(referral)
        .where(
          and(
            eq(referral.referredUserId, params.referrerUserId),
            eq(referral.referrerUserId, params.referredUserId)
          )
        )
        .limit(1);

      if (reverseReferral.length > 0) {
        console.log(`[AFFILIATE MODEL] Mutual referral ring blocked: ${params.referredUserId} already referred ${params.referrerUserId}`);
        return null;
      }

      const [result] = await db
        .insert(referral)
        .values({
          id: this.generateId(),
          referrerUserId: params.referrerUserId,
          referredUserId: params.referredUserId,
          referredWorkspaceId: params.referredWorkspaceId || null,
          status: "signed_up",
        })
        .returning();

      const duration = performance.now() - startTime;
      console.log(`[AFFILIATE MODEL] CREATE_REFERRAL completed in ${duration.toFixed(2)}ms`);

      // Send email notification to referrer (fire-and-forget)
      this.notifyReferrerOfSignup(params.referrerUserId, params.referredUserId).catch((err) => {
        console.error("[AFFILIATE MODEL] Failed to send referral signup notification:", err);
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[AFFILIATE MODEL] CREATE_REFERRAL failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Get referral by referred user ID
  static async getReferralByReferredUser(referredUserId: string) {
    this.logOperation("GET_REFERRAL_BY_REFERRED", { referredUserId });

    const [result] = await db
      .select()
      .from(referral)
      .where(eq(referral.referredUserId, referredUserId))
      .limit(1);

    return result || null;
  }

  // Mark referral as converted when referred user makes first payment
  static async markConverted(referralId: string) {
    this.logOperation("MARK_CONVERTED", { referralId });

    const [result] = await db
      .update(referral)
      .set({ status: "converted", convertedAt: new Date() })
      .where(eq(referral.id, referralId))
      .returning();

    return result;
  }

  // Record a commission for a payment
  // Record a commission for a payment
    static async recordCommission(params: {
      referralId: string;
      referrerUserId: string;
      paymentAmountCents: number;
      paymentId?: string;
      subscriptionId?: string;
      planName?: string;
    }) {
      this.logOperation("RECORD_COMMISSION", params);

      // Fix #4: Reject commission if paymentId is missing — prevents idempotency bypass
      if (!params.paymentId) {
        console.log(`[AFFILIATE MODEL] Commission rejected: no paymentId provided`);
        return null;
      }

      // Fix #5: Guard against zero/negative payment amounts
      if (params.paymentAmountCents <= 0) {
        console.log(`[AFFILIATE MODEL] Commission rejected: invalid amount ${params.paymentAmountCents}`);
        return null;
      }

      // Idempotency: check if commission already recorded for this payment
      const existing = await db
        .select()
        .from(affiliateCommission)
        .where(eq(affiliateCommission.paymentId, params.paymentId))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[AFFILIATE MODEL] Commission already recorded for payment ${params.paymentId}`);
        return existing[0];
      }

      const commissionAmountCents = Math.floor(params.paymentAmountCents * 0.25);

      const [result] = await db
        .insert(affiliateCommission)
        .values({
          id: this.generateId(),
          referralId: params.referralId,
          referrerUserId: params.referrerUserId,
          paymentAmountCents: params.paymentAmountCents,
          commissionAmountCents,
          commissionRate: 25,
          status: "pending",
          paymentId: params.paymentId,
          subscriptionId: params.subscriptionId || null,
          planName: params.planName || null,
        })
        .returning();

      // Fix #10: Only mark converted if referral is still in 'signed_up' status
      const ref = await db
        .select({ status: referral.status })
        .from(referral)
        .where(eq(referral.id, params.referralId))
        .limit(1);

      if (ref[0]?.status === "signed_up") {
        await this.markConverted(params.referralId);
      }

      console.log(`[AFFILIATE MODEL] Commission recorded: ${(commissionAmountCents / 100).toFixed(2)} for referrer ${params.referrerUserId}`);

      // Send commission notification to referrer (fire-and-forget)
      this.notifyReferrerOfCommission(params.referrerUserId, commissionAmountCents, params.paymentAmountCents, params.planName).catch((err) => {
        console.error("[AFFILIATE MODEL] Failed to send commission notification:", err);
      });

      return result;
    }

  // Get affiliate dashboard stats for a user
  static async getAffiliateStats(userId: string) {
    this.logOperation("GET_AFFILIATE_STATS", { userId });

    // Get all referrals
    // Fix #7: Mask email to prevent PII leak — referrers shouldn't see full emails
    const referrals = await db
      .select({
        id: referral.id,
        referredUserId: referral.referredUserId,
        status: referral.status,
        createdAt: referral.createdAt,
        convertedAt: referral.convertedAt,
        referredName: user.name,
        referredEmail: sql<string>`CONCAT(LEFT(${user.email}, 2), '***@', SPLIT_PART(${user.email}, '@', 2))`,
      })
      .from(referral)
      .leftJoin(user, eq(referral.referredUserId, user.id))
      .where(eq(referral.referrerUserId, userId))
      .orderBy(desc(referral.createdAt));

    // Get commission totals
    const [totals] = await db
      .select({
        totalEarned: sum(affiliateCommission.commissionAmountCents),
        totalPending: sql<string>`COALESCE(SUM(CASE WHEN ${affiliateCommission.status} = 'pending' THEN ${affiliateCommission.commissionAmountCents} ELSE 0 END), 0)`,
        totalPaid: sql<string>`COALESCE(SUM(CASE WHEN ${affiliateCommission.status} = 'paid' THEN ${affiliateCommission.commissionAmountCents} ELSE 0 END), 0)`,
      })
      .from(affiliateCommission)
      .where(eq(affiliateCommission.referrerUserId, userId));

    // Get recent commissions
    const commissions = await db
      .select()
      .from(affiliateCommission)
      .where(eq(affiliateCommission.referrerUserId, userId))
      .orderBy(desc(affiliateCommission.createdAt))
      .limit(50);

    return {
      totalReferrals: referrals.length,
      convertedReferrals: referrals.filter((r) => r.status === "converted").length,
      totalEarnedCents: Number(totals?.totalEarned || 0),
      pendingCents: Number(totals?.totalPending || 0),
      paidCents: Number(totals?.totalPaid || 0),
      referrals,
      commissions,
    };
  }

  // Get all commissions (admin)
  static async getAllCommissions(params: { page?: number; limit?: number; status?: string }) {
    this.logOperation("GET_ALL_COMMISSIONS", params);
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;

    // Fix #8: Build where conditions — actually apply status filter
    const conditions = [];
    if (params.status) {
      conditions.push(eq(affiliateCommission.status, params.status));
    }

    const baseQuery = db
      .select({
        id: affiliateCommission.id,
        referrerUserId: affiliateCommission.referrerUserId,
        referrerName: user.name,
        referrerEmail: user.email,
        paymentAmountCents: affiliateCommission.paymentAmountCents,
        commissionAmountCents: affiliateCommission.commissionAmountCents,
        status: affiliateCommission.status,
        planName: affiliateCommission.planName,
        paymentId: affiliateCommission.paymentId,
        createdAt: affiliateCommission.createdAt,
        paidAt: affiliateCommission.paidAt,
      })
      .from(affiliateCommission)
      .leftJoin(user, eq(affiliateCommission.referrerUserId, user.id));

    const results = conditions.length > 0
      ? await baseQuery.where(and(...conditions)).orderBy(desc(affiliateCommission.createdAt)).limit(limit).offset(offset)
      : await baseQuery.orderBy(desc(affiliateCommission.createdAt)).limit(limit).offset(offset);

    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(affiliateCommission);

    const [countResult] = conditions.length > 0
      ? await countQuery.where(and(...conditions))
      : await countQuery;

    return {
      commissions: results,
      total: Number(countResult?.count || 0),
      page,
      limit,
    };
  }

  // Mark commission as paid (admin)
  // Fix #9: Only allow transition from 'pending' or 'approved' → 'paid'
  static async markCommissionPaid(commissionId: string) {
    this.logOperation("MARK_COMMISSION_PAID", { commissionId });

    const [result] = await db
      .update(affiliateCommission)
      .set({ status: "paid", paidAt: new Date() })
      .where(
        and(
          eq(affiliateCommission.id, commissionId),
          sql`${affiliateCommission.status} IN ('pending', 'approved')`
        )
      )
      .returning();

    return result;
  }

  // Bulk mark commissions as paid (admin)
  static async bulkMarkPaid(commissionIds: string[]) {
    this.logOperation("BULK_MARK_PAID", { count: commissionIds.length });

    const results = [];
    for (const id of commissionIds) {
      const result = await this.markCommissionPaid(id);
      if (result) results.push(result);
    }

    return results;
  }

  // Get referralCode for a user by ID
  static async getReferralCodeForUser(userId: string) {
    const [result] = await db
      .select({ referralCode: user.referralCode })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return result || null;
  }

  // Get referrer user by referralCode (for /r/:code links)
  static async getReferrerByUsername(referralCode: string) {
    this.logOperation("GET_REFERRER_BY_REFERRAL_CODE", { referralCode });

    const [result] = await db
      .select({ id: user.id, username: user.username, name: user.name, referralCode: user.referralCode })
      .from(user)
      .where(eq(user.referralCode, referralCode))
      .limit(1);

    return result || null;
  }

  // Send email to referrer when someone signs up via their link
  private static async notifyReferrerOfSignup(referrerUserId: string, referredUserId: string) {
    const [referrer] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, referrerUserId)).limit(1);
    const [referred] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, referredUserId)).limit(1);
    if (!referrer || !referred) return;

    await emailService.sendAffiliateNewReferralNotification({
      to: referrer.email,
      referrerName: referrer.name || referrer.email.split("@")[0],
      referredName: referred.name || "A new user",
    });
  }

  // Send email to referrer when they earn a commission
  private static async notifyReferrerOfCommission(referrerUserId: string, commissionAmountCents: number, paymentAmountCents: number, planName?: string) {
    const [referrer] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, referrerUserId)).limit(1);
    if (!referrer) return;

    await emailService.sendAffiliateCommissionNotification({
      to: referrer.email,
      referrerName: referrer.name || referrer.email.split("@")[0],
      commissionAmountCents,
      paymentAmountCents,
      planName: planName || "Pro",
    });
  }
}
