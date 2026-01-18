import { Hono } from "hono";
import { UploadController } from "../controllers/upload.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const uploadRouter = new Hono();

// All upload routes require authentication
uploadRouter.use("/*", authMiddleware);

// Initialize multipart upload
uploadRouter.post("/init", UploadController.initUpload);

// Get presigned URL for a specific part (for resume)
uploadRouter.post("/part-url", UploadController.getPartUrl);

// List uploaded parts (for resume)
uploadRouter.get("/:uploadId/parts", UploadController.listParts);

// Complete multipart upload
uploadRouter.post("/complete", UploadController.completeUpload);

// Abort multipart upload
uploadRouter.post("/abort", UploadController.abortUpload);

export default uploadRouter;
