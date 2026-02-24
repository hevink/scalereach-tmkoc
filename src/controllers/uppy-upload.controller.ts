import { Context } from "hono";
import { nanoid } from "nanoid";
import { R2Service } from "../services/r2.service";
import { VideoModel } from "../models/video.model";
import {
  UploadValidationService,
} from "../services/upload-validation.service";
import { getPlanConfig, formatBytes, getVideoExpiryDate } from "../config/plan-config";

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

      // Require workspaceId
      const workspaceId = metadata?.workspaceId;
      if (!workspaceId) {
        return c.json({ error: "workspaceId is required in metadata" }, 400);
      }

      // Verify user has access to this workspace
      const { WorkspaceModel } = await import("../models/workspace.model");
      const member = await WorkspaceModel.getMemberByUserAndWorkspace(user.id, workspaceId);
      if (!member) {
        return c.json({ error: "You don't have access to this workspace" }, 403);
      }

      // Get workspace and plan config for validation
      const workspace = await WorkspaceModel.getById(workspaceId);
      const planConfig = getPlanConfig(workspace?.plan || "free");
      
      console.log(`[UPPY UPLOAD] Workspace plan: ${workspace?.plan || "free"}, max upload size: ${formatBytes(planConfig.limits.uploadSize)}`);

      // Validate file format (MP4, MOV, WebM only)
      const formatValidation = UploadValidationService.validateFileFormat(type, filename);
      if (!formatValidation.valid) {
        return c.json({ 
          error: formatValidation.error,
          allowedFormats: UploadValidationService.getAllowedFormatsString(),
        }, 400);
      }

      // Validate file size if provided in metadata (plan-based limit)
      if (metadata?.fileSize) {
        const sizeValidation = UploadValidationService.validateFileSize(metadata.fileSize, planConfig);
        if (!sizeValidation.valid) {
          return c.json({ 
            error: sizeValidation.error,
            upgradeRequired: sizeValidation.upgradeRequired,
            recommendedPlan: sizeValidation.recommendedPlan,
            currentLimit: sizeValidation.currentLimit,
            attemptedValue: sizeValidation.attemptedValue,
            maxFileSize: formatBytes(planConfig.limits.uploadSize),
          }, 400);
        }
      }

      // Generate storage key using new hierarchical structure
      // Structure: {userId}/{videoId}/source.{ext}
      const projectId = metadata?.projectId;
      const videoId = nanoid();
      const extension = filename.split('.').pop()?.toLowerCase() || 'mp4';
      const key = R2Service.generateVideoStorageKey(user.id, videoId, extension);

      // Create video record with workspaceId
      await VideoModel.create({
        id: videoId,
        projectId: projectId || null,
        workspaceId: workspaceId,
        userId: user.id,
        sourceType: "upload",
        sourceUrl: filename,
        title: filename,
        mimeType: type,
        fileSize: metadata?.fileSize,
        expiresAt: getVideoExpiryDate(workspace?.plan || "free"),
      });

      // Create multipart upload in R2
      const uploadId = await R2Service.createMultipartUpload(key, type);

      console.log(`[UPPY UPLOAD] Created multipart upload: ${uploadId}, key: ${key}, videoId: ${videoId}, workspaceId: ${workspaceId}`);

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

      // Verify video ownership if videoId provided
      if (videoId) {
        const video = await VideoModel.getById(videoId);
        if (!video) {
          return c.json({ error: "Video not found" }, 404);
        }
        if (video.userId !== user.id) {
          return c.json({ error: "Forbidden" }, 403);
        }
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
      // Set status to pending_config - user needs to configure before processing starts
      if (videoId) {
        await VideoModel.update(videoId, {
          storageKey: key,
          storageUrl: url,
          status: "pending_config",
        });
      }

      console.log(`[UPPY UPLOAD] Completed multipart upload: ${uploadId}, videoId: ${videoId}`);

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
