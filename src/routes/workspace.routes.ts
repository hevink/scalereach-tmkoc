import { Hono } from "hono";
import { WorkspaceController } from "../controllers/workspace.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const workspaceRouter = new Hono();

// Apply auth middleware to all workspace routes
workspaceRouter.use("/*", authMiddleware);

workspaceRouter.get("/", WorkspaceController.getAllWorkspaces);
workspaceRouter.get("/:id", WorkspaceController.getWorkspaceById);
workspaceRouter.get("/slug/:slug", WorkspaceController.getWorkspaceBySlug);
workspaceRouter.post("/", WorkspaceController.createWorkspace);
workspaceRouter.put("/:id", WorkspaceController.updateWorkspace);
workspaceRouter.put("/slug/:slug", WorkspaceController.updateWorkspaceBySlug);
workspaceRouter.delete("/:id", WorkspaceController.deleteWorkspace);

// Workspace members routes
workspaceRouter.get("/:id/members", WorkspaceController.getWorkspaceMembers);
workspaceRouter.post("/:id/members", WorkspaceController.addWorkspaceMember);

export default workspaceRouter;
