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
      const user = c.get("user");
      const workspace = await WorkspaceModel.getBySlug(slug);

      if (!workspace) {
        console.log(`[WORKSPACE CONTROLLER] GET_WORKSPACE_BY_SLUG - workspace not found: ${slug}`);
        return c.json({ error: "Workspace not found" }, 404);
      }

      // Get user's role in this workspace
      let role = "member";
      if (user) {
        const member = await WorkspaceModel.getMemberByUserAndWorkspace(user.id, workspace.id);
        if (member) {
          role = member.role;
        }
      }

      console.log(`[WORKSPACE CONTROLLER] GET_WORKSPACE_BY_SLUG success - found workspace: ${workspace.id} (${slug}), user role: ${role}`);
      return c.json({ ...workspace, role });
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
      const user = c.get("user");
      if (!user) {
        console.log(`[WORKSPACE CONTROLLER] CREATE_WORKSPACE - unauthorized access attempt`);
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = await c.req.json();
      const { name, slug, description, logo } = body;
      console.log(`[WORKSPACE CONTROLLER] CREATE_WORKSPACE request body:`, { name, slug });

      if (!name || !slug) {
        console.log(`[WORKSPACE CONTROLLER] CREATE_WORKSPACE - missing required fields`);
        return c.json(
          { error: "Name and slug are required" },
          400
        );
      }

      // Auto-generate ID and use authenticated user as owner
      const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);
      const workspaceId = generateId();
      const ownerId = user.id;

      // Create workspace
      const workspace = await WorkspaceModel.create({
        id: workspaceId,
        name,
        slug,
        ownerId,
        description,
        logo,
      });

      // Add owner as workspace member
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

  // Update member role
  static async updateMemberRole(c: Context) {
    const workspaceId = c.req.param("id");
    const memberId = c.req.param("memberId");
    WorkspaceController.logRequest(c, 'UPDATE_MEMBER_ROLE', { workspaceId, memberId });
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = await c.req.json();
      const { role } = body;

      if (!role || !["admin", "member"].includes(role)) {
        return c.json({ error: "Invalid role. Must be 'admin' or 'member'" }, 400);
      }

      // Check if current user has permission (owner or admin)
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
        return c.json({ error: "You don't have permission to update member roles" }, 403);
      }

      // Find the target member
      const targetMember = members.find((m) => m.id === memberId);
      if (!targetMember) {
        return c.json({ error: "Member not found" }, 404);
      }

      // Cannot change owner's role
      if (targetMember.role === "owner") {
        return c.json({ error: "Cannot change the owner's role" }, 403);
      }

      // Only owner can change admin roles
      if (targetMember.role === "admin" && currentMember.role !== "owner") {
        return c.json({ error: "Only the owner can change admin roles" }, 403);
      }

      const updatedMember = await WorkspaceModel.updateMemberRole(memberId, role);
      console.log(`[WORKSPACE CONTROLLER] UPDATE_MEMBER_ROLE success - member: ${memberId}, new role: ${role}`);
      return c.json(updatedMember);
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] UPDATE_MEMBER_ROLE error:`, error);
      return c.json({ error: "Failed to update member role" }, 500);
    }
  }

  // Remove member from workspace
  static async removeMember(c: Context) {
    const workspaceId = c.req.param("id");
    const memberId = c.req.param("memberId");
    WorkspaceController.logRequest(c, 'REMOVE_MEMBER', { workspaceId, memberId });
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if current user has permission (owner or admin)
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      
      // Find the target member
      const targetMember = members.find((m) => m.id === memberId);
      if (!targetMember) {
        return c.json({ error: "Member not found" }, 404);
      }

      // Users can remove themselves (leave workspace)
      const isSelf = targetMember.userId === user.id;
      
      if (!isSelf) {
        // Check permission for removing others
        if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
          return c.json({ error: "You don't have permission to remove members" }, 403);
        }

        // Cannot remove owner
        if (targetMember.role === "owner") {
          return c.json({ error: "Cannot remove the workspace owner" }, 403);
        }

        // Only owner can remove admins
        if (targetMember.role === "admin" && currentMember.role !== "owner") {
          return c.json({ error: "Only the owner can remove admins" }, 403);
        }
      } else {
        // Owner cannot leave their own workspace
        if (targetMember.role === "owner") {
          return c.json({ error: "Owner cannot leave the workspace. Transfer ownership first." }, 403);
        }
      }

      await WorkspaceModel.removeMember(memberId);
      console.log(`[WORKSPACE CONTROLLER] REMOVE_MEMBER success - removed member: ${memberId}`);
      return c.json({ message: "Member removed successfully" });
    } catch (error) {
      console.error(`[WORKSPACE CONTROLLER] REMOVE_MEMBER error:`, error);
      return c.json({ error: "Failed to remove member" }, 500);
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
