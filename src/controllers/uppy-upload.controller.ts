import { Context } from "hono";
import { nanoid } from "nanoid";
import { R2Service } from "../services/r2.service";
import { VideoModel } from "../models/video.model";
import { addVideoProcessingJob } from "../jobs/queue";

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/mpeg",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

/**
 * Uppy-compatible upload controller
 * Implements the companion protocol for @uppy/aws-s3-multipart
 */
export class UppyUploadController {
  private static logRequest(c: Context, operation: string, details?: any) {
    console.log(
      `[UPPY UPLOAD] ${operation}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * Create multipart upload
   * POST /api/uppy/multipart
   * Uppy sends: { filename, type, metadata }
   * Returns: { uploadId, key }
   */
  static async createMultipartUpload(c: Context) {
    UppyUploadController.logRequest(c, "CREATE_MULTIPART_UPLOAD");

    try {
      const body = await c.req.json();
      const { filename, type, metadata } = body;
      const user = c.get("user") as { id: string };

      if (!filename || !type) {
        return c.json({ error: "filename and type are required" }, 400);
      }

      if (!ALLOWED_VIDEO_TYPES.includes(type)) {
        return c.json({ 
          error: "Invalid file type. Allowed: MP4, WebM, MOV, AVI, MKV, MPEG" 
        }, 400);
      }

      // Generate storage key
      const projectId = metadata?.projectId;
      const storagePath = projectId || `user-${user.id}`;
      const key = R2Service.generateVideoKey(storagePath, filename);

      // Create video record
      const videoId = nanoid();
      await VideoModel.create({
        id: videoId,
        projectId: projectId || null,
        userId: user.id,
        sourceType: "upload",
        sourceUrl: filename,
        title: filename,
        mimeType: type,
      });

      // Create multipart upload in R2
      const uploadId = await R2Service.createMultipartUpload(key, type);

      console.log(`[UPPY UPLOAD] Created multipart upload: ${uploadId}, key: ${key}, videoId: ${videoId}`);

      return c.json({
        uploadId,
        key,
        videoId, // Custom field for our app
      });
    } catch (error) {
      console.error(`[UPPY UPLOAD] CREATE_MULTIPART_UPLOAD error:`, error);
      return c.json({ error: "Failed to create upload" }, 500);
    }
  }

  /**
   * Get presigned URL for uploading a part
   * GET /api/uppy/multipart/:uploadId/:partNumber?key=xxx
   * Returns: { url, headers }
   */
  static async getUploadPartUrl(c: Context) {
    const uploadId = c.req.param("uploadId");
    const partNumber = parseInt(c.req.param("partNumber"), 10);
    const key = c.req.query("key");

    UppyUploadController.logRequest(c, "GET_UPLOAD_PART_URL", { uploadId, partNumber, key });

    try {
      if (!key) {
        return c.json({ error: "key query parameter is required" }, 400);
      }

      const url = await R2Service.getPresignedUrlForPart(key, uploadId, partNumber, 3600);

      return c.json({ url, headers: {} });
    } catch (error) {
      console.error(`[UPPY UPLOAD] GET_UPLOAD_PART_URL error:`, error);
      return c.json({ error: "Failed to get upload URL" }, 500);
    }
  }

  /**
   * List uploaded parts (for resume)
   * GET /api/uppy/multipart/:uploadId?key=xxx
   * Returns: { parts: [{ PartNumber, Size, ETag }] }
   */
  static async listParts(c: Context) {
    const uploadId = c.req.param("uploadId");
    const key = c.req.query("key");

    UppyUploadController.logRequest(c, "LIST_PARTS", { uploadId, key });

    try {
      if (!key) {
        return c.json({ error: "key query parameter is required" }, 400);
      }

      const parts = await R2Service.listUploadedParts(key, uploadId);

      // Format for Uppy
      const formattedParts = parts.map(p => ({
        PartNumber: p.PartNumber,
        Size: 0, // R2 doesn't return size in listParts
        ETag: p.ETag,
      }));

      return c.json(formattedParts);
    } catch (error) {
      console.error(`[UPPY UPLOAD] LIST_PARTS error:`, error);
      return c.json({ error: "Failed to list parts" }, 500);
    }
  }

  /**
   * Complete multipart upload
   * POST /api/uppy/multipart/:uploadId/complete?key=xxx
   * Uppy sends: { parts: [{ PartNumber, ETag }] }
   * Returns: { location }
   */
  static async completeMultipartUpload(c: Context) {
    const uploadId = c.req.param("uploadId");
    const key = c.req.query("key");

    UppyUploadController.logRequest(c, "COMPLETE_MULTIPART_UPLOAD", { uploadId, key });

    try {
      const body = await c.req.json();
      const { parts, videoId } = body;
      const user = c.get("user") as { id: string };

      if (!key) {
        return c.json({ error: "key query parameter is required" }, 400);
      }

      if (!parts || !Array.isArray(parts)) {
        return c.json({ error: "parts array is required" }, 400);
      }

      // Complete the upload in R2
      const { url } = await R2Service.completeMultipartUpload(
        key,
        uploadId,
        parts.map((p: { PartNumber: number; ETag: string }) => ({
          PartNumber: p.PartNumber,
          ETag: p.ETag,
        }))
      );

      // Update video record if videoId provided
      if (videoId) {
        await VideoModel.update(videoId, {
          storageKey: key,
          storageUrl: url,
          status: "transcribing",
        });

        // Get video to get projectId
        const video = await VideoModel.getById(videoId);

        // Add to processing queue
        await addVideoProcessingJob({
          videoId,
          projectId: video?.projectId || null,
          userId: user.id,
          sourceType: "upload",
          sourceUrl: url,
        });
      }

      console.log(`[UPPY UPLOAD] Completed multipart upload: ${uploadId}`);

      return c.json({ location: url });
    } catch (error) {
      console.error(`[UPPY UPLOAD] COMPLETE_MULTIPART_UPLOAD error:`, error);
      return c.json({ error: "Failed to complete upload" }, 500);
    }
  }

  /**
   * Abort multipart upload
   * DELETE /api/uppy/multipart/:uploadId?key=xxx
   */
  static async abortMultipartUpload(c: Context) {
    const uploadId = c.req.param("uploadId");
    const key = c.req.query("key");

    UppyUploadController.logRequest(c, "ABORT_MULTIPART_UPLOAD", { uploadId, key });

    try {
      if (!key) {
        return c.json({ error: "key query parameter is required" }, 400);
      }

      await R2Service.abortMultipartUpload(key, uploadId);

      console.log(`[UPPY UPLOAD] Aborted multipart upload: ${uploadId}`);

      return c.json({ success: true });
    } catch (error) {
      console.error(`[UPPY UPLOAD] ABORT_MULTIPART_UPLOAD error:`, error);
      return c.json({ error: "Failed to abort upload" }, 500);
    }
  }

  /**
   * Sign part URL after upload (for ETag verification)
   * POST /api/uppy/multipart/:uploadId/batch
   * This is used by Uppy for batch signing
   */
  static async signPartUrls(c: Context) {
    const uploadId = c.req.param("uploadId");
    
    UppyUploadController.logRequest(c, "SIGN_PART_URLS", { uploadId });

    try {
      const body = await c.req.json();
      const { key, partNumbers } = body;

      if (!key || !partNumbers) {
        return c.json({ error: "key and partNumbers are required" }, 400);
      }

      const presignedUrls: Record<number, string> = {};

      for (const partNumber of partNumbers) {
        presignedUrls[partNumber] = await R2Service.getPresignedUrlForPart(
          key,
          uploadId,
          partNumber,
          3600
        );
      }

      return c.json({ presignedUrls });
    } catch (error) {
      console.error(`[UPPY UPLOAD] SIGN_PART_URLS error:`, error);
      return c.json({ error: "Failed to sign URLs" }, 500);
    }
  }
}
