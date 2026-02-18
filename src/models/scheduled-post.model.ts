import { db } from "../db";
import { scheduledPost } from "../db/schema/social.schema";
import { eq, and, desc } from "drizzle-orm";
import { performance } from "perf_hooks";

export class ScheduledPostModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[SCHEDULED POST MODEL] ${operation}`, details ? JSON.stringify(details) : "");
  }

  private static generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  static async getByWorkspace(workspaceId: string, filters?: { status?: string; clipId?: string }) {
    this.logOperation("GET_BY_WORKSPACE", { workspaceId, filters });
    const start = performance.now();
    try {
      const conditions = [eq(scheduledPost.workspaceId, workspaceId)];
      if (filters?.status) conditions.push(eq(scheduledPost.status, filters.status));
      if (filters?.clipId) conditions.push(eq(scheduledPost.clipId, filters.clipId));

      const result = await db
        .select()
        .from(scheduledPost)
        .where(and(...conditions))
        .orderBy(desc(scheduledPost.createdAt));

      console.log(`[SCHEDULED POST MODEL] GET_BY_WORKSPACE done in ${(performance.now() - start).toFixed(2)}ms`);
      return result;
    } catch (error) {
      console.error(`[SCHEDULED POST MODEL] GET_BY_WORKSPACE failed:`, error);
      throw error;
    }
  }

  static async getById(id: string) {
    this.logOperation("GET_BY_ID", { id });
    const result = await db.select().from(scheduledPost).where(eq(scheduledPost.id, id));
    return result[0] || null;
  }

  static async create(params: {
    workspaceId: string;
    clipId: string;
    socialAccountId: string;
    platform: string;
    postType: string;
    caption?: string;
    hashtags?: string[];
    scheduledAt?: Date;
    dripGroupId?: string;
    dripOrder?: number;
    createdBy?: string;
  }) {
    this.logOperation("CREATE", { workspaceId: params.workspaceId, platform: params.platform });
    const start = performance.now();

    const result = await db
      .insert(scheduledPost)
      .values({
        id: this.generateId(),
        workspaceId: params.workspaceId,
        clipId: params.clipId,
        socialAccountId: params.socialAccountId,
        platform: params.platform,
        postType: params.postType,
        status: "pending",
        caption: params.caption,
        hashtags: params.hashtags || [],
        scheduledAt: params.scheduledAt,
        dripGroupId: params.dripGroupId,
        dripOrder: params.dripOrder,
        createdBy: params.createdBy,
      })
      .returning();

    console.log(`[SCHEDULED POST MODEL] CREATE done in ${(performance.now() - start).toFixed(2)}ms`);
    return result[0];
  }

  static async updateStatus(
    id: string,
    status: string,
    extra?: {
      platformPostId?: string;
      platformPostUrl?: string;
      errorMessage?: string;
      retryCount?: number;
      postedAt?: Date;
    }
  ) {
    this.logOperation("UPDATE_STATUS", { id, status });
    await db
      .update(scheduledPost)
      .set({ status, ...extra })
      .where(eq(scheduledPost.id, id));
  }

  static async cancel(id: string) {
    this.logOperation("CANCEL", { id });
    await db
      .update(scheduledPost)
      .set({ status: "cancelled" })
      .where(eq(scheduledPost.id, id));
  }

  static async getDripGroup(dripGroupId: string) {
    this.logOperation("GET_DRIP_GROUP", { dripGroupId });
    return db
      .select()
      .from(scheduledPost)
      .where(eq(scheduledPost.dripGroupId, dripGroupId))
      .orderBy(scheduledPost.dripOrder);
  }
}
