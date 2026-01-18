import { db } from "../db";
import { workspaceCredits, creditTransaction, creditPackage } from "../db/schema/credit.schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { performance } from "perf_hooks";

export class CreditModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[CREDIT MODEL] ${operation}`, details ? JSON.stringify(details) : "");
  }

  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Get workspace credits balance
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
        // Create initial balance record if doesn't exist
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

      // If conflict, fetch existing
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

  // Add credits to workspace
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
      // Get current balance
      const current = await this.getBalance(params.workspaceId);
      const newBalance = current.balance + params.amount;
      const newLifetime = params.type === "purchase" || params.type === "bonus"
        ? current.lifetimeCredits + params.amount
        : current.lifetimeCredits;

      // Update balance
      await db
        .update(workspaceCredits)
        .set({
          balance: newBalance,
          lifetimeCredits: newLifetime,
        })
        .where(eq(workspaceCredits.workspaceId, params.workspaceId));

      // Record transaction
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
        })
        .returning();

      const duration = performance.now() - startTime;
      console.log(`[CREDIT MODEL] ADD_CREDITS completed in ${duration.toFixed(2)}ms, new balance: ${newBalance}`);

      return { balance: newBalance, transaction: transaction[0] };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[CREDIT MODEL] ADD_CREDITS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Use credits from workspace
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
      // Get current balance
      const current = await this.getBalance(params.workspaceId);

      if (current.balance < params.amount) {
        throw new Error("Insufficient credits");
      }

      const newBalance = current.balance - params.amount;

      // Update balance
      await db
        .update(workspaceCredits)
        .set({ balance: newBalance })
        .where(eq(workspaceCredits.workspaceId, params.workspaceId));

      // Record transaction (negative amount for usage)
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

  // Check if workspace has enough credits
  static async hasCredits(workspaceId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(workspaceId);
    return balance.balance >= amount;
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

      if (params.type) {
        conditions.push(eq(creditTransaction.type, params.type));
      }
      if (params.startDate) {
        conditions.push(gte(creditTransaction.createdAt, params.startDate));
      }
      if (params.endDate) {
        conditions.push(lte(creditTransaction.createdAt, params.endDate));
      }

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
    this.logOperation("GET_ACTIVE_PACKAGES");
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(creditPackage)
        .where(eq(creditPackage.isActive, 1));

      const duration = performance.now() - startTime;
      console.log(`[CREDIT MODEL] GET_ACTIVE_PACKAGES completed in ${duration.toFixed(2)}ms, found ${result.length}`);

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[CREDIT MODEL] GET_ACTIVE_PACKAGES failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getPackageByPolarProductId(polarProductId: string) {
    this.logOperation("GET_PACKAGE_BY_POLAR_PRODUCT_ID", { polarProductId });

    const result = await db
      .select()
      .from(creditPackage)
      .where(eq(creditPackage.polarProductId, polarProductId));

    return result[0];
  }

  static async createPackage(data: {
    name: string;
    credits: number;
    priceInCents: number;
    polarProductId: string;
  }) {
    this.logOperation("CREATE_PACKAGE", data);

    const result = await db
      .insert(creditPackage)
      .values({
        id: this.generateId(),
        ...data,
      })
      .returning();

    return result[0];
  }
}
