import { Context } from "hono";
import { nanoid } from "nanoid";
import { ProjectModel } from "../models/project.model";
import { validateBody } from "../middleware/validation.middleware";
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "../schemas/validation.schemas";
import { VideoModel } from "../models/video.model";
import { ClipModel } from "../models/clip.model";
import { R2Service } from "../services/r2.service";
import { db } from "../db";
import { videoExport, voiceDubbing, dubbedClipAudio, viralClip } from "../db/schema";
import { inArray, eq } from "drizzle-orm";

export class ProjectController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[PROJECT CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  static async createProject(c: Context) {
    ProjectController.logRequest(c, "CREATE_PROJECT");

    try {
      // Validate request body using Zod schema
      const validation = await validateBody(c, createProjectSchema);
      if (!validation.success) {
        return c.json(validation.error, 400);
      }

      const { workspaceId, name, description } = validation.data;
      const user = c.get("user");

      console.log(`[PROJECT CONTROLLER] CREATE_PROJECT request:`, {
        workspaceId,
        name,
        userId: user?.id,
      });

      if (!user?.id) {
        return c.json({ error: "User not authenticated" }, 401);
      }

      const projectId = nanoid();

      const project = await ProjectModel.create({
        id: projectId,
        workspaceId,
        name,
        description,
        createdBy: user.id,
      });

      console.log(
        `[PROJECT CONTROLLER] CREATE_PROJECT success - created: ${project.id}`
      );

      return c.json(project, 201);
    } catch (error) {
      console.error(`[PROJECT CONTROLLER] CREATE_PROJECT error:`, error);
      return c.json({ error: "Failed to create project" }, 500);
    }
  }

  static async getProjectById(c: Context) {
    const id = c.req.param("id");
    ProjectController.logRequest(c, "GET_PROJECT_BY_ID", { id });

    try {
      const project = await ProjectModel.getById(id);

      if (!project) {
        return c.json({ error: "Project not found" }, 404);
      }

      return c.json(project);
    } catch (error) {
      console.error(`[PROJECT CONTROLLER] GET_PROJECT_BY_ID error:`, error);
      return c.json({ error: "Failed to fetch project" }, 500);
    }
  }

  static async getProjectWithVideos(c: Context) {
    const id = c.req.param("id");
    ProjectController.logRequest(c, "GET_PROJECT_WITH_VIDEOS", { id });

    try {
      const project = await ProjectModel.getWithVideos(id);

      if (!project) {
        return c.json({ error: "Project not found" }, 404);
      }

      return c.json(project);
    } catch (error) {
      console.error(
        `[PROJECT CONTROLLER] GET_PROJECT_WITH_VIDEOS error:`,
        error
      );
      return c.json({ error: "Failed to fetch project" }, 500);
    }
  }

  static async getProjectsByWorkspace(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    ProjectController.logRequest(c, "GET_PROJECTS_BY_WORKSPACE", {
      workspaceId,
    });

    try {
      const projects = await ProjectModel.getByWorkspaceId(workspaceId);
      return c.json(projects);
    } catch (error) {
      console.error(
        `[PROJECT CONTROLLER] GET_PROJECTS_BY_WORKSPACE error:`,
        error
      );
      return c.json({ error: "Failed to fetch projects" }, 500);
    }
  }

  static async updateProject(c: Context) {
    const id = c.req.param("id");
    ProjectController.logRequest(c, "UPDATE_PROJECT", { id });

    try {
      // Validate request body using Zod schema
      const validation = await validateBody(c, updateProjectSchema);
      if (!validation.success) {
        return c.json(validation.error, 400);
      }

      const project = await ProjectModel.update(id, validation.data);

      if (!project) {
        return c.json({ error: "Project not found" }, 404);
      }

      console.log(`[PROJECT CONTROLLER] UPDATE_PROJECT success - updated: ${project.id}`);
      return c.json(project);
    } catch (error) {
      console.error(`[PROJECT CONTROLLER] UPDATE_PROJECT error:`, error);
      return c.json({ error: "Failed to update project" }, 500);
    }
  }

  static async deleteProject(c: Context) {
    const id = c.req.param("id");
    ProjectController.logRequest(c, "DELETE_PROJECT", { id });

    try {
      const videos = await VideoModel.getByProjectId(id);
      const videoIds = videos.map(v => v.id);

      const clipKeys = videoIds.length > 0
        ? await ClipModel.getStorageKeysByVideoIds(videoIds)
        : [];

      const clipIds = clipKeys.length > 0
        ? (await db.select({ id: viralClip.id }).from(viralClip).where(inArray(viralClip.videoId, videoIds))).map(r => r.id)
        : [];

      const exportRows = clipIds.length > 0
        ? await db.select({ storageKey: videoExport.storageKey }).from(videoExport).where(inArray(videoExport.clipId, clipIds))
        : [];

      const dubbingRows = videoIds.length > 0
        ? await db.select({ dubbedAudioKey: voiceDubbing.dubbedAudioKey, mixedAudioKey: voiceDubbing.mixedAudioKey, id: voiceDubbing.id })
            .from(voiceDubbing).where(inArray(voiceDubbing.videoId, videoIds))
        : [];

      const dubbingIds = dubbingRows.map(d => d.id);
      const clipAudioRows = dubbingIds.length > 0
        ? await db.select({ audioKey: dubbedClipAudio.audioKey }).from(dubbedClipAudio).where(inArray(dubbedClipAudio.dubbingId, dubbingIds))
        : [];

      const r2Keys: string[] = [
        ...videos.flatMap(v =>
          [v.storageKey, v.audioStorageKey, v.thumbnailKey].filter(Boolean) as string[]
        ),
        ...clipKeys.flatMap(c =>
          [c.storageKey, c.rawStorageKey, c.thumbnailKey].filter(Boolean) as string[]
        ),
        ...exportRows.flatMap(e => [e.storageKey].filter(Boolean) as string[]),
        ...dubbingRows.flatMap(d => [d.dubbedAudioKey, d.mixedAudioKey].filter(Boolean) as string[]),
        ...clipAudioRows.flatMap(a => [a.audioKey].filter(Boolean) as string[]),
      ];

      await Promise.allSettled(r2Keys.map(key => R2Service.deleteFile(key)));

      await ProjectModel.delete(id);
      return c.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error(`[PROJECT CONTROLLER] DELETE_PROJECT error:`, error);
      return c.json({ error: "Failed to delete project" }, 500);
    }
  }
}
