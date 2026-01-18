import { Hono } from "hono";
import { InvitationController } from "../controllers/invitation.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const invitationRouter = new Hono();

// Public routes (no auth required for viewing invitation)
invitationRouter.get("/:token", InvitationController.getInvitationByToken);

// Protected routes
invitationRouter.use("/*", authMiddleware);

// Get pending invitations for current user
invitationRouter.get("/user/pending", InvitationController.getPendingInvitations);

// Accept/decline invitation
invitationRouter.post("/:token/accept", InvitationController.acceptInvitation);
invitationRouter.post("/:token/decline", InvitationController.declineInvitation);

export default invitationRouter;
