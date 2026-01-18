import { Hono } from "hono";
import { ProjectController } from "../controllers/project.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const projectRouter = new Hono();

// All routes are protected
projectRouter.use("/*", authMiddleware);

projectRouter.post("/", ProjectController.createProject);
projectRouter.get("/workspace/:workspaceId", ProjectController.getProjectsByWorkspace);
projectRouter.get("/:id", ProjectController.getProjectById);
projectRouter.get("/:id/full", ProjectController.getProjectWithVideos);
projectRouter.put("/:id", ProjectController.updateProject);
projectRouter.delete("/:id", ProjectController.deleteProject);

export default projectRouter;
