import { Hono } from "hono";
import { MinutesController } from "../controllers/minutes.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const minutesRouter = new Hono();

// All routes are protected
const protectedRoutes = new Hono();
protectedRoutes.use("*", authMiddleware);

protectedRoutes.get("/workspaces/:workspaceId/balance", MinutesController.getBalance);
protectedRoutes.get("/workspaces/:workspaceId/transactions", MinutesController.getTransactions);
protectedRoutes.post("/workspaces/:workspaceId/validate-upload", MinutesController.validateUpload);

minutesRouter.route("/", protectedRoutes);

export default minutesRouter;
