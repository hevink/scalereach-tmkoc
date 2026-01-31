import { db } from "../db";
import { video } from "../db/schema";
import { eq } from "drizzle-orm";
import { performance } from "perf_hooks";

export class VideoModel {
  private static logOperation(operation: string, details?: any) {
    console.log(
      `[VIDEO MODEL] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  static async getById(id: string) {
    this.logOperation("GET_VIDEO_BY_ID", { id });
    const startTime = performance.now();

    try {
      const result = await db.select().from(video).where(eq(video.id, id));
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO MODEL] GET_VIDEO_BY_ID completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO MODEL] GET_VIDEO_BY_ID failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async getByProjectId(projectId: string) {
    this.logOperation("GET_VIDEOS_BY_PROJECT", { projectId });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(video)
        .where(eq(video.projectId, projectId));
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO MODEL] GET_VIDEOS_BY_PROJECT completed in ${duration.toFixed(2)}ms, found ${result.length} videos`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO MODEL] GET_VIDEOS_BY_PROJECT failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async getByUserId(userId: string) {
    this.logOperation("GET_VIDEOS_BY_USER", { userId });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(video)
        .where(eq(video.userId, userId));
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO MODEL] GET_VIDEOS_BY_USER completed in ${duration.toFixed(2)}ms, found ${result.length} videos`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO MODEL] GET_VIDEOS_BY_USER failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get videos by user ID with only essential fields for grid display
   * Returns: id, title, duration, status, sourceType, sourceUrl, createdAt
   */
  static async getByUserIdLite(userId: string) {
    this.logOperation("GET_VIDEOS_BY_USER_LITE", { userId });
    const startTime = performance.now();

    try {
      const result = await db
        .select({
          id: video.id,
          title: video.title,
          duration: video.duration,
          status: video.status,
          sourceType: video.sourceType,
          sourceUrl: video.sourceUrl,
          createdAt: video.createdAt,
        })
        .from(video)
        .where(eq(video.userId, userId))
        .orderBy(video.createdAt);
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO MODEL] GET_VIDEOS_BY_USER_LITE completed in ${duration.toFixed(2)}ms, found ${result.length} videos`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO MODEL] GET_VIDEOS_BY_USER_LITE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get videos by workspace ID with only essential fields for grid display
   */
  static async getByWorkspaceId(workspaceId: string) {
    this.logOperation("GET_VIDEOS_BY_WORKSPACE", { workspaceId });
    const startTime = performance.now();

    try {
      const result = await db
        .select({
          id: video.id,
          title: video.title,
          duration: video.duration,
          status: video.status,
          sourceType: video.sourceType,
          sourceUrl: video.sourceUrl,
          createdAt: video.createdAt,
        })
        .from(video)
        .where(eq(video.workspaceId, workspaceId))
        .orderBy(video.createdAt);
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO MODEL] GET_VIDEOS_BY_WORKSPACE completed in ${duration.toFixed(2)}ms, found ${result.length} videos`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO MODEL] GET_VIDEOS_BY_WORKSPACE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async create(data: {
    id: string;
    projectId?: string | null;
    workspaceId?: string | null;
    userId: string;
    sourceType: "youtube" | "upload";
    sourceUrl?: string;
    title?: string;
    fileSize?: number;
    mimeType?: string;
  }) {
    this.logOperation("CREATE_VIDEO", {
      id: data.id,
      projectId: data.projectId,
      workspaceId: data.workspaceId,
      userId: data.userId,
      sourceType: data.sourceType,
    });
    const startTime = performance.now();

    try {
      const result = await db.insert(video).values(data).returning();
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO MODEL] CREATE_VIDEO completed in ${duration.toFixed(2)}ms, created: ${result[0]?.id}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO MODEL] CREATE_VIDEO failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async update(
    id: string,
    data: Partial<{
      storageKey: string;
      storageUrl: string;
      audioStorageKey: string;
      audioStorageUrl: string;
      title: string;
      duration: number;
      fileSize: number;
      mimeType: string;
      metadata: any;
      status: "pending" | "pending_config" | "downloading" | "uploading" | "transcribing" | "analyzing" | "completed" | "failed";
      errorMessage: string;
      transcript: string;
      transcriptWords: any[];
      transcriptLanguage: string;
      transcriptConfidence: number;
      creditsUsed: number;
    }>
  ) {
    this.logOperation("UPDATE_VIDEO", { id, fields: Object.keys(data) });
    const startTime = performance.now();

    try {
      const result = await db
        .update(video)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(video.id, id))
        .returning();
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO MODEL] UPDATE_VIDEO completed in ${duration.toFixed(2)}ms, updated: ${!!result[0]}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO MODEL] UPDATE_VIDEO failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async delete(id: string) {
    this.logOperation("DELETE_VIDEO", { id });
    const startTime = performance.now();

    try {
      await db.delete(video).where(eq(video.id, id));
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO MODEL] DELETE_VIDEO completed in ${duration.toFixed(2)}ms`
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO MODEL] DELETE_VIDEO failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }
}
