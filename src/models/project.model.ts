import { db } from "../db";
import { project, video } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { performance } from "perf_hooks";

export class ProjectModel {
  private static logOperation(operation: string, details?: any) {
    console.log(
      `[PROJECT MODEL] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  static async getById(id: string) {
    this.logOperation("GET_PROJECT_BY_ID", { id });
    const startTime = performance.now();

    try {
      const result = await db.select().from(project).where(eq(project.id, id));
      const duration = performance.now() - startTime;
      console.log(
        `[PROJECT MODEL] GET_PROJECT_BY_ID completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[PROJECT MODEL] GET_PROJECT_BY_ID failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async getByWorkspaceId(workspaceId: string) {
    this.logOperation("GET_PROJECTS_BY_WORKSPACE", { workspaceId });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(project)
        .where(eq(project.workspaceId, workspaceId));
      const duration = performance.now() - startTime;
      console.log(
        `[PROJECT MODEL] GET_PROJECTS_BY_WORKSPACE completed in ${duration.toFixed(2)}ms, found ${result.length} projects`
      );
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[PROJECT MODEL] GET_PROJECTS_BY_WORKSPACE failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async create(data: {
    id: string;
    workspaceId: string;
    name: string;
    description?: string;
    createdBy: string;
  }) {
    this.logOperation("CREATE_PROJECT", { id: data.id, name: data.name });
    const startTime = performance.now();

    try {
      const result = await db.insert(project).values(data).returning();
      const duration = performance.now() - startTime;
      console.log(
        `[PROJECT MODEL] CREATE_PROJECT completed in ${duration.toFixed(2)}ms, created: ${result[0]?.id}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[PROJECT MODEL] CREATE_PROJECT failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      status: "draft" | "processing" | "completed" | "failed";
    }>
  ) {
    this.logOperation("UPDATE_PROJECT", { id, fields: Object.keys(data) });
    const startTime = performance.now();

    try {
      const result = await db
        .update(project)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(project.id, id))
        .returning();
      const duration = performance.now() - startTime;
      console.log(
        `[PROJECT MODEL] UPDATE_PROJECT completed in ${duration.toFixed(2)}ms, updated: ${!!result[0]}`
      );
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[PROJECT MODEL] UPDATE_PROJECT failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async delete(id: string) {
    this.logOperation("DELETE_PROJECT", { id });
    const startTime = performance.now();

    try {
      await db.delete(project).where(eq(project.id, id));
      const duration = performance.now() - startTime;
      console.log(
        `[PROJECT MODEL] DELETE_PROJECT completed in ${duration.toFixed(2)}ms`
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[PROJECT MODEL] DELETE_PROJECT failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }

  static async getWithVideos(id: string) {
    this.logOperation("GET_PROJECT_WITH_VIDEOS", { id });
    const startTime = performance.now();

    try {
      const projectResult = await db
        .select()
        .from(project)
        .where(eq(project.id, id));

      if (!projectResult[0]) {
        return null;
      }

      const videos = await db
        .select()
        .from(video)
        .where(eq(video.projectId, id));

      const duration = performance.now() - startTime;
      console.log(
        `[PROJECT MODEL] GET_PROJECT_WITH_VIDEOS completed in ${duration.toFixed(2)}ms`
      );

      return {
        ...projectResult[0],
        videos,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(
        `[PROJECT MODEL] GET_PROJECT_WITH_VIDEOS failed after ${duration.toFixed(2)}ms:`,
        error
      );
      throw error;
    }
  }
}
