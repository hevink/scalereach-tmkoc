import { db } from "../db";
import { videoConfig } from "../db/schema";
import { eq } from "drizzle-orm";
import { performance } from "perf_hooks";
import type { NewVideoConfig, VideoConfig } from "../db/schema/video-config.schema";

export interface VideoConfigInput {
  skipClipping?: boolean;
  clipModel?: "ClipBasic" | "ClipPro";
  genre?: "Auto" | "Podcast" | "Gaming" | "Education" | "Entertainment";
  clipDurationMin?: number;
  clipDurationMax?: number;
  timeframeStart?: number;
  timeframeEnd?: number | null;
  enableAutoHook?: boolean;
  customPrompt?: string;
  topicKeywords?: string[];
  captionTemplateId?: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  enableWatermark?: boolean;
}

export class VideoConfigModel {
  private static logOperation(operation: string, details?: any) {
    console.log(
      `[VIDEO CONFIG MODEL] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  static async getByVideoId(videoId: string): Promise<VideoConfig | null> {
    this.logOperation("GET_BY_VIDEO_ID", { videoId });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(videoConfig)
        .where(eq(videoConfig.videoId, videoId));
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO CONFIG MODEL] GET_BY_VIDEO_ID completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`
      );
      return result[0] || null;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO CONFIG MODEL] GET_BY_VIDEO_ID failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async create(data: NewVideoConfig): Promise<VideoConfig> {
    this.logOperation("CREATE", { videoId: data.videoId });
    const startTime = performance.now();

    try {
      const result = await db.insert(videoConfig).values(data).returning();
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO CONFIG MODEL] CREATE completed in ${duration.toFixed(2)}ms, created: ${result[0]?.id}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO CONFIG MODEL] CREATE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async update(
    videoId: string,
    data: Partial<VideoConfigInput>
  ): Promise<VideoConfig | null> {
    this.logOperation("UPDATE", { videoId, fields: Object.keys(data) });
    const startTime = performance.now();

    try {
      const result = await db
        .update(videoConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(videoConfig.videoId, videoId))
        .returning();
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO CONFIG MODEL] UPDATE completed in ${duration.toFixed(2)}ms, updated: ${!!result[0]}`
      );
      return result[0] || null;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO CONFIG MODEL] UPDATE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async upsert(
    videoId: string,
    configId: string,
    data: VideoConfigInput
  ): Promise<VideoConfig> {
    this.logOperation("UPSERT", { videoId });
    const startTime = performance.now();

    try {
      const existing = await this.getByVideoId(videoId);

      if (existing) {
        const result = await this.update(videoId, data);
        const duration = performance.now() - startTime;
        console.log(
          `[VIDEO CONFIG MODEL] UPSERT (update) completed in ${duration.toFixed(2)}ms`
        );
        return result!;
      }

      const result = await this.create({
        id: configId,
        videoId,
        ...data,
      });
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO CONFIG MODEL] UPSERT (create) completed in ${duration.toFixed(2)}ms`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO CONFIG MODEL] UPSERT failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async delete(videoId: string): Promise<void> {
    this.logOperation("DELETE", { videoId });
    const startTime = performance.now();

    try {
      await db.delete(videoConfig).where(eq(videoConfig.videoId, videoId));
      const duration = performance.now() - startTime;
      console.log(
        `[VIDEO CONFIG MODEL] DELETE completed in ${duration.toFixed(2)}ms`
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[VIDEO CONFIG MODEL] DELETE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }
}
