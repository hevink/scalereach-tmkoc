import { db } from "../db";
import { workspaceCredits, creditTransaction, creditPackage } from "../db/schema/credit.schema";
import { eq, desc, and, gte, lte, gt, isNull, or, sql } from "drizzle-orm";
import { performance } from "perf_hooks";

const CREDIT_EXPIRY_DAYS = 60;

function creditExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + CREDIT_EXPIRY_DAYS);
  return d;
}

export class CreditModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[CREDIT MODEL] ${operation}`, details ? JSON.stringify(details) : "");
  }

  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Compute the non-expired balance by summing transactions where
   * expires_at IS NULL (usage/refund rows) or expires_at > NOW().
   * This is the source of truth — workspace_credits.balance is a
   * cached snapshot updated on every add/use operation.
   */
  static async getEffectiveBalance(workspaceId: string): Promise<number> {
    const now = new Date();
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${creditTransaction.amount}), 0)` })
      .from(creditTransaction)
      .where(
        and(
          eq(creditTransaction.workspaceId, workspaceId),
          or(
            isNull(creditTransaction.expiresAt),
            gt(creditTransaction.expiresAt, now)
          )
        )
      );
    return Number(result[0]?.total ?? 0);
  }

  // Get workspace credits balance (uses cached balance field)
  static async getBalance(workspaceId: string) {
    this.logOperation("GET_BALANCE", { workspaceId });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(workspaceCredits)
        .where(eq(workspaceCredits.workspaceId, workspaceId));

      const duration = performance.now() - startTime;
      console.log(`[CREDIT MODEL] GET_BALANCE completed in ${duration.toFixed(2)}ms`);

      if (!result[0]) {
        return this.initializeBalance(workspaceId);
      }

      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[CREDIT MODEL] GET_BALANCE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Initialize workspace credits balance
  static async initializeBalance(workspaceId: string) {
    this.logOperation("INITIALIZE_BALANCE", { workspaceId });
    const startTime = performance.now();

    try {
      const result = await db
        .insert(workspaceCredits)
        .values({
          id: this.generateId(),
          workspaceId,
          balance: 0,
          lifetimeCredits: 0,
        })
        .onConflictDoNothing()
        .returning();

      const duration = performance.now() - startTime;
      console.log(`[CREDIT MODEL] INITIALIZE_BALANCE completed in ${duration.toFixed(2)}ms`);

      if (!result[0]) {
        const existing = await db
          .select()
          .from(workspaceCredits)
          .where(eq(workspaceCredits.workspaceId, workspaceId));
        return existing[0];
      }

      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[CREDIT MODEL] INITIALIZE_BALANCE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Add credits — always sets a 60-day expiry for purchase/bonus credits
  static async addCredits(params: {
    workspaceId: string;
    userId?: string;
    amount: number;
    type: "purchase" | "bonus" | "refund" | "adjustment";
    description?: string;
    metadata?: Record<string, any>;
  }) {
    this.logOperation("ADD_CREDITS", { workspaceId: params.workspaceId, amount: params.amount, type: params.type });
    const startTime = performance.now();

    try {
      const current = await this.getBalance(params.workspaceId);
      const newBalance = current.balance + params.amount;
      const newLifetime = params.type === "purchase" || params.type === "bonus"
        ? current.lifetimeCredits + params.amount
        : current.lifetimeCredits;

      // Only purchase/bonus credits expire; refund/adjustment do not
      const expiresAt = (params.type === "purchase" || params.type === "bonus")
        ? creditExpiryDate()
        : null;

      await db
        .update(workspaceCredits)
        .set({ balance: newBalance, lifetimeCredits: newLifetime })
        .where(eq(workspaceCredits.workspaceId, params.workspaceId));

      const transaction = await db
        .insert(creditTransaction)
        .values({
          id: this.generateId(),
          workspaceId: params.workspaceId,
          userId: params.userId,
          type: params.type,
          amount: params.amount,
          balanceAfter: newBalance,
          description: params.description,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
          expiresAt,
        })
        .returning();

      const duration = performance.now() - startTime;
      console.log(`[CREDIT MODEL] ADD_CREDITS completed in ${duration.toFixed(2)}ms, new balance: ${newBalance}, expires: ${expiresAt?.toISOString() ?? "never"}`);

      return { balance: newBalance, transaction: transaction[0] };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[CREDIT MODEL] ADD_CREDITS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Use credits — checks effective (non-expired) balance
  static async useCredits(params: {
    workspaceId: string;
    userId?: string;
    amount: number;
    description?: string;
    metadata?: Record<string, any>;
  }) {
    this.logOperation("USE_CREDITS", { workspaceId: params.workspaceId, amount: params.amount });
    const startTime = performance.now();

    try {
      // Use effective balance (excludes expired credits)
      const effectiveBalance = await this.getEffectiveBalance(params.workspaceId);

      if (effectiveBalance < params.amount) {
        throw new Error("Insufficient credits");
      }

      const newBalance = effectiveBalance - params.amount;

      // Sync cached balance
      await db
        .update(workspaceCredits)
        .set({ balance: newBalance })
        .where(eq(workspaceCredits.workspaceId, params.workspaceId));

      // Usage rows never expire (they're debit records)
      const transaction = await db
        .insert(creditTransaction)
        .values({
          id: this.generateId(),
          workspaceId: params.workspaceId,
          userId: params.userId,
          type: "usage",
          amount: -params.amount,
          balanceAfter: newBalance,
          description: params.description,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
          expiresAt: null,
        })
        .returning();

      const duration = performance.now() - startTime;
      console.log(`[CREDIT MODEL] USE_CREDITS completed in ${duration.toFixed(2)}ms, new balance: ${newBalance}`);

      return { balance: newBalance, transaction: transaction[0] };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[CREDIT MODEL] USE_CREDITS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Check if workspace has enough non-expired credits
  static async hasCredits(workspaceId: string, amount: number): Promise<boolean> {
    const effective = await this.getEffectiveBalance(workspaceId);
    return effective >= amount;
  }

  /**
   * Expire stale credits — call from a daily cleanup job.
   * Sets workspace balance to effective balance for any workspace
   * that has transactions expiring today.
   */
  static async expireStaleCredits(): Promise<{ workspacesUpdated: number; creditsExpired: number }> {
    this.logOperation("EXPIRE_STALE_CREDITS");
    const now = new Date();

    // Find workspaces with newly-expired credits
    const expired = await db
      .select({ workspaceId: creditTransaction.workspaceId, amount: creditTransaction.amount })
      .from(creditTransaction)
      .where(
        and(
          lte(creditTransaction.expiresAt, now),
          gt(creditTransaction.amount, 0) // only credit rows, not usage rows
        )
      );

    if (expired.length === 0) return { workspacesUpdated: 0, creditsExpired: 0 };

    const workspaceIds = [...new Set(expired.map((r) => r.workspaceId))];
    const totalExpired = expired.reduce((sum, r) => sum + r.amount, 0);

    // Recompute and sync balance for each affected workspace
    for (const workspaceId of workspaceIds) {
      const effective = await this.getEffectiveBalance(workspaceId);
      await db
        .update(workspaceCredits)
        .set({ balance: Math.max(0, effective) })
        .where(eq(workspaceCredits.workspaceId, workspaceId));
      console.log(`[CREDIT MODEL] Synced balance for workspace ${workspaceId} → ${effective}`);
    }

    return { workspacesUpdated: workspaceIds.length, creditsExpired: totalExpired };
  }

  // Get transaction history
  static async getTransactions(params: {
    workspaceId: string;
    limit?: number;
    offset?: number;
    type?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    this.logOperation("GET_TRANSACTIONS", { workspaceId: params.workspaceId });
    const startTime = performance.now();

    try {
      const conditions = [eq(creditTransaction.workspaceId, params.workspaceId)];
      if (params.type) conditions.push(eq(creditTransaction.type, params.type));
      if (params.startDate) conditions.push(gte(creditTransaction.createdAt, params.startDate));
      if (params.endDate) conditions.push(lte(creditTransaction.createdAt, params.endDate));

      const result = await db
        .select()
        .from(creditTransaction)
        .where(and(...conditions))
        .orderBy(desc(creditTransaction.createdAt))
        .limit(params.limit || 50)
        .offset(params.offset || 0);

      const duration = performance.now() - startTime;
      console.log(`[CREDIT MODEL] GET_TRANSACTIONS completed in ${duration.toFixed(2)}ms, found ${result.length}`);

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[CREDIT MODEL] GET_TRANSACTIONS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Credit packages
  static async getActivePackages() {
    const result = await db.select().from(creditPackage).where(eq(creditPackage.isActive, 1));
    return result;
  }

  static async getPackageByDodoProductId(dodoProductId: string) {
    const result = await db.select().from(creditPackage).where(eq(creditPackage.dodoProductId, dodoProductId));
    return result[0];
  }

  static async createPackage(data: {
    name: string;
    credits: number;
    priceInCents: number;
    dodoProductId: string;
    isSubscription?: boolean;
    billingPeriod?: string;
  }) {
    this.logOperation("CREATE_PACKAGE", data);
    const result = await db
      .insert(creditPackage)
      .values({
        id: this.generateId(),
        name: data.name,
        credits: data.credits,
        priceInCents: data.priceInCents,
        dodoProductId: data.dodoProductId,
        isSubscription: data.isSubscription ? 1 : 0,
        billingPeriod: data.billingPeriod || null,
      })
      .returning();
    return result[0];
  }
}
