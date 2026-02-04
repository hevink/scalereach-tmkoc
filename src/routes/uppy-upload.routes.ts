import { Hono } from "hono";
import { UppyUploadController } from "../controllers/uppy-upload.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { R2Service } from "../services/r2.service";
import { VideoModel } from "../models/video.model";

const uppyUploadRouter = new Hono();

// All routes require authentication
uppyUploadRouter.use("/*", authMiddleware);

// Get presigned URL for single file upload
uppyUploadRouter.get("/presign", async (c) => {
  const key = c.req.query("key");
  const contentType = c.req.query("contentType") || "video/mp4";

  if (!key) {
    return c.json({ error: "key is required" }, 400);
  }

  const url = await R2Service.getSignedUploadUrl(key, contentType, 3600);
  return c.json({ url });
});

// Complete single file upload (non-multipart)
// POST /api/uppy/complete
uppyUploadRouter.post("/complete", async (c) => {
  try {
    const body = await c.req.json();
    const { videoId, key } = body;

    if (!videoId || !key) {
      return c.json({ error: "videoId and key are required" }, 400);
    }

    // Generate the storage URL
    const storageUrl = `https://${process.env.R2_PUBLIC_URL || process.env.R2_BUCKET_NAME + "." + process.env.R2_ACCOUNT_ID + ".r2.cloudflarestorage.com"}/${key}`;

    // Update video record with storage info
    await VideoModel.update(videoId, {
      storageKey: key,
      storageUrl: storageUrl,
      status: "pending_config", // Wait for user to configure before processing
    });

    console.log(`[UPPY UPLOAD] Completed single file upload for video: ${videoId}, key: ${key}`);

    return c.json({ success: true, videoId, storageUrl });
  } catch (error) {
    console.error(`[UPPY UPLOAD] COMPLETE error:`, error);
    return c.json({ error: "Failed to complete upload" }, 500);
  }
});

// Create multipart upload
// POST /api/uppy/multipart
uppyUploadRouter.post("/multipart", UppyUploadController.createMultipartUpload);

// Get presigned URL for a part
// GET /api/uppy/multipart/:uploadId/:partNumber?key=xxx
uppyUploadRouter.get("/multipart/:uploadId/:partNumber", UppyUploadController.getUploadPartUrl);

// List uploaded parts (for resume)
// GET /api/uppy/multipart/:uploadId?key=xxx
uppyUploadRouter.get("/multipart/:uploadId", UppyUploadController.listParts);

// Complete multipart upload
// POST /api/uppy/multipart/:uploadId/complete?key=xxx
uppyUploadRouter.post("/multipart/:uploadId/complete", UppyUploadController.completeMultipartUpload);

// Abort multipart upload
// DELETE /api/uppy/multipart/:uploadId?key=xxx
uppyUploadRouter.delete("/multipart/:uploadId", UppyUploadController.abortMultipartUpload);

// Batch sign part URLs
// POST /api/uppy/multipart/:uploadId/batch
uppyUploadRouter.post("/multipart/:uploadId/batch", UppyUploadController.signPartUrls);

export default uppyUploadRouter;
