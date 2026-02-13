import { Context } from "hono";
import { InvitationModel } from "../models/invitation.model";
import { WorkspaceModel } from "../models/workspace.model";
import { emailService } from "../services/email.service";
import crypto from "crypto";

export class InvitationController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    const user = c.get("user");
    console.log(`[INVITATION CONTROLLER] ${operation} - ${method} ${url}`, details ? JSON.stringify(details) : "");
    if (user) {
      console.log(`[INVITATION CONTROLLER] Authenticated user: ${user.id}`);
    }
  }

  private static generateId(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  private static generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  // Create invitation - POST /api/workspaces/:id/invitations
  static async createInvitation(c: Context) {
    const workspaceId = c.req.param("id");
    InvitationController.logRequest(c, "CREATE_INVITATION", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = await c.req.json();
      const { email, role = "member" } = body;

      if (!email) {
        return c.json({ error: "Email is required" }, 400);
      }

      if (!["admin", "member"].includes(role)) {
        return c.json({ error: "Invalid role. Must be 'admin' or 'member'" }, 400);
      }

      // Check if workspace exists
      const workspace = await WorkspaceModel.getById(workspaceId);
      if (!workspace) {
        return c.json({ error: "Workspace not found" }, 404);
      }

      // Check if workspace plan allows inviting members
      const allowedPlans = ["starter", "pro", "pro-plus", "agency"];
      if (!allowedPlans.includes(workspace.plan)) {
        return c.json({ 
          error: "Plan upgrade required", 
          message: "Upgrade to Starter or Pro plan to invite team members" 
        }, 403);
      }

      // Check if user has permission to invite (owner or admin)
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
        return c.json({ error: "You don't have permission to invite members" }, 403);
      }

      // Check if invitation already exists
      const existingInvitation = await InvitationModel.getByWorkspaceAndEmail(workspaceId, email);
      if (existingInvitation) {
        if (existingInvitation.status === "pending") {
          return c.json({ error: "An invitation has already been sent to this email" }, 409);
        }
        // If invitation exists but is expired/declined, delete it and create a new one
        await InvitationModel.delete(existingInvitation.id);
      }

      // Check if user is already a member by email
      const existingMember = members.find(
        (m) => m.user.email.toLowerCase() === email.toLowerCase()
      );
      if (existingMember) {
        return c.json(
          { error: "This user is already a member of the workspace" },
          409
        );
      }

      // Create invitation
      const invitation = await InvitationModel.create({
        id: InvitationController.generateId(),
        workspaceId,
        email: email.toLowerCase(),
        role,
        token: InvitationController.generateToken(),
        invitedBy: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      // Send invitation email
      await emailService.sendWorkspaceInvitation({
        to: email,
        inviterName: user.name || user.email,
        workspaceName: workspace.name,
        role,
        inviteToken: invitation.token,
      });

      console.log(`[INVITATION CONTROLLER] CREATE_INVITATION success - invitation: ${invitation.id}`);
      return c.json(invitation, 201);
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] CREATE_INVITATION error:`, error);
      return c.json({ error: "Failed to create invitation" }, 500);
    }
  }


  // Get workspace invitations - GET /api/workspaces/:id/invitations
  static async getWorkspaceInvitations(c: Context) {
    const workspaceId = c.req.param("id");
    InvitationController.logRequest(c, "GET_WORKSPACE_INVITATIONS", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user has access to workspace
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember) {
        return c.json({ error: "You don't have access to this workspace" }, 403);
      }

      const invitations = await InvitationModel.getWorkspaceInvitations(workspaceId);
      console.log(`[INVITATION CONTROLLER] GET_WORKSPACE_INVITATIONS success - found ${invitations.length}`);
      return c.json(invitations);
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] GET_WORKSPACE_INVITATIONS error:`, error);
      return c.json({ error: "Failed to fetch invitations" }, 500);
    }
  }

  // Get invitation by token - GET /api/invitations/:token
  static async getInvitationByToken(c: Context) {
    const token = c.req.param("token");
    InvitationController.logRequest(c, "GET_INVITATION_BY_TOKEN", { token: token.substring(0, 8) + "..." });

    try {
      const result = await InvitationModel.getByToken(token);

      if (!result) {
        return c.json({ error: "Invitation not found" }, 404);
      }

      const { invitation, workspace, inviter } = result;

      // Check if invitation is expired
      if (new Date(invitation.expiresAt) < new Date()) {
        return c.json({ error: "Invitation has expired", status: "expired" }, 410);
      }

      // Check if invitation is already used
      if (invitation.status !== "pending") {
        return c.json({ error: `Invitation has been ${invitation.status}`, status: invitation.status }, 410);
      }

      console.log(`[INVITATION CONTROLLER] GET_INVITATION_BY_TOKEN success`);
      return c.json({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          logo: workspace.logo,
        },
        inviter: {
          name: inviter.name,
        },
      });
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] GET_INVITATION_BY_TOKEN error:`, error);
      return c.json({ error: "Failed to fetch invitation" }, 500);
    }
  }

  // Accept invitation - POST /api/invitations/:token/accept
  static async acceptInvitation(c: Context) {
    const token = c.req.param("token");
    InvitationController.logRequest(c, "ACCEPT_INVITATION", { token: token.substring(0, 8) + "..." });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized. Please log in to accept the invitation." }, 401);
      }

      const result = await InvitationModel.getByToken(token);

      if (!result) {
        return c.json({ error: "Invitation not found" }, 404);
      }

      const { invitation, workspace } = result;

      // Check if invitation is expired
      if (new Date(invitation.expiresAt) < new Date()) {
        await InvitationModel.updateStatus(invitation.id, "expired");
        return c.json({ error: "Invitation has expired" }, 410);
      }

      // Check if invitation is already used
      if (invitation.status !== "pending") {
        return c.json({ error: `Invitation has been ${invitation.status}` }, 410);
      }

      // Check if the logged-in user's email matches the invitation
      if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        return c.json({ 
          error: "This invitation was sent to a different email address",
          invitedEmail: invitation.email 
        }, 403);
      }

      // Check if user is already a member
      const members = await WorkspaceModel.getMembers(invitation.workspaceId);
      const existingMember = members.find((m) => m.userId === user.id);
      if (existingMember) {
        await InvitationModel.updateStatus(invitation.id, "accepted");
        return c.json({ 
          message: "You are already a member of this workspace",
          workspace: { id: workspace.id, slug: workspace.slug }
        });
      }

      // Add user as workspace member
      await WorkspaceModel.addMember({
        id: InvitationController.generateId(),
        workspaceId: invitation.workspaceId,
        userId: user.id,
        role: invitation.role as "owner" | "admin" | "member",
      });

      // Update invitation status
      await InvitationModel.updateStatus(invitation.id, "accepted");

      console.log(`[INVITATION CONTROLLER] ACCEPT_INVITATION success - user ${user.id} joined workspace ${workspace.id}`);
      return c.json({
        message: "Invitation accepted successfully",
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
        },
      });
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] ACCEPT_INVITATION error:`, error);
      return c.json({ error: "Failed to accept invitation" }, 500);
    }
  }

  // Decline invitation - POST /api/invitations/:token/decline
  static async declineInvitation(c: Context) {
    const token = c.req.param("token");
    InvitationController.logRequest(c, "DECLINE_INVITATION", { token: token.substring(0, 8) + "..." });

    try {
      const result = await InvitationModel.getByToken(token);

      if (!result) {
        return c.json({ error: "Invitation not found" }, 404);
      }

      const { invitation } = result;

      if (invitation.status !== "pending") {
        return c.json({ error: `Invitation has been ${invitation.status}` }, 410);
      }

      await InvitationModel.updateStatus(invitation.id, "declined");

      console.log(`[INVITATION CONTROLLER] DECLINE_INVITATION success`);
      return c.json({ message: "Invitation declined" });
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] DECLINE_INVITATION error:`, error);
      return c.json({ error: "Failed to decline invitation" }, 500);
    }
  }

  // Cancel invitation - DELETE /api/workspaces/:id/invitations/:invitationId
  static async cancelInvitation(c: Context) {
    const workspaceId = c.req.param("id");
    const invitationId = c.req.param("invitationId");
    InvitationController.logRequest(c, "CANCEL_INVITATION", { workspaceId, invitationId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user has permission
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
        return c.json({ error: "You don't have permission to cancel invitations" }, 403);
      }

      const invitation = await InvitationModel.getById(invitationId);
      if (!invitation || invitation.workspaceId !== workspaceId) {
        return c.json({ error: "Invitation not found" }, 404);
      }

      await InvitationModel.delete(invitationId);

      console.log(`[INVITATION CONTROLLER] CANCEL_INVITATION success`);
      return c.json({ message: "Invitation cancelled" });
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] CANCEL_INVITATION error:`, error);
      return c.json({ error: "Failed to cancel invitation" }, 500);
    }
  }

  // Resend invitation - POST /api/workspaces/:id/invitations/:invitationId/resend
  static async resendInvitation(c: Context) {
    const workspaceId = c.req.param("id");
    const invitationId = c.req.param("invitationId");
    InvitationController.logRequest(c, "RESEND_INVITATION", { workspaceId, invitationId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user has permission
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
        return c.json({ error: "You don't have permission to resend invitations" }, 403);
      }

      const invitation = await InvitationModel.getById(invitationId);
      if (!invitation || invitation.workspaceId !== workspaceId) {
        return c.json({ error: "Invitation not found" }, 404);
      }

      if (invitation.status !== "pending") {
        return c.json({ error: `Cannot resend ${invitation.status} invitation` }, 400);
      }

      const workspace = await WorkspaceModel.getById(workspaceId);
      if (!workspace) {
        return c.json({ error: "Workspace not found" }, 404);
      }

      // Resend email
      await emailService.sendWorkspaceInvitation({
        to: invitation.email,
        inviterName: user.name || user.email,
        workspaceName: workspace.name,
        role: invitation.role,
        inviteToken: invitation.token,
      });

      console.log(`[INVITATION CONTROLLER] RESEND_INVITATION success`);
      return c.json({ message: "Invitation resent successfully" });
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] RESEND_INVITATION error:`, error);
      return c.json({ error: "Failed to resend invitation" }, 500);
    }
  }

  // Get invitation link token - GET /api/workspaces/:id/invitations/:invitationId/link
  static async getInvitationLink(c: Context) {
    const workspaceId = c.req.param("id");
    const invitationId = c.req.param("invitationId");
    InvitationController.logRequest(c, "GET_INVITATION_LINK", { workspaceId, invitationId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Check if user has permission (owner or admin)
      const members = await WorkspaceModel.getMembers(workspaceId);
      const currentMember = members.find((m) => m.userId === user.id);
      if (!currentMember || !["owner", "admin"].includes(currentMember.role)) {
        return c.json({ error: "You don't have permission to access invitation links" }, 403);
      }

      const invitation = await InvitationModel.getById(invitationId);
      if (!invitation || invitation.workspaceId !== workspaceId) {
        return c.json({ error: "Invitation not found" }, 404);
      }

      if (invitation.status !== "pending") {
        return c.json({ error: "Invitation is no longer pending" }, 400);
      }

      const token = await InvitationModel.getTokenById(invitationId);
      if (!token) {
        return c.json({ error: "Token not found" }, 404);
      }

      console.log(`[INVITATION CONTROLLER] GET_INVITATION_LINK success`);
      return c.json({ token });
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] GET_INVITATION_LINK error:`, error);
      return c.json({ error: "Failed to get invitation link" }, 500);
    }
  }

  // Get pending invitations for current user - GET /api/invitations/pending
  static async getPendingInvitations(c: Context) {
    InvitationController.logRequest(c, "GET_PENDING_INVITATIONS");

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const invitations = await InvitationModel.getPendingInvitationsForEmail(user.email);

      console.log(`[INVITATION CONTROLLER] GET_PENDING_INVITATIONS success - found ${invitations.length}`);
      return c.json(invitations);
    } catch (error) {
      console.error(`[INVITATION CONTROLLER] GET_PENDING_INVITATIONS error:`, error);
      return c.json({ error: "Failed to fetch pending invitations" }, 500);
    }
  }
}
