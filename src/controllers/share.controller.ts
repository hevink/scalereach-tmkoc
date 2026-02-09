/**
 * Share Controller
 * Handles authenticated share link management endpoints and public share access
 * 
 * Validates: Requirements 2.1, 2.3, 2.4, 2.5, 4.2, 4.4, 4.5, 5.1, 5.3, 5.4, 8.2, 8.3, 8.4, 8.6, 
 *            9.2, 9.5, 9.6, 10.2, 10.5, 12.1, 12.2, 12.4, 12.5, 20.1, 20.2, 20.3, 20.4, 20.5
 */

import { Context } from "hono";
import { ShareService, PublicShareData } from "../services/share.service";
import { ShareAnalyticsService } from "../services/share-analytics.service";
import { VideoModel } from "../models/video.model";
import { del, get, set, CacheTTL } from "../lib/cache";
import { db } from "../db";
import { shareLinks } from "../db/schema/share.schema";
import { viralClip, project } from "../db/schema/project.schema";
import { eq, and, isNull } from "drizzle-orm";
import { Readable } from "stream";
import archiver from "archiver";

/**
 * Response for create/get share link endpoint
 */
interface CreateShareResponse {
  success: boolean;
  shareToken: string;
  shareUrl: string;
  createdAt: string;
  analytics: {
    totalViews: number;
    totalDownloads: number;
  };
}

/**
 * Response for revoke share link endpoint
 */
interface RevokeShareResponse {
  success: boolean;
  message: string;
}

/**
 * Response for regenerate share link endpoint
 */
interface RegenerateShareResponse {
  success: boolean;
  shareToken: string;
  shareUrl: string;
  message: string;
}

/**
 * Response for share analytics endpoint
 */
interface ShareAnalyticsResponse {
  success: boolean;
  analytics: {
    totalViews: number;
    uniqueViewers: number;
    totalDownloads: number;
    downloadsByClip: Array<{
      clipId: string;
      clipTitle?: string;
      downloads: number;
    }>;
    viewTrend: Array<{
      date: string;
      views: number;
      uniqueViewers: number;
    }>;
  };
}

