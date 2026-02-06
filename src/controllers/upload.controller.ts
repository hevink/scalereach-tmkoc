import { Context } from "hono";
import { nanoid } from "nanoid";
import { R2Service } from "../services/r2.service";
import { VideoModel } from "../models/video.model";
import { addVideoProcessingJob } from "../jobs/queue";
import {
  UploadValidationService,
} from "../services/upload-validation.service";
import { getPlanConfig } from "../config/plan-config";
import { validateFileSize } from "../services/minutes-validation.service";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB - minimum for S3/R2 multipart

export class UploadController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(
      `[UPLOAD CONTROLLER] ${operation} - ${method} ${url}`,
      details ? JSON.stringify(details) : ""
    );
  }

  /**
   * Initialize a multipart upload
   * Returns uploadId and presigned URLs for each part
   */
  static async initUpload(c: Context) {
    UploadController.logRequest(c, "INIT_UPLOAD");

    try {
      const body = await c.req.json();
      const { filename, fileSize, contentType, projectId, workspaceId } = body;
      const user = c.get("user") as { id: string };

      // Validation
      if (!filename || !fileSize || !contentType) {
        return c.json({ error: "filename, fileSize, and contentType are required" }, 400);
      }

      // Require workspaceId
      if (!workspaceId) {
        return c.json({ error: "workspaceId is required" }, 400);
      }

      // Verify user has access to this workspace
      const { WorkspaceModel } = await import("../models/workspace.model");
      const member = await WorkspaceModel.getMemberByUserAndWorkspace(user.id, workspaceId);
      if (!member) {
        return c.json({ error: "You don't have access to this workspace" }, 403);
      }

      // Validate file format (MP4, MOV, WebM only)
      const formatValidation = UploadValidationService.validateFileFormat(contentType, filename);
      if (!formatValidation.valid) {
        return c.json({
          error: formatValidation.error,
          allowedFormats: UploadValidationService.getAllowedFormatsString(),
        }, 400);
      }

      // Validate file size against plan limits
      const ws = await WorkspaceModel.getById(workspaceId);
      const planConfig = getPlanConfig(ws?.plan || "free");
      const sizeValidation = validateFileSize(planConfig, fileSize);
      if (!sizeValidation.allowed) {
        return c.json({
          error: sizeValidation.message,
          reason: sizeValidation.reason,
          upgrade: sizeValidation.upgrade,
        }, 400);
      }

      // Generate storage key
      const storagePath = projectId || `user-${user.id}`;
      const storageKey = R2Service.generateVideoKey(storagePath, filename);

      // Calculate number of parts
      const totalParts = Math.ceil(fileSize / CHUNK_SIZE);

      if (totalParts > 10000) {
        return c.json({ error: "File too large - exceeds maximum parts limit" }, 400);
      }

      // Create video record in pending state with workspaceId
      const videoId = nanoid();
      await VideoModel.create({
        id: videoId,
        projectId: projectId || null,
        workspaceId: workspaceId,
        userId: user.id,
        sourceType: "upload",
        sourceUrl: filename,
        title: filename,
        fileSize,
        mimeType: contentType,
      });

      // Create multipart upload
      const uploadId = await R2Service.createMultipartUpload(storageKey, contentType);

      // Generate presigned URLs for all parts
      const partUrls = await R2Service.getPresignedUrlsForParts(
        storageKey,
        uploadId,
        totalParts,
        3600 // 1 hour expiry
      );

      console.log(`[UPLOAD CONTROLLER] Initialized upload: ${uploadId}, ${totalParts} parts, workspaceId: ${workspaceId}`);

      return c.json({
        uploadId,
        videoId,
        storageKey,
        totalParts,
        chunkSize: CHUNK_SIZE,
        partUrls,
      }, 201);
    } catch (error) {
      console.error(`[UPLOAD CONTROLLER] INIT_UPLOAD error:`, error);
      return c.json({ error: "Failed to initialize upload" }, 500);
    }
  }

  /**
   * Get presigned URL for a specific part (for resume)
   */
  static async getPartUrl(c: Context) {
    UploadController.logRequest(c, "GET_PART_URL");

    try {
      const { uploadId, storageKey, partNumber } = await c.req.json();

      if (!uploadId || !storageKey || !partNumber) {
        return c.json({ error: "uploadId, storageKey, and partNumber are required" }, 400);
      }

      const url = await R2Service.getPresignedUrlForPart(
        storageKey,
        uploadId,
        partNumber,
        3600
      );

      return c.json({ partNumber, url });
    } catch (error) {
      console.error(`[UPLOAD CONTROLLER] GET_PART_URL error:`, error);
      return c.json({ error: "Failed to get part URL" }, 500);
    }
  }

  /**
   * List uploaded parts (for resume functionality)
   */
  static async listParts(c: Context) {
    const uploadId = c.req.param("uploadId");
    const storageKey = c.req.query("storageKey");

    UploadController.logRequest(c, "LIST_PARTS", { uploadId, storageKey });

    try {
      if (!storageKey) {
        return c.json({ error: "storageKey query parameter is required" }, 400);
      }

      const parts = await R2Service.listUploadedParts(storageKey, uploadId);

      return c.json({
        uploadId,
        parts: parts.map(p => ({
          partNumber: p.PartNumber,
          etag: p.ETag,
        })),
        uploadedParts: parts.length,
      });
    } catch (error) {
      console.error(`[UPLOAD CONTROLLER] LIST_PARTS error:`, error);
      return c.json({ error: "Failed to list parts" }, 500);
    }
  }

  /**
   * Complete multipart upload
   */
  static async completeUpload(c: Context) {
    UploadController.logRequest(c, "COMPLETE_UPLOAD");

    try {
      const body = await c.req.json();
      const { uploadId, videoId, storageKey, parts } = body;
      const user = c.get("user") as { id: string };

      if (!uploadId || !videoId || !storageKey || !parts) {
        return c.json({ error: "uploadId, videoId, storageKey, and parts are required" }, 400);
      }

      // Verify video exists (ownership is verified by the fact that user created it)
      const video = await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Video not found" }, 404);
      }

      // Complete the multipart upload
      const { url } = await R2Service.completeMultipartUpload(
        storageKey,
        uploadId,
        parts.map((p: { partNumber: number; etag: string }) => ({
          PartNumber: p.partNumber,
          ETag: p.etag,
        }))
      );

      // Update video record
      await VideoModel.update(videoId, {
        storageKey,
        storageUrl: url,
        status: "transcribing",
      });

      // Add to processing queue
      await addVideoProcessingJob({
        videoId,
        projectId: video.projectId,
        userId: user.id,
        sourceType: "upload",
        sourceUrl: url,
      });

      console.log(`[UPLOAD CONTROLLER] Upload completed: ${videoId}`);

      return c.json({
        message: "Upload completed successfully",
        videoId,
        storageUrl: url,
      });
    } catch (error) {
      console.error(`[UPLOAD CONTROLLER] COMPLETE_UPLOAD error:`, error);
      return c.json({ error: "Failed to complete upload" }, 500);
    }
  }

  /**
   * Abort multipart upload
   */
  static async abortUpload(c: Context) {
    UploadController.logRequest(c, "ABORT_UPLOAD");

    try {
      const body = await c.req.json();
      const { uploadId, videoId, storageKey } = body;

      if (!uploadId || !storageKey) {
        return c.json({ error: "uploadId and storageKey are required" }, 400);
      }

      // Abort the multipart upload
      await R2Service.abortMultipartUpload(storageKey, uploadId);

      // Delete video record if exists
      if (videoId) {
        const video = await VideoModel.getById(videoId);
        if (video) {
          await VideoModel.delete(videoId);
        }
      }

      console.log(`[UPLOAD CONTROLLER] Upload aborted: ${uploadId}`);

      return c.json({ message: "Upload aborted successfully" });
    } catch (error) {
      console.error(`[UPLOAD CONTROLLER] ABORT_UPLOAD error:`, error);
      return c.json({ error: "Failed to abort upload" }, 500);
    }
  }

  /**
   * Resume an interrupted multipart upload
   * Returns the upload status and presigned URLs for remaining parts
   */
  static async resumeUpload(c: Context) {
    UploadController.logRequest(c, "RESUME_UPLOAD");

    try {
      const body = await c.req.json();
      const { uploadId, videoId, storageKey, totalParts } = body;

      if (!uploadId || !storageKey || !totalParts) {
        return c.json({ 
          error: "uploadId, storageKey, and totalParts are required" 
        }, 400);
      }

      // Verify video exists if videoId is provided
      if (videoId) {
        const video = await VideoModel.getById(videoId);
        if (!video) {
          return c.json({ error: "Video not found" }, 404);
        }
      }

      // Get list of already uploaded parts
      let uploadedParts;
      try {
        uploadedParts = await R2Service.listUploadedParts(storageKey, uploadId);
      } catch (error) {
        console.error(`[UPLOAD CONTROLLER] Failed to list parts:`, error);
        return c.json({ 
          error: "Upload session not found or expired. Please start a new upload.",
          code: "UPLOAD_SESSION_EXPIRED"
        }, 404);
      }

      // Determine which parts still need to be uploaded
      const uploadedPartNumbers = new Set(uploadedParts.map(p => p.PartNumber));
      const remainingPartNumbers: number[] = [];
      
      for (let i = 1; i <= totalParts; i++) {
        if (!uploadedPartNumbers.has(i)) {
          remainingPartNumbers.push(i);
        }
      }

      // Generate presigned URLs only for remaining parts
      const remainingPartUrls = await Promise.all(
        remainingPartNumbers.map(async (partNumber) => ({
          partNumber,
          url: await R2Service.getPresignedUrlForPart(
            storageKey,
            uploadId,
            partNumber,
            3600 // 1 hour expiry
          ),
        }))
      );

      console.log(
        `[UPLOAD CONTROLLER] Resume upload: ${uploadId}, ` +
        `${uploadedParts.length}/${totalParts} parts uploaded, ` +
        `${remainingPartNumbers.length} remaining`
      );

      return c.json({
        uploadId,
        videoId,
        storageKey,
        totalParts,
        uploadedParts: uploadedParts.map(p => ({
          partNumber: p.PartNumber,
          etag: p.ETag,
        })),
        uploadedCount: uploadedParts.length,
        remainingParts: remainingPartUrls,
        remainingCount: remainingPartNumbers.length,
        chunkSize: CHUNK_SIZE,
        isComplete: remainingPartNumbers.length === 0,
      });
    } catch (error) {
      console.error(`[UPLOAD CONTROLLER] RESUME_UPLOAD error:`, error);
      return c.json({ error: "Failed to resume upload" }, 500);
    }
  }

  /**
   * Get multiple presigned URLs for parts (batch request for efficiency)
   * Useful for resuming uploads with many remaining parts
   */
  static async getBatchPartUrls(c: Context) {
    UploadController.logRequest(c, "GET_BATCH_PART_URLS");

    try {
      const body = await c.req.json();
      const { uploadId, storageKey, partNumbers } = body;

      if (!uploadId || !storageKey || !partNumbers || !Array.isArray(partNumbers)) {
        return c.json({ 
          error: "uploadId, storageKey, and partNumbers array are required" 
        }, 400);
      }

      if (partNumbers.length > 100) {
        return c.json({ 
          error: "Maximum 100 part URLs can be requested at once" 
        }, 400);
      }

      // Generate presigned URLs for all requested parts
      const partUrls = await Promise.all(
        partNumbers.map(async (partNumber: number) => ({
          partNumber,
          url: await R2Service.getPresignedUrlForPart(
            storageKey,
            uploadId,
            partNumber,
            3600 // 1 hour expiry
          ),
        }))
      );

      console.log(
        `[UPLOAD CONTROLLER] Generated ${partUrls.length} batch part URLs for upload: ${uploadId}`
      );

      return c.json({ partUrls });
    } catch (error) {
      console.error(`[UPLOAD CONTROLLER] GET_BATCH_PART_URLS error:`, error);
      return c.json({ error: "Failed to get batch part URLs" }, 500);
    }
  }
}
