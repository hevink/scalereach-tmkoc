/**
 * Share Service
 * Handles share link management for public clip viewing
 * 
 * Validates: Requirements 2.2, 2.4, 2.5, 4.2, 5.4, 10.1, 10.5
 */

import { db } from "../db";
import { shareLinks } from "../db/schema/share.schema";
import { video, viralClip } from "../db/schema/project.schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * Public share data returned to viewers (sanitized, no workspace info)
 */
export interface PublicShareData {
  videoTitle: string;
  clipCount: number;
  thumbnailUrl: string;
  videoThumbnailUrl: string;
  clips: PublicClipData[];
}

/**
 * Individual clip data for public viewing
 */
export interface PublicClipData {
  id: string;
  title: string | null;
  duration: number | null;
  viralityScore: number;
  viralityReason: string;
  hooks: string[];
  recommendedPlatforms: string[];
  transcript: string;
  thumbnailUrl: string;
  storageUrl: string;
  aspectRatio: string | null;
}

/**
 * Share link database record
 */
export interface ShareLink {
  id: string;
  token: string;
  videoId: string;
  workspaceId: string;
  createdAt: Date;
  revokedAt: Date | null;
}

export class ShareService {
  /**
   * Create or retrieve share link for a video
   * Implements idempotent share link creation
   * 
   * Validates: Requirements 2.2, 2.4, 2.5
   * 
   * @param videoId - The video ID to create a share link for
   * @param workspaceId - The workspace ID that owns the video
   * @returns The share link record
   */
  static async createShareLink(
    videoId: string,
    workspaceId: string
  ): Promise<ShareLink> {
    // Check if share link already exists (idempotence)
    const existing = await db.query.shareLinks.findFirst({
      where: and(
        eq(shareLinks.videoId, videoId),
        isNull(shareLinks.revokedAt)
      ),
    });

    if (existing) {
      return existing;
    }

    // Generate new UUID v4 token
    const token = randomUUID();

    // Insert to database
    const [shareLink] = await db
      .insert(shareLinks)
      .values({
        id: randomUUID(),
        token,
        videoId: videoId,
        workspaceId: workspaceId,
        createdAt: new Date(),
        revokedAt: null,
      })
      .returning();

    return shareLink;
  }

  /**
   * Get share link by video ID
   * 
   * Validates: Requirements 2.5
   * 
   * @param videoId - The video ID to look up
   * @returns The share link record or null if not found
   */
  static async getShareLinkByVideoId(
    videoId: string
  ): Promise<ShareLink | null> {
    const shareLink = await db.query.shareLinks.findFirst({
      where: and(
        eq(shareLinks.videoId, videoId),
        isNull(shareLinks.revokedAt)
      ),
    });

    return shareLink || null;
  }

  /**
   * Revoke share link (soft delete)
   * 
   * Validates: Requirements 4.2, 19.5
   * 
   * @param videoId - The video ID whose share link to revoke
   * @param workspaceId - The workspace ID that owns the video
   */
  static async revokeShareLink(
    videoId: string,
    workspaceId: string
  ): Promise<void> {
    await db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(shareLinks.videoId, videoId),
          eq(shareLinks.workspaceId, workspaceId),
          isNull(shareLinks.revokedAt)
        )
      );
  }

  /**
   * Regenerate share link (revoke old, create new)
   * 
   * Validates: Requirements 4.4, 4.5
   * 
   * @param videoId - The video ID to regenerate share link for
   * @param workspaceId - The workspace ID that owns the video
   * @returns The new share link record
   */
  static async regenerateShareLink(
    videoId: string,
    workspaceId: string
  ): Promise<ShareLink> {
    // Revoke existing share link
    await this.revokeShareLink(videoId, workspaceId);

    // Create new share link
    return await this.createShareLink(videoId, workspaceId);
  }

  /**
   * Get public share data by token (sanitized, no workspace info)
   * 
   * Validates: Requirements 5.4, 10.6, 11.1, 11.2
   * 
   * @param token - The share token to look up
   * @returns Public share data or null if not found/revoked
   */
  static async getPublicShareData(
    token: string
  ): Promise<PublicShareData | null> {
    // Validate token format first (fail fast)
    if (!this.isValidToken(token)) {
      return null;
    }

    // Query database for share link
    const shareLink = await db.query.shareLinks.findFirst({
      where: and(
        eq(shareLinks.token, token),
        isNull(shareLinks.revokedAt)
      ),
      with: {
        video: {
          with: {
            viralClips: {
              where: eq(viralClip.status, "ready"),
            },
          },
        },
      },
    });

    if (!shareLink || !shareLink.video) {
      return null;
    }

    // Sort clips by virality score (descending)
    const sortedClips = [...shareLink.video.viralClips].sort(
      (a, b) => b.score - a.score
    );

    // Sanitize data - remove all workspace/user information
    const videoMetadata = shareLink.video.metadata as Record<string, any> | null;
    const videoThumbnailUrl = videoMetadata?.thumbnail || "";

    const publicData: PublicShareData = {
      videoTitle: shareLink.video.title || "",
      clipCount: sortedClips.length,
      thumbnailUrl: sortedClips[0]?.thumbnailUrl || "",
      videoThumbnailUrl,
      clips: sortedClips.map((clip) => ({
        id: clip.id,
        title: clip.title,
        duration: clip.duration,
        viralityScore: clip.score,
        viralityReason: clip.viralityReason || "",
        hooks: clip.hooks || [],
        recommendedPlatforms: clip.recommendedPlatforms || [],
        transcript: clip.transcript || "",
        thumbnailUrl: clip.thumbnailUrl || "",
        storageUrl: clip.storageUrl || "",
        aspectRatio: clip.aspectRatio,
      })),
    };

    return publicData;
  }

  /**
   * Validate share token format (UUID v4)
   * 
   * Validates: Requirements 10.1, 10.5
   * 
   * @param token - The token to validate
   * @returns True if token matches UUID v4 format
   */
  static isValidToken(token: string): boolean {
    // UUID v4 format: 8-4-4-4-12 hexadecimal with version 4 indicator
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Regex.test(token);
  }
}
