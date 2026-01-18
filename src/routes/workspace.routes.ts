import { Hono } from "hono";
import { WorkspaceController } from "../controllers/workspace.controller";
import { InvitationController } from "../controllers/invitation.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const workspaceRouter = new Hono();

// Apply auth middleware to all workspace routes
workspaceRouter.use("/*", authMiddleware);

workspaceRouter.get("/", WorkspaceController.getAllWorkspaces);
workspaceRouter.post("/", WorkspaceController.createWorkspace);
workspaceRouter.get("/:id", WorkspaceController.getWorkspaceById);
workspaceRouter.put("/:id", WorkspaceController.updateWorkspace);
workspaceRouter.delete("/:id", WorkspaceController.deleteWorkspace);

// Slug-based routes
workspaceRouter.get("/slug/:slug", WorkspaceController.getWorkspaceBySlug);
workspaceRouter.get("/slug/:slug/check", WorkspaceController.checkSlugAvailability);
workspaceRouter.put("/slug/:slug", WorkspaceController.updateWorkspaceBySlug);
workspaceRouter.delete("/slug/:slug", WorkspaceController.deleteWorkspaceBySlug);
workspaceRouter.post("/slug/:slug/logo", WorkspaceController.uploadLogo);
workspaceRouter.delete("/slug/:slug/logo", WorkspaceController.deleteLogo);

// Workspace members routes
workspaceRouter.get("/:id/members", WorkspaceController.getWorkspaceMembers);
workspaceRouter.post("/:id/members", WorkspaceController.addWorkspaceMember);
workspaceRouter.put("/:id/members/:memberId", WorkspaceController.updateMemberRole);
workspaceRouter.delete("/:id/members/:memberId", WorkspaceController.removeMember);

// Workspace invitations routes
workspaceRouter.get("/:id/invitations", InvitationController.getWorkspaceInvitations);
workspaceRouter.post("/:id/invitations", InvitationController.createInvitation);
workspaceRouter.delete("/:id/invitations/:invitationId", InvitationController.cancelInvitation);
workspaceRouter.post("/:id/invitations/:invitationId/resend", InvitationController.resendInvitation);
workspaceRouter.get("/:id/invitations/:invitationId/link", InvitationController.getInvitationLink);

export default workspaceRouter;
