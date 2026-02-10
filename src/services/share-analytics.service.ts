/**
 * Share Analytics Service
 * Handles analytics tracking for shared clips (views and downloads)
 * 
 * Validates: Requirements 12.1, 12.2, 12.3, 12.6, 12.7
 */

import { db } from "../db";
import { shareLinks, shareAnalytics } from "../db/schema/share.schema";
import { viralClip } from "../db/schema/project.schema";
import { eq, and, gte } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";

/**
 * Analytics summary for a share link
 */
export interface ShareAnalytics {
  totalViews: number;
  uniqueViewers: number;
  totalDownloads: number;
  downloadsByClip: ClipDownloadStats[];
  viewTrend: ViewTrendData[];
}

/**
 * Download statistics per clip
 */
export interface ClipDownloadStats {
  clipId: string;
  clipTitle?: string;
  downloads: number;
}

/**
 * View trend data by date
 */
export interface ViewTrendData {
  date: string;
  views: number;
  uniqueViewers: number;
}

/**
 * Analytics event record
 */
export interface ShareAnalyticsEvent {
  id: string;
  shareLinkId: string;
  eventType: "view" | "download";
  viewerHash: string;
  clipId: string | null;
  timestamp: Date;
}

export class ShareAnalyticsService {
  /**
   * Record a view event for a share link
   * 
   * Validates: Requirements 12.1, 12.3, 12.6
   * 
   * @param token - The share token that was accessed
   * @param ipAddress - The viewer's IP address (will be hashed)
   * @param userAgent - The viewer's user agent (will be hashed)
   */
  static async recordView(
    token: string,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    // Find the share link by token
    const shareLink = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.token, token),
    });

    if (!shareLink) {
      return; // Silently fail if share link not found
    }

    // Hash IP and user agent for privacy
    const viewerHash = this.hashIdentifier(ipAddress, userAgent);

    // Insert analytics event
    await db.insert(shareAnalytics).values({
      id: randomUUID(),
      shareLinkId: shareLink.id,
      eventType: "view",
      viewerHash,
      clipId: null, // Views don't have a specific clip
      timestamp: new Date(),
    });

    // TODO: Increment Redis counter for real-time stats
    // await redis.incr(`share:${shareLink.id}:views`);
  }

  /**
   * Record a download event for a specific clip
   * 
   * Validates: Requirements 12.2, 12.3, 12.6
   * 
   * @param token - The share token being used
   * @param clipId - The clip ID being downloaded
   * @param ipAddress - The viewer's IP address (will be hashed)
   * @param userAgent - The viewer's user agent (will be hashed)
   */
  static async recordDownload(
    token: string,
    clipId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    // Find the share link by token
    const shareLink = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.token, token),
    });

    if (!shareLink) {
      return; // Silently fail if share link not found
    }

    // Hash IP and user agent for privacy
    const viewerHash = this.hashIdentifier(ipAddress, userAgent);

    // Insert analytics event
    await db.insert(shareAnalytics).values({
      id: randomUUID(),
      shareLinkId: shareLink.id,
      eventType: "download",
      viewerHash,
      clipId,
      timestamp: new Date(),
    });

    // TODO: Increment Redis counter for real-time stats
    // await redis.incr(`share:${shareLink.id}:downloads`);
  }

  /**
   * Get analytics summary for a share link
   * 
   * Validates: Requirements 12.4, 12.5, 12.7
   * 
   * @param shareLinkId - The share link ID to get analytics for
   * @param days - Number of days to include in the report (default 30)
   * @returns Analytics summary with views, downloads, and trends
   */
  static async getAnalytics(
    shareLinkId: string,
    days: number = 30
  ): Promise<ShareAnalytics> {
    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Query all analytics events for the share link within the date range
    const events = await db.query.shareAnalytics.findMany({
      where: and(
        eq(shareAnalytics.shareLinkId, shareLinkId),
        gte(shareAnalytics.timestamp, startDate)
      ),
      with: {
        clip: true, // Include clip data for download stats
      },
    });

    // Calculate total views
    const viewEvents = events.filter((e) => e.eventType === "view");
    const totalViews = viewEvents.length;

    // Calculate unique viewers (distinct hashed identifiers)
    const uniqueViewers = new Set(viewEvents.map((e) => e.viewerHash)).size;

    // Calculate total downloads
    const downloadEvents = events.filter((e) => e.eventType === "download");
    const totalDownloads = downloadEvents.length;

    // Group views by date for trend analysis
    const viewsByDate = new Map<
      string,
      { views: number; viewers: Set<string> }
    >();

    viewEvents.forEach((event) => {
      const date = event.timestamp.toISOString().split("T")[0]; // YYYY-MM-DD format
      if (!viewsByDate.has(date)) {
        viewsByDate.set(date, { views: 0, viewers: new Set() });
      }
      const dayData = viewsByDate.get(date)!;
      dayData.views++;
      dayData.viewers.add(event.viewerHash);
    });

    // Convert view trend map to array
    const viewTrend: ViewTrendData[] = Array.from(
      viewsByDate.entries()
    ).map(([date, data]) => ({
      date,
      views: data.views,
      uniqueViewers: data.viewers.size,
    }));

    // Sort view trend by date (ascending)
    viewTrend.sort((a, b) => a.date.localeCompare(b.date));

    // Group downloads by clip
    const downloadsByClipMap = new Map<
      string,
      { clipId: string; clipTitle?: string; downloads: number }
    >();

    downloadEvents.forEach((event) => {
      if (!event.clipId) return; // Skip if no clip ID

      if (!downloadsByClipMap.has(event.clipId)) {
        downloadsByClipMap.set(event.clipId, {
          clipId: event.clipId,
          clipTitle: event.clip?.title ?? undefined,
          downloads: 0,
        });
      }
      const clipData = downloadsByClipMap.get(event.clipId)!;
      clipData.downloads++;
    });

    // Convert downloads map to array
    const downloadsByClip: ClipDownloadStats[] = Array.from(
      downloadsByClipMap.values()
    );

    // Sort downloads by count (descending)
    downloadsByClip.sort((a, b) => b.downloads - a.downloads);

    return {
      totalViews,
      uniqueViewers,
      totalDownloads,
      downloadsByClip,
      viewTrend,
    };
  }

  /**
   * Hash IP address and user agent for privacy protection
   * Uses SHA-256 to create a deterministic hash for unique viewer tracking
   * 
   * Validates: Requirements 12.3, 12.6
   * 
   * @param ipAddress - The viewer's IP address
   * @param userAgent - The viewer's user agent string
   * @returns SHA-256 hash of the combined identifier
   */
  private static hashIdentifier(ipAddress: string, userAgent: string): string {
    const hash = createHash("sha256");
    hash.update(`${ipAddress}:${userAgent}`);
    return hash.digest("hex");
  }
}
