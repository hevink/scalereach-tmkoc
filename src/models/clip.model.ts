import { db } from "../db";
import { viralClip, RecommendedPlatform } from "../db/schema";
import { eq, and, gte, lte, desc, asc, SQL } from "drizzle-orm";
import { performance } from "perf_hooks";

/**
 * Filter options for querying clips
 * Validates: Requirements 22.6
 */
export interface ClipFilters {
  minScore?: number;
  maxScore?: number;
  status?: string;
  favorited?: boolean;
  sortBy?: "score" | "duration" | "createdAt";
  sortOrder?: "asc" | "desc";
}

export class ClipModel {
  private static logOperation(operation: string, details?: any) {
    console.log(
      `[CLIP MODEL] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * Get a clip by ID
   */
  static async getById(id: string) {
    this.logOperation("GET_CLIP_BY_ID", { id });
    const startTime = performance.now();

    try {
      const result = await db.select().from(viralClip).where(eq(viralClip.id, id));
      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] GET_CLIP_BY_ID completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] GET_CLIP_BY_ID failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get all clips for a video with optional filters
   * Validates: Requirements 5.9, 22.6
   */
  static async getByVideoId(videoId: string, filters: ClipFilters = {}) {
    this.logOperation("GET_CLIPS_BY_VIDEO", { videoId, filters });
    const startTime = performance.now();

    try {
      const conditions: SQL[] = [eq(viralClip.videoId, videoId)];

      // Apply score filters
      if (filters.minScore !== undefined) {
        conditions.push(gte(viralClip.score, filters.minScore));
      }
      if (filters.maxScore !== undefined) {
        conditions.push(lte(viralClip.score, filters.maxScore));
      }

      // Apply status filter
      if (filters.status) {
        conditions.push(eq(viralClip.status, filters.status));
      }

      // Apply favorited filter
      if (filters.favorited !== undefined) {
        conditions.push(eq(viralClip.favorited, filters.favorited));
      }

      // Build query with conditions
      let query = db.select().from(viralClip).where(and(...conditions));

      // Apply sorting - default to score descending (Requirement 5.9)
      const sortBy = filters.sortBy || "score";
      const sortOrder = filters.sortOrder || "desc";

      const sortColumn = 
        sortBy === "score" ? viralClip.score :
        sortBy === "duration" ? viralClip.duration :
        viralClip.createdAt;

      const result = await query.orderBy(
        sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn)
      );

      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] GET_CLIPS_BY_VIDEO completed in ${duration.toFixed(2)}ms, found ${result.length} clips`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] GET_CLIPS_BY_VIDEO failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create a new clip
   */
  static async create(data: {
    id: string;
    videoId: string;
    title?: string;
    startTime: number;
    endTime: number;
    duration?: number;
    transcript?: string;
    score?: number;
    viralityReason?: string;
    hooks?: string[];
    emotions?: string[];
    recommendedPlatforms?: RecommendedPlatform[];
    status?: string;
  }) {
    this.logOperation("CREATE_CLIP", { id: data.id, videoId: data.videoId });
    const startTime = performance.now();

    try {
      const result = await db.insert(viralClip).values(data).returning();
      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] CREATE_CLIP completed in ${duration.toFixed(2)}ms, created: ${result[0]?.id}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] CREATE_CLIP failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create multiple clips at once
   */
  static async createMany(clips: Array<{
    id: string;
    videoId: string;
    title?: string;
    startTime: number;
    endTime: number;
    duration?: number;
    transcript?: string;
    score?: number;
    viralityReason?: string;
    hooks?: string[];
    emotions?: string[];
    recommendedPlatforms?: RecommendedPlatform[];
    status?: string;
  }>) {
    this.logOperation("CREATE_CLIPS_BATCH", { count: clips.length });
    const startTime = performance.now();

    try {
      const result = await db.insert(viralClip).values(clips).returning();
      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] CREATE_CLIPS_BATCH completed in ${duration.toFixed(2)}ms, created ${result.length} clips`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] CREATE_CLIPS_BATCH failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update a clip
   */
  static async update(
    id: string,
    data: Partial<{
      title: string;
      startTime: number;
      endTime: number;
      duration: number;
      transcript: string;
      score: number;
      viralityReason: string;
      hooks: string[];
      emotions: string[];
      recommendedPlatforms: RecommendedPlatform[];
      storageKey: string;
      storageUrl: string;
      aspectRatio: string;
      favorited: boolean;
      status: string;
      errorMessage: string;
    }>
  ) {
    this.logOperation("UPDATE_CLIP", { id, fields: Object.keys(data) });
    const startTime = performance.now();

    try {
      const result = await db
        .update(viralClip)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(viralClip.id, id))
        .returning();
      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] UPDATE_CLIP completed in ${duration.toFixed(2)}ms, updated: ${!!result[0]}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] UPDATE_CLIP failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Delete a clip
   */
  static async delete(id: string) {
    this.logOperation("DELETE_CLIP", { id });
    const startTime = performance.now();

    try {
      await db.delete(viralClip).where(eq(viralClip.id, id));
      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] DELETE_CLIP completed in ${duration.toFixed(2)}ms`
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] DELETE_CLIP failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Delete all clips for a video
   */
  static async deleteByVideoId(videoId: string) {
    this.logOperation("DELETE_CLIPS_BY_VIDEO", { videoId });
    const startTime = performance.now();

    try {
      await db.delete(viralClip).where(eq(viralClip.videoId, videoId));
      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] DELETE_CLIPS_BY_VIDEO completed in ${duration.toFixed(2)}ms`
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] DELETE_CLIPS_BY_VIDEO failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Toggle favorite status for a clip
   * Validates: Requirements 22.5
   */
  static async toggleFavorite(id: string) {
    this.logOperation("TOGGLE_FAVORITE", { id });
    const startTime = performance.now();

    try {
      // Get current state
      const clip = await this.getById(id);
      if (!clip) {
        throw new Error(`Clip not found: ${id}`);
      }

      // Toggle favorited
      const result = await db
        .update(viralClip)
        .set({ favorited: !clip.favorited, updatedAt: new Date() })
        .where(eq(viralClip.id, id))
        .returning();

      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] TOGGLE_FAVORITE completed in ${duration.toFixed(2)}ms, favorited: ${result[0]?.favorited}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] TOGGLE_FAVORITE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  /**
   * Count clips for a video
   */
  static async countByVideoId(videoId: string) {
    this.logOperation("COUNT_CLIPS_BY_VIDEO", { videoId });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(viralClip)
        .where(eq(viralClip.videoId, videoId));
      const duration = performance.now() - startTime;
      console.log(
        `[CLIP MODEL] COUNT_CLIPS_BY_VIDEO completed in ${duration.toFixed(2)}ms, count: ${result.length}`
      );
      return result.length;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[CLIP MODEL] COUNT_CLIPS_BY_VIDEO failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }
}
