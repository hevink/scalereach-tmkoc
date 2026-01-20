import { Hono } from "hono";
import { ExportController } from "../controllers/export.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const exportRouter = new Hono();

// All export routes require authentication
exportRouter.use("/*", authMiddleware);

// Export status endpoint
exportRouter.get("/:id", ExportController.getExportStatus);

// Batch export endpoints
exportRouter.post("/batch", ExportController.initiateBatchExport);

export default exportRouter;
