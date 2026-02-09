import { db } from "../db";
import { workspaceMinutes, minuteTransaction } from "../db/schema/minutes.schema";
import { video } from "../db/schema/project.schema";
import { workspace } from "../db/schema/workspace.schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { performance } from "perf_hooks";
import { getPlanConfig, calculateMinuteConsumption, PLAN_CONFIGS } from "../config/plan-config";

export class MinutesModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[MINUTES MODEL] ${operation}`, details ? JSON.stringify(details) : "");
  }

  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private static getNextMonthDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  // Get workspace minutes balance (with lazy monthly reset)
  static async getBalance(workspaceId: string) {
    this.logOperation("GET_BALANCE", { workspaceId });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(workspaceMinutes)
        .where(eq(workspaceMinutes.workspaceId, workspaceId));

      const duration = performance.now() - startTime;
      console.log(`[MINUTES MODEL] GET_BALANCE completed in ${duration.toFixed(2)}ms`);

      if (!result[0]) {
        // Get workspace plan and initialize
        const ws = await db
          .select({ plan: workspace.plan })
          .from(workspace)
          .where(eq(workspace.id, workspaceId));
        const plan = ws[0]?.plan || "free";
        return this.initializeBalance(workspaceId, plan);
      }

      // Lazy monthly reset: check if reset date has passed for paid plans
      const balance = result[0];
      if (balance.minutesResetDate && new Date() >= balance.minutesResetDate) {
        const ws = await db
          .select({ plan: workspace.plan })
          .from(workspace)
          .where(eq(workspace.id, workspaceId));
        const plan = ws[0]?.plan || "free";
        const planConfig = getPlanConfig(plan);

        if (planConfig.minutes.renewable) {
          return this.resetMonthlyMinutes(workspaceId, plan);
        }
      }

      return balance;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[MINUTES MODEL] GET_BALANCE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Initialize workspace minutes balance
  static async initializeBalance(workspaceId: string, plan: string) {
    this.logOperation("INITIALIZE_BALANCE", { workspaceId, plan });
    const startTime = performance.now();

    try {
      const planConfig = getPlanConfig(plan);
      const resetDate = planConfig.minutes.type === "monthly" ? this.getNextMonthDate() : null;

      const result = await db
        .insert(workspaceMinutes)
        .values({
          id: this.generateId(),
          workspaceId,
          minutesTotal: planConfig.minutes.total,
          minutesUsed: 0,
          minutesRemaining: planConfig.minutes.total,
          minutesResetDate: resetDate,
          editingOperationsUsed: 0,
        })
        .onConflictDoNothing()
        .returning();

      const duration = performance.now() - startTime;
      console.log(`[MINUTES MODEL] INITIALIZE_BALANCE completed in ${duration.toFixed(2)}ms`);

      // If conflict, fetch existing
      if (!result[0]) {
        const existing = await db
          .select()
          .from(workspaceMinutes)
          .where(eq(workspaceMinutes.workspaceId, workspaceId));
        return existing[0];
      }

      // Log allocation transaction
      await db.insert(minuteTransaction).values({
        id: this.generateId(),
        workspaceId,
        type: "allocation",
        minutesAmount: planConfig.minutes.total,
        minutesBefore: 0,
        minutesAfter: planConfig.minutes.total,
        description: `Initial ${plan} plan allocation`,
      });

      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[MINUTES MODEL] INITIALIZE_BALANCE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Check if workspace has enough minutes
  static async hasMinutes(workspaceId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(workspaceId);
    return balance.minutesRemaining >= amount;
  }

  // Deduct minutes from workspace
  static async deductMinutes(params: {
    workspaceId: string;
    userId?: string;
    videoId?: string;
    amount: number;
    type: "upload" | "regenerate" | "dubbing";
  }) {
    this.logOperation("DEDUCT_MINUTES", {
      workspaceId: params.workspaceId,
      amount: params.amount,
      type: params.type,
    });
    const startTime = performance.now();

    try {
      const current = await this.getBalance(params.workspaceId);

      if (current.minutesRemaining < params.amount) {
        throw new Error("INSUFFICIENT_MINUTES");
      }

      const minutesBefore = current.minutesRemaining;
      const minutesAfter = minutesBefore - params.amount;

      // Update balance
      await db
        .update(workspaceMinutes)
        .set({
          minutesUsed: current.minutesUsed + params.amount,
          minutesRemaining: minutesAfter,
        })
        .where(eq(workspaceMinutes.workspaceId, params.workspaceId));

      // Update video minutes consumed
      if (params.videoId) {
        await db
          .update(video)
          .set({
            minutesConsumed: sql`${video.minutesConsumed} + ${params.amount}`,
          })
          .where(eq(video.id, params.videoId));
      }

      // Log transaction
      await db.insert(minuteTransaction).values({
        id: this.generateId(),
        workspaceId: params.workspaceId,
        userId: params.userId,
        videoId: params.videoId,
        type: params.type,
        minutesAmount: -params.amount,
        minutesBefore,
        minutesAfter,
        description: `${params.type} video`,
      });

      const duration = performance.now() - startTime;
      console.log(
        `[MINUTES MODEL] DEDUCT_MINUTES completed in ${duration.toFixed(2)}ms, remaining: ${minutesAfter}`
      );

      return { minutesRemaining: minutesAfter };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[MINUTES MODEL] DEDUCT_MINUTES failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Refund minutes to workspace
  static async refundMinutes(params: {
    workspaceId: string;
    userId?: string;
    videoId?: string;
    amount: number;
    reason: string;
  }) {
    this.logOperation("REFUND_MINUTES", {
      workspaceId: params.workspaceId,
      amount: params.amount,
    });
    const startTime = performance.now();

    try {
      const current = await this.getBalance(params.workspaceId);
      const minutesBefore = current.minutesRemaining;
      const minutesAfter = minutesBefore + params.amount;

      // Update balance
      await db
        .update(workspaceMinutes)
        .set({
          minutesUsed: Math.max(0, current.minutesUsed - params.amount),
          minutesRemaining: minutesAfter,
        })
        .where(eq(workspaceMinutes.workspaceId, params.workspaceId));

      // Update video minutes consumed
      if (params.videoId) {
        await db
          .update(video)
          .set({
            minutesConsumed: sql`GREATEST(0, ${video.minutesConsumed} - ${params.amount})`,
          })
          .where(eq(video.id, params.videoId));
      }

      // Log transaction
      await db.insert(minuteTransaction).values({
        id: this.generateId(),
        workspaceId: params.workspaceId,
        userId: params.userId,
        videoId: params.videoId,
        type: "refund",
        minutesAmount: params.amount,
        minutesBefore,
        minutesAfter,
        description: params.reason,
      });

      const duration = performance.now() - startTime;
      console.log(
        `[MINUTES MODEL] REFUND_MINUTES completed in ${duration.toFixed(2)}ms, remaining: ${minutesAfter}`
      );

      return { minutesRemaining: minutesAfter };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[MINUTES MODEL] REFUND_MINUTES failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Reset monthly minutes for a workspace (adds new allocation to existing)
  static async resetMonthlyMinutes(workspaceId: string, plan: string) {
    this.logOperation("RESET_MONTHLY_MINUTES", { workspaceId, plan });
    const startTime = performance.now();

    try {
      const planConfig = getPlanConfig(plan);
      const nextResetDate = this.getNextMonthDate();

      const current = await db
        .select()
        .from(workspaceMinutes)
        .where(eq(workspaceMinutes.workspaceId, workspaceId));

      const minutesBefore = current[0]?.minutesRemaining || 0;
      const newMinutesRemaining = minutesBefore + planConfig.minutes.total;

      const result = await db
        .update(workspaceMinutes)
        .set({
          minutesTotal: planConfig.minutes.total,
          // Don't reset minutesUsed - keep tracking total usage
          minutesRemaining: newMinutesRemaining,
          minutesResetDate: nextResetDate,
          // Don't reset editing operations
        })
        .where(eq(workspaceMinutes.workspaceId, workspaceId))
        .returning();

      // Log transaction
      await db.insert(minuteTransaction).values({
        id: this.generateId(),
        workspaceId,
        type: "reset",
        minutesAmount: planConfig.minutes.total,
        minutesBefore,
        minutesAfter: newMinutesRemaining,
        description: `Monthly minute reset - added ${planConfig.minutes.total} minutes`,
      });

      const duration = performance.now() - startTime;
      console.log(`[MINUTES MODEL] RESET_MONTHLY_MINUTES completed in ${duration.toFixed(2)}ms`);

      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[MINUTES MODEL] RESET_MONTHLY_MINUTES failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Increment editing operations (free plan tracking)
  static async incrementEditingOps(workspaceId: string) {
    this.logOperation("INCREMENT_EDITING_OPS", { workspaceId });

    await db
      .update(workspaceMinutes)
      .set({
        editingOperationsUsed: sql`${workspaceMinutes.editingOperationsUsed} + 1`,
      })
      .where(eq(workspaceMinutes.workspaceId, workspaceId));
  }

  // Increment regeneration count on a video
  static async incrementRegenerationCount(videoId: string) {
    this.logOperation("INCREMENT_REGENERATION_COUNT", { videoId });

    await db
      .update(video)
      .set({
        regenerationCount: sql`${video.regenerationCount} + 1`,
      })
      .where(eq(video.id, videoId));
  }

  // Get regeneration count for a video
  static async getRegenerationCount(videoId: string): Promise<number> {
    const result = await db
      .select({ regenerationCount: video.regenerationCount })
      .from(video)
      .where(eq(video.id, videoId));

    return result[0]?.regenerationCount || 0;
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
      const conditions = [eq(minuteTransaction.workspaceId, params.workspaceId)];

      if (params.type) {
        conditions.push(eq(minuteTransaction.type, params.type));
      }
      if (params.startDate) {
        conditions.push(gte(minuteTransaction.createdAt, params.startDate));
      }
      if (params.endDate) {
        conditions.push(lte(minuteTransaction.createdAt, params.endDate));
      }

      const result = await db
        .select()
        .from(minuteTransaction)
        .where(and(...conditions))
        .orderBy(desc(minuteTransaction.createdAt))
        .limit(params.limit || 50)
        .offset(params.offset || 0);

      const duration = performance.now() - startTime;
      console.log(
        `[MINUTES MODEL] GET_TRANSACTIONS completed in ${duration.toFixed(2)}ms, found ${result.length}`
      );

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[MINUTES MODEL] GET_TRANSACTIONS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Update balance when plan changes (upgrade/downgrade)
  static async updatePlanAllocation(workspaceId: string, newPlan: string, billingCycle?: "monthly" | "annual") {
    this.logOperation("UPDATE_PLAN_ALLOCATION", { workspaceId, newPlan, billingCycle });
    const startTime = performance.now();

    try {
      const planConfig = getPlanConfig(newPlan);
      const current = await this.getBalance(workspaceId);
      
      // Calculate new minutes based on billing cycle
      let newMinutesTotal: number;
      let resetDate: Date | null = null;
      
      if (billingCycle === "annual") {
        // Annual plans: Give all minutes upfront (12 months worth)
        newMinutesTotal = planConfig.minutes.total * 12;
        // No reset date for annual plans - minutes don't expire
        resetDate = null;
      } else {
        // Monthly plans: Give monthly allocation
        newMinutesTotal = planConfig.minutes.total;
        // Set reset date for next month
        resetDate = planConfig.minutes.type === "monthly" ? this.getNextMonthDate() : null;
      }
      
      // Check for recent duplicate allocation (within last 5 minutes)
      const recentTransactions = await db
        .select()
        .from(minuteTransaction)
        .where(
          and(
            eq(minuteTransaction.workspaceId, workspaceId),
            eq(minuteTransaction.type, "allocation"),
            gte(minuteTransaction.createdAt, new Date(Date.now() - 5 * 60 * 1000))
          )
        );

      const isDuplicate = recentTransactions.some(
        (tx) => tx.minutesAmount === newMinutesTotal && 
                tx.description?.includes(newPlan) &&
                tx.description?.includes(billingCycle || "monthly")
      );

      if (isDuplicate) {
        console.log(`[MINUTES MODEL] Duplicate allocation detected, skipping - plan: ${newPlan}, cycle: ${billingCycle}`);
        return current;
      }
      
      // Add new minutes to existing remaining minutes (don't replace)
      const newMinutesRemaining = current.minutesRemaining + newMinutesTotal;
      const newMinutesUsed = current.minutesUsed; // Keep existing usage

      const result = await db
        .update(workspaceMinutes)
        .set({
          minutesTotal: newMinutesTotal,
          minutesUsed: newMinutesUsed,
          minutesRemaining: newMinutesRemaining,
          minutesResetDate: resetDate,
          // Keep editing operations count
        })
        .where(eq(workspaceMinutes.workspaceId, workspaceId))
        .returning();

      // Log transaction
      await db.insert(minuteTransaction).values({
        id: this.generateId(),
        workspaceId,
        type: "allocation",
        minutesAmount: newMinutesTotal,
        minutesBefore: current.minutesRemaining,
        minutesAfter: newMinutesRemaining,
        description: `Plan changed to ${newPlan} (${billingCycle || "monthly"}) - added ${newMinutesTotal} minutes`,
      });

      const duration = performance.now() - startTime;
      console.log(`[MINUTES MODEL] UPDATE_PLAN_ALLOCATION completed in ${duration.toFixed(2)}ms`);

      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[MINUTES MODEL] UPDATE_PLAN_ALLOCATION failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }
}