export class ShareController {
  /**
   * POST /api/videos/:videoId/share
   * Create or retrieve share link for a video
   * 
   * Validates: Requirements 2.1, 2.3, 2.4, 2.5, 20.1
   */
  static async createShareLink(c: Context): Promise<Response> {
    try {
      const videoId = c.req.param("videoId");
      const user = c.get("user");
      const workspace = c.get("workspace");

      if (!videoId) {
        return c.json({ error: "Video ID is required" }, 400);
      }

      // Use cached video from middleware, or fetch if not available
      const video = c.get("video") || await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Not Found", message: "Video not found" }, 404);
      }

      // Validate ownership — video.workspaceId can be null
      let videoWorkspaceId = video.workspaceId;
      if (!videoWorkspaceId && video.projectId) {
        const projectData = await db.query.project.findFirst({
          where: eq(project.id, video.projectId),
          columns: { workspaceId: true },
        });
        videoWorkspaceId = projectData?.workspaceId || null;
      }

      if (videoWorkspaceId !== workspace.id) {
        return c.json({ error: "Forbidden", message: "You don't have access to this video" }, 403);
      }

      // Create or retrieve share link (idempotent)
      const shareLink = await ShareService.createShareLink(videoId, workspace.id);

      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const shareUrl = `${baseUrl}/share/clips/${shareLink.token}`;

      const response: CreateShareResponse = {
        success: true,
        shareToken: shareLink.token,
        shareUrl,
        createdAt: shareLink.createdAt.toISOString(),
        analytics: {
          totalViews: 0,
          totalDownloads: 0,
        },
      };

      return c.json(response, 200);
    } catch (error) {
      console.error("[SHARE] Error creating share link:", error);
      return c.json({ error: "Internal Server Error", message: "Failed to create share link" }, 500);
    }
  }

  /**
   * DELETE /api/videos/:videoId/share
   * Revoke share link for a video
   * 
   * Validates: Requirements 4.2, 20.2
   */
  static async revokeShareLink(c: Context): Promise<Response> {
    try {
      const videoId = c.req.param("videoId");
      const workspace = c.get("workspace");

      if (!videoId) {
        return c.json({ error: "Video ID is required" }, 400);
      }

      const video = c.get("video") || await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Not Found", message: "Video not found" }, 404);
      }

      let revokeVideoWsId = video.workspaceId;
      if (!revokeVideoWsId && video.projectId) {
        const proj = await db.query.project.findFirst({
          where: eq(project.id, video.projectId),
          columns: { workspaceId: true },
        });
        revokeVideoWsId = proj?.workspaceId || null;
      }

      if (revokeVideoWsId !== workspace.id) {
        return c.json({ error: "Forbidden", message: "You don't have permission to revoke this share link" }, 403);
      }

      await ShareService.revokeShareLink(videoId, workspace.id);

      const shareLink = await ShareService.getShareLinkByVideoId(videoId);
      if (shareLink) {
        await del(`share:token:${shareLink.token}`);
      }

      return c.json({ success: true, message: "Share link revoked successfully" } as RevokeShareResponse, 200);
    } catch (error) {
      console.error("[SHARE] Error revoking share link:", error);
      return c.json({ error: "Internal Server Error", message: "Failed to revoke share link" }, 500);
    }
  }

  /**
   * POST /api/videos/:videoId/share/regenerate
   * Regenerate share link for a video (revoke old, create new)
   * 
   * Validates: Requirements 4.4, 4.5
   */
  static async regenerateShareLink(c: Context): Promise<Response> {
    try {
      const videoId = c.req.param("videoId");
      const workspace = c.get("workspace");

      if (!videoId) {
        return c.json({ error: "Video ID is required" }, 400);
      }

      const video = c.get("video") || await VideoModel.getById(videoId);
      if (!video) {
        return c.json({ error: "Not Found", message: "Video not found" }, 404);
      }

      let regenVideoWsId = video.workspaceId;
      if (!regenVideoWsId && video.projectId) {
        const proj = await db.query.project.findFirst({
          where: eq(project.id, video.projectId),
          columns: { workspaceId: true },
        });
        regenVideoWsId = proj?.workspaceId || null;
      }

      if (regenVideoWsId !== workspace.id) {
        return c.json({ error: "Forbidden", message: "You don't have permission to regenerate this share link" }, 403);
      }

      const oldShareLink = await ShareService.getShareLinkByVideoId(videoId);
      const oldToken = oldShareLink?.token;

      const newShareLink = await ShareService.regenerateShareLink(videoId, workspace.id);

      if (oldToken) {
        await del(`share:token:${oldToken}`);
      }

      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const shareUrl = `${baseUrl}/share/clips/${newShareLink.token}`;

      return c.json({
        success: true,
        shareToken: newShareLink.token,
        shareUrl,
        message: "Share link regenerated successfully. The old link is no longer valid.",
      } as RegenerateShareResponse, 200);
    } catch (error) {
      console.error("[SHARE] Error regenerating share link:", error);
      return c.json({ error: "Internal Server Error", message: "Failed to regenerate share link" }, 500);
    }
  }

  /**
   * GET /api/share/:token/analytics
   * Get analytics for a share link
   * 
   * Validates: Requirements 12.4, 12.5, 20.4
   */
  static async getShareAnalytics(c: Context): Promise<Response> {
    try {
      const token = c.req.param("token");
      const user = c.get("user");
      const workspace = c.get("workspace"); // Set by requireProPlan middleware

      if (!token) {
        return c.json({ error: "Share token is required" }, 400);
      }

      // Validate token format
      if (!ShareService.isValidToken(token)) {
        return c.json({ 
          error: "Invalid token",
          message: "The share token format is invalid",
        }, 400);
      }

      // Get share link by token
      // First, we need to query the database directly since we have the token, not videoId
      const shareLink = await db.query.shareLinks.findFirst({
        where: and(
          eq(shareLinks.token, token),
          isNull(shareLinks.revokedAt)
        ),
      });

      if (!shareLink) {
        return c.json({ 
          error: "Not Found",
          message: "Share link not found",
        }, 404);
      }

      // Validate user owns the video
      if (shareLink.workspaceId !== workspace.id) {
        return c.json({ 
          error: "Forbidden",
          message: "You don't have permission to view analytics for this share link",
        }, 403);
      }

      // Get query parameter for days (default 30, max 90)
      const daysParam = c.req.query("days");
      let days = 30;
      if (daysParam) {
        days = Math.min(Math.max(parseInt(daysParam, 10), 1), 90);
      }

      // Fetch analytics
      const analytics = await ShareAnalyticsService.getAnalytics(
        shareLink.id,
        days
      );

      const response: ShareAnalyticsResponse = {
        success: true,
        analytics,
      };

      return c.json(response, 200);
    } catch (error) {
      console.error("[SHARE] Error fetching analytics:", error);
      return c.json({ 
        error: "Internal Server Error",
        message: "Failed to fetch analytics",
      }, 500);
    }
  }

  // ============================================================================
  // PUBLIC ENDPOINTS (No authentication required)
  // ============================================================================

  /**
   * GET /api/share/:token
   * Get public share data for viewing clips
   * 
   * Validates: Requirements 5.1, 5.3, 5.4, 10.2, 10.5, 12.1, 20.3
   */
  static async getPublicShareData(c: Context): Promise<Response> {
    try {
      const token = c.req.param("token");

      if (!token) {
        return c.json({ 
          error: "Invalid token",
          message: "Share token is required",
          code: "INVALID_TOKEN_FORMAT",
        }, 400);
      }

      // Validate token format (fail fast)
      if (!ShareService.isValidToken(token)) {
        return c.json({ 
          error: "Invalid token",
          message: "The share token format is invalid",
          code: "INVALID_TOKEN_FORMAT",
        }, 400);
      }

      // Check Redis cache first
      const cacheKey = `share:token:${token}`;
      const cached = await get<PublicShareData>(cacheKey);
      
      if (cached) {
        // Record view event (async, don't wait)
        const ipAddress = c.req.header("x-forwarded-for") || 
                         c.req.header("x-real-ip") || 
                         "unknown";
        const userAgent = c.req.header("user-agent") || "unknown";
        ShareAnalyticsService.recordView(token, ipAddress, userAgent).catch(err => {
          console.error("[SHARE] Error recording view:", err);
        });

        return c.json({
          success: true,
          ...cached,
        }, 200);
      }

      // Not cached - query database
      const shareData = await ShareService.getPublicShareData(token);

      if (!shareData) {
        return c.json({ 
          error: "Share link not found",
          message: "This share link doesn't exist or has been revoked",
          code: "SHARE_LINK_NOT_FOUND",
        }, 404);
      }

      // Cache result for 5 minutes
      await set(cacheKey, shareData, CacheTTL.MEDIUM);

      // Record view event (async, don't wait)
      const ipAddress = c.req.header("x-forwarded-for") || 
                       c.req.header("x-real-ip") || 
                       "unknown";
      const userAgent = c.req.header("user-agent") || "unknown";
      ShareAnalyticsService.recordView(token, ipAddress, userAgent).catch(err => {
        console.error("[SHARE] Error recording view:", err);
      });

      return c.json({
        success: true,
        ...shareData,
      }, 200);
    } catch (error) {
      console.error("[SHARE] Error fetching public share data:", error);
      return c.json({ 
        error: "Internal Server Error",
        message: "Failed to fetch share data",
        code: "INTERNAL_SERVER_ERROR",
      }, 500);
    }
  }

  /**
   * GET /api/share/:token/download/:clipId
   * Download a specific clip
   * 
   * Validates: Requirements 8.2, 8.3, 8.4, 8.6, 12.2, 20.5
   */
  static async downloadClip(c: Context): Promise<Response> {
    try {
      const token = c.req.param("token");
      const clipId = c.req.param("clipId");

      if (!token || !clipId) {
        return c.json({ 
          error: "Invalid request",
          message: "Share token and clip ID are required",
          code: "INVALID_REQUEST",
        }, 400);
      }

      // Validate token format
      if (!ShareService.isValidToken(token)) {
        return c.json({ 
          error: "Invalid token",
          message: "The share token format is invalid",
          code: "INVALID_TOKEN_FORMAT",
        }, 400);
      }

      // Validate share link exists and is not revoked
      const shareLink = await db.query.shareLinks.findFirst({
        where: and(
          eq(shareLinks.token, token),
          isNull(shareLinks.revokedAt)
        ),
      });

      if (!shareLink) {
        return c.json({ 
          error: "Share link not found",
          message: "This share link doesn't exist or has been revoked",
          code: "SHARE_LINK_NOT_FOUND",
        }, 404);
      }

      // Fetch clip and verify it belongs to the shared video
      const clip = await db.query.viralClip.findFirst({
        where: eq(viralClip.id, clipId),
      });

      if (!clip) {
        return c.json({ 
          error: "Clip not found",
          message: "The requested clip doesn't exist",
          code: "CLIP_NOT_FOUND",
        }, 404);
      }

      // Verify clip belongs to the shared video
      if (clip.videoId !== shareLink.videoId) {
        return c.json({ 
          error: "Forbidden",
          message: "This clip is not part of the shared video",
          code: "FORBIDDEN",
        }, 403);
      }

      // Get clip storage URL
      if (!clip.storageUrl) {
        return c.json({ 
          error: "Clip not available",
          message: "The clip file is not available for download",
          code: "CLIP_NOT_AVAILABLE",
        }, 404);
      }

      // Record download event (async, don't wait)
      const ipAddress = c.req.header("x-forwarded-for") || 
                       c.req.header("x-real-ip") || 
                       "unknown";
      const userAgent = c.req.header("user-agent") || "unknown";
      ShareAnalyticsService.recordDownload(token, clipId, ipAddress, userAgent).catch(err => {
        console.error("[SHARE] Error recording download:", err);
      });

      // For R2/S3 public URLs, redirect to the URL
      // The browser will handle the download
      if (clip.storageUrl.startsWith("http")) {
        // Set headers for download
        const sanitizedTitle = clip.title.replace(/[^a-zA-Z0-9-_]/g, "_");
        const filename = `${sanitizedTitle}.mp4`;
        
        // Return a redirect response with download headers
        return c.redirect(clip.storageUrl, 302);
      }

      // If it's a key (not a full URL), we need to stream from S3
      // This is a fallback for non-public URLs
      return c.json({ 
        error: "Download not available",
        message: "Direct download is not available for this clip",
        code: "DOWNLOAD_NOT_AVAILABLE",
      }, 500);
    } catch (error) {
      console.error("[SHARE] Error downloading clip:", error);
      return c.json({ 
        error: "Internal Server Error",
        message: "Failed to download clip",
        code: "INTERNAL_SERVER_ERROR",
      }, 500);
    }
  }

  /**
   * GET /api/share/:token/download/batch
   * Download all clips as a ZIP archive
   * 
   * Validates: Requirements 9.2, 9.5, 9.6
   */
  static async downloadBatch(c: Context): Promise<Response> {
    try {
      const token = c.req.param("token");

      if (!token) {
        return c.json({ 
          error: "Invalid token",
          message: "Share token is required",
          code: "INVALID_TOKEN_FORMAT",
        }, 400);
      }

      // Validate token format
      if (!ShareService.isValidToken(token)) {
        return c.json({ 
          error: "Invalid token",
          message: "The share token format is invalid",
          code: "INVALID_TOKEN_FORMAT",
        }, 400);
      }

      // Get share data
      const shareData = await ShareService.getPublicShareData(token);

      if (!shareData) {
        return c.json({ 
          error: "Share link not found",
          message: "This share link doesn't exist or has been revoked",
          code: "SHARE_LINK_NOT_FOUND",
        }, 404);
      }

      // Enforce 50 clip maximum
      if (shareData.clips.length > 50) {
        return c.json({ 
          error: "Batch download limit exceeded",
          message: "You can download a maximum of 50 clips at once. Please download clips individually.",
          code: "BATCH_DOWNLOAD_LIMIT_EXCEEDED",
        }, 400);
      }

      if (shareData.clips.length === 0) {
        return c.json({ 
          error: "No clips available",
          message: "There are no clips available for download",
          code: "NO_CLIPS_AVAILABLE",
        }, 400);
      }

      // Record batch download event (async, don't wait)
      const ipAddress = c.req.header("x-forwarded-for") || 
                       c.req.header("x-real-ip") || 
                       "unknown";
      const userAgent = c.req.header("user-agent") || "unknown";
      
      // Record a download event for each clip
      shareData.clips.forEach(clip => {
        ShareAnalyticsService.recordDownload(token, clip.id, ipAddress, userAgent).catch(err => {
          console.error("[SHARE] Error recording batch download:", err);
        });
      });

      // Create ZIP archive filename
      const sanitizedTitle = shareData.videoTitle.replace(/[^a-zA-Z0-9-_]/g, "_");
      const zipFilename = `${sanitizedTitle}-clips.zip`;

      // Set response headers for ZIP download
      c.header("Content-Type", "application/zip");
      c.header("Content-Disposition", `attachment; filename="${zipFilename}"`);
      c.header("Transfer-Encoding", "chunked");

      // Create a ZIP archive using archiver
      const archive = archiver("zip", {
        zlib: { level: 6 }, // Compression level (0-9)
      });

      // Handle archiver errors
      archive.on("error", (err) => {
        console.error("[SHARE] ZIP archive error:", err);
        throw err;
      });

      // For each clip, add it to the ZIP
      // Note: Since clips are stored as public URLs, we need to fetch them
      for (let i = 0; i < shareData.clips.length; i++) {
        const clip = shareData.clips[i];
        
        if (!clip.storageUrl || !clip.storageUrl.startsWith("http")) {
          console.warn(`[SHARE] Skipping clip ${clip.id} - no valid storage URL`);
          continue;
        }

        try {
          // Fetch the clip file
          const response = await fetch(clip.storageUrl);
          if (!response.ok) {
            console.warn(`[SHARE] Failed to fetch clip ${clip.id}: ${response.status}`);
            continue;
          }

          // Get the file as a buffer
          const buffer = await response.arrayBuffer();
          
          // Sanitize filename
          const sanitizedClipTitle = clip.title.replace(/[^a-zA-Z0-9-_]/g, "_");
          const clipFilename = `${i + 1}_${sanitizedClipTitle}.mp4`;

          // Add to ZIP
          archive.append(Buffer.from(buffer), { name: clipFilename });
        } catch (err) {
          console.error(`[SHARE] Error adding clip ${clip.id} to ZIP:`, err);
          // Continue with other clips
        }
      }

      // Finalize the archive
      archive.finalize();

      // Stream the ZIP to the response
      // Convert the archive stream to a web-compatible stream
      const readable = Readable.from(archive);
      
      // Return the stream as the response body
      return new Response(readable as any, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${zipFilename}"`,
          "Transfer-Encoding": "chunked",
        },
      });
    } catch (error) {
      console.error("[SHARE] Error creating batch download:", error);
      return c.json({ 
        error: "Internal Server Error",
        message: "Failed to create batch download",
        code: "INTERNAL_SERVER_ERROR",
      }, 500);
    }
  }
}
