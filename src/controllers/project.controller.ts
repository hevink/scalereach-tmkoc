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
      await ProjectModel.delete(id);
      return c.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error(`[PROJECT CONTROLLER] DELETE_PROJECT error:`, error);
      return c.json({ error: "Failed to delete project" }, 500);
    }
  }
}
