import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { video } from "./project.schema";
import { workspace } from "./workspace.schema";
import { viralClip } from "./project.schema";

/**
 * Share Links table - stores shareable links for public clip viewing
 * Validates: Requirements 19.1, 19.2, 19.4, 19.5
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(), // UUID v4 for secure access
    videoId: text("video_id")
      .notNull()
      .references(() => video.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"), // Soft delete - null means active
  },
  (table) => ({
    tokenIdx: uniqueIndex("idx_shareLinks_token").on(table.token),
    videoIdIdx: index("idx_shareLinks_videoId").on(table.videoId),
    workspaceIdIdx: index("idx_shareLinks_workspaceId").on(table.workspaceId),
    revokedAtIdx: index("idx_shareLinks_revokedAt").on(table.revokedAt),
  })
);

/**
 * Share Analytics table - tracks views and downloads for shared links
 * Validates: Requirements 19.3, 19.6
 */
export const shareAnalytics = pgTable(
  "share_analytics",
  {
    id: text("id").primaryKey(),
    shareLinkId: text("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // 'view' | 'download'
    viewerHash: text("viewer_hash").notNull(), // SHA-256 hash of IP + user agent for privacy
    clipId: text("clip_id").references(() => viralClip.id, { onDelete: "set null" }), // Null for view events, populated for downloads
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => ({
    shareLinkIdIdx: index("idx_shareAnalytics_shareLinkId").on(table.shareLinkId),
    eventTypeIdx: index("idx_shareAnalytics_eventType").on(table.eventType),
    timestampIdx: index("idx_shareAnalytics_timestamp").on(table.timestamp),
    shareLinkIdTimestampIdx: index("idx_shareAnalytics_shareLinkId_timestamp").on(
      table.shareLinkId,
      table.timestamp
    ),
  })
);

// Relations
export const shareLinksRelations = relations(shareLinks, ({ one, many }) => ({
  video: one(video, {
    fields: [shareLinks.videoId],
    references: [video.id],
  }),
  workspace: one(workspace, {
    fields: [shareLinks.workspaceId],
    references: [workspace.id],
  }),
  analytics: many(shareAnalytics),
}));

export const shareAnalyticsRelations = relations(shareAnalytics, ({ one }) => ({
  shareLink: one(shareLinks, {
    fields: [shareAnalytics.shareLinkId],
    references: [shareLinks.id],
  }),
  clip: one(viralClip, {
    fields: [shareAnalytics.clipId],
    references: [viralClip.id],
  }),
}));
