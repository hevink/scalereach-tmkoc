import { Context } from "hono";
import { WorkspaceModel } from "../models/workspace.model";

export class WorkspaceController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    const userAgent = c.req.header('user-agent') || 'unknown';
    const user = c.get("user");
    console.log(`[WORKSPACE CONTROLLER] ${operation} - ${method} ${url}`, details ? JSON.stringify(details) : '');
    console.log(`[WORKSPACE CONTROLLER] User-Agent: ${userAgent}`);
    if (user) {
      console.log(`[WORKSPACE CONTROLLER] Authenticated user: ${user.id}`);
    }
  }

  static async getAllWorkspaces(c: Context) {
    WorkspaceController.logRequest(c, 'GET_ALL_WORKSPACES');
    
    try {
      const user = c.get("user");
      if (!user) {
        console.log(`[WORKSPACE CONTROLLER] GET_ALL_WORKSPACES - unauthorized access attempt`);
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Get workspaces where user is a member
      const workspaces = await WorkspaceModel.getUserWorkspaces(user.id);
      console.log(`[WORKSPACE CONTROLLER] GET_ALL_WORKSPACES success - returned ${workspaces.length} workspaces for user ${user.id}`);
      return c.json(workspaces);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] GET_ALL_WORKSPACES error:`, error);
      return c.json({ error: "Failed to fetch workspaces" }, 500);
    }
  }

  static async getWorkspaceById(c: Context) {
    const id = c.req.param("id");
    WorkspaceController.logRequest(c, 'GET_WORKSPACE_BY_ID', { id });
    
    try {
      const workspace = await WorkspaceModel.getById(id);

      if (!workspace) {
        console.log(`[WORKSPACE CONTROLLER] GET_WORKSPACE_BY_ID - workspace not found: ${id}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      console.log(`[WORKSPACE CONTROLLER] GET_WORKSPACE_BY_ID success - found workspace: ${workspace.id}`);
      return c.json(workspace);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] GET_WORKSPACE_BY_ID error:`, error);
      return c.json({ error: "Failed to fetch workspace" }, 500);
    }
  }

  static async getWorkspaceBySlug(c: Context) {
    const slug = c.req.param("slug");
    WorkspaceController.logRequest(c, 'GET_WORKSPACE_BY_SLUG', { slug });
    
    try {
      const workspace = await WorkspaceModel.getBySlug(slug);

      if (!workspace) {
        console.log(`[WORKSPACE CONTROLLER] GET_WORKSPACE_BY_SLUG - workspace not found: ${slug}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      console.log(`[WORKSPACE CONTROLLER] GET_WORKSPACE_BY_SLUG success - found workspace: ${workspace.id} (${slug})`);
      return c.json(workspace);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] GET_WORKSPACE_BY_SLUG error:`, error);
      return c.json({ error: "Failed to fetch workspace" }, 500);
    }
  }

  static async updateWorkspaceBySlug(c: Context) {
    const slug = c.req.param("slug");
    WorkspaceController.logRequest(c, 'UPDATE_WORKSPACE_BY_SLUG', { slug });
    
    try {
      const body = await c.req.json();
      console.log(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE_BY_SLUG request body:`, body);

      // Get the workspace first to get its ID
      const existingWorkspace = await WorkspaceModel.getBySlug(slug);
      if (!existingWorkspace) {
        console.log(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE_BY_SLUG - workspace not found: ${slug}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      const workspace = await WorkspaceModel.update(existingWorkspace.id, body);

      if (!workspace) {
        console.log(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE_BY_SLUG - update failed for workspace: ${slug}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      console.log(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE_BY_SLUG success - updated workspace: ${workspace.id} (${slug})`);
      return c.json(workspace);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE_BY_SLUG error:`, error);
      return c.json({ error: "Failed to update workspace" }, 500);
    }
  }

  static async createWorkspace(c: Context) {
    WorkspaceController.logRequest(c, 'CREATE_WORKSPACE');
    
    try {
      const body = await c.req.json();
      const { id, name, slug, ownerId, description, logo } = body;
      console.log(`[WORKSPACE CONTROLLER] CREATE_WORKSPACE request body:`, { id, name, slug, ownerId });

      if (!id || !name || !slug || !ownerId) {
        console.log(`[WORKSPACE CONTROLLER] CREATE_WORKSPACE - missing required fields`);
        return c.json(
          { error: "ID, name, slug and ownerId are required" },
          400
        );
      }

      // Create workspace
      const workspace = await WorkspaceModel.create({
        id,
        name,
        slug,
        ownerId,
        description,
        logo,
      });

      // Add owner as workspace member
      const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);
      const memberId = generateId();
      console.log(`[WORKSPACE CONTROLLER] CREATE_WORKSPACE - adding owner as member: ${memberId}`);
      
      await WorkspaceModel.addMember({
        id: memberId,
        workspaceId: workspace.id,
        userId: ownerId,
        role: "owner",
      });

      console.log(`[WORKSPACE CONTROLLER] CREATE_WORKSPACE success - created workspace: ${workspace.id} (${slug})`);
      return c.json(workspace, 201);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] CREATE_WORKSPACE error:`, error);
      return c.json({ error: "Failed to create workspace" }, 500);
    }
  }

  static async updateWorkspace(c: Context) {
    const id = c.req.param("id");
    WorkspaceController.logRequest(c, 'UPDATE_WORKSPACE', { id });
    
    try {
      const body = await c.req.json();
      console.log(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE request body:`, body);

      const workspace = await WorkspaceModel.update(id, body);

      if (!workspace) {
        console.log(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE - workspace not found: ${id}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      console.log(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE success - updated workspace: ${workspace.id}`);
      return c.json(workspace);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] UPDATE_WORKSPACE error:`, error);
      return c.json({ error: "Failed to update workspace" }, 500);
    }
  }

  static async deleteWorkspace(c: Context) {
    const id = c.req.param("id");
    WorkspaceController.logRequest(c, 'DELETE_WORKSPACE', { id });
    
    try {
      await WorkspaceModel.delete(id);
      console.log(`[WORKSPACE CONTROLLER] DELETE_WORKSPACE success - deleted workspace: ${id}`);
      return c.json({ message: "Workspace deleted successfully" });
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] DELETE_WORKSPACE error:`, error);
      return c.json({ error: "Failed to delete workspace" }, 500);
    }
  }

  static async getWorkspaceMembers(c: Context) {
    const workspaceId = c.req.param("id");
    WorkspaceController.logRequest(c, 'GET_WORKSPACE_MEMBERS', { workspaceId });
    
    try {
      const members = await WorkspaceModel.getMembers(workspaceId);
      console.log(`[WORKSPACE CONTROLLER] GET_WORKSPACE_MEMBERS success - found ${members.length} members for workspace: ${workspaceId}`);
      return c.json(members);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] GET_WORKSPACE_MEMBERS error:`, error);
      return c.json({ error: "Failed to fetch workspace members" }, 500);
    }
  }

  static async addWorkspaceMember(c: Context) {
    const workspaceId = c.req.param("id");
    WorkspaceController.logRequest(c, 'ADD_WORKSPACE_MEMBER', { workspaceId });
    
    try {
      const body = await c.req.json();
      const { id, userId, role } = body;
      console.log(`[WORKSPACE CONTROLLER] ADD_WORKSPACE_MEMBER request body:`, { id, userId, role });

      if (!id || !userId || !role) {
        console.log(`[WORKSPACE CONTROLLER] ADD_WORKSPACE_MEMBER - missing required fields`);
        return c.json({ error: "ID, userId and role are required" }, 400);
      }

      const member = await WorkspaceModel.addMember({
        id,
        workspaceId,
        userId,
        role,
      });
      console.log(`[WORKSPACE CONTROLLER] ADD_WORKSPACE_MEMBER success - added member: ${member.id} to workspace: ${workspaceId}`);
      return c.json(member, 201);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] ADD_WORKSPACE_MEMBER error:`, error);
      return c.json({ error: "Failed to add workspace member" }, 500);
    }
  }

  // Check slug availability
  static async checkSlugAvailability(c: Context) {
    const slug = c.req.param("slug");
    WorkspaceController.logRequest(c, 'CHECK_SLUG_AVAILABILITY', { slug });
    
    try {
      const workspace = await WorkspaceModel.getBySlug(slug);
      const available = !workspace;
      
      console.log(`[WORKSPACE CONTROLLER] CHECK_SLUG_AVAILABILITY success - slug ${slug} available: ${available}`);
      return c.json({ available, slug });
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] CHECK_SLUG_AVAILABILITY error:`, error);
      return c.json({ error: "Failed to check slug availability" }, 500);
    }
  }

  // Delete workspace by slug
  static async deleteWorkspaceBySlug(c: Context) {
    const slug = c.req.param("slug");
    WorkspaceController.logRequest(c, 'DELETE_WORKSPACE_BY_SLUG', { slug });
    
    try {
      const workspace = await WorkspaceModel.getBySlug(slug);
      if (!workspace) {
        console.log(`[WORKSPACE CONTROLLER] DELETE_WORKSPACE_BY_SLUG - workspace not found: ${slug}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      await WorkspaceModel.delete(workspace.id);
      console.log(`[WORKSPACE CONTROLLER] DELETE_WORKSPACE_BY_SLUG success - deleted workspace: ${slug}`);
      return c.json({ message: "Workspace deleted successfully" });
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] DELETE_WORKSPACE_BY_SLUG error:`, error);
      return c.json({ error: "Failed to delete workspace" }, 500);
    }
  }

  // Upload workspace logo
  static async uploadLogo(c: Context) {
    const slug = c.req.param("slug");
    WorkspaceController.logRequest(c, 'UPLOAD_LOGO', { slug });
    
    try {
      const workspace = await WorkspaceModel.getBySlug(slug);
      if (!workspace) {
        console.log(`[WORKSPACE CONTROLLER] UPLOAD_LOGO - workspace not found: ${slug}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      const body = await c.req.json();
      const { logo } = body;
      
      if (!logo) {
        return c.json({ error: "Logo is required" }, 400);
      }

      const updatedWorkspace = await WorkspaceModel.update(workspace.id, { logo });
      
      console.log(`[WORKSPACE CONTROLLER] UPLOAD_LOGO success - workspace: ${slug}`);
      return c.json({ success: true, logo: updatedWorkspace?.logo });
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] UPLOAD_LOGO error:`, error);
      return c.json({ error: "Failed to upload logo" }, 500);
    }
  }

  // Delete workspace logo
  static async deleteLogo(c: Context) {
    const slug = c.req.param("slug");
    WorkspaceController.logRequest(c, 'DELETE_LOGO', { slug });
    
    try {
      const workspace = await WorkspaceModel.getBySlug(slug);
      if (!workspace) {
        console.log(`[WORKSPACE CONTROLLER] DELETE_LOGO - workspace not found: ${slug}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      await WorkspaceModel.update(workspace.id, { logo: "" });
      
      console.log(`[WORKSPACE CONTROLLER] DELETE_LOGO success - workspace: ${slug}`);
      return c.json({ success: true });
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] DELETE_LOGO error:`, error);
      return c.json({ error: "Failed to delete logo" }, 500);
    }
  }
}
