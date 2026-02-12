import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspace.schema";
import { user } from "./user.schema";

// Brand Kit Config interface
// Validates: Requirements 16.4, 16.5
export interface BrandKitConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
}

// Caption Style Configuration Type
// Validates: Requirements 11.7, 12.8, 15.5
export interface CaptionStyleConfig {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor?: string;
  backgroundOpacity: number;
  position?: "top" | "center" | "bottom"; // Deprecated - use x, y instead
  // X/Y positioning (0-100 percentage of video dimensions)
  x?: number; // Horizontal position (0 = left, 50 = center, 100 = right)
  y?: number; // Vertical position (0 = top, 50 = center, 100 = bottom)
  maxWidth?: number; // Maximum width as percentage (20-100, default 90)
  alignment: "left" | "center" | "right";
  animation: "none" | "word-by-word" | "karaoke" | "bounce" | "fade";
  highlightColor?: string;
  highlightEnabled: boolean;
  shadow: boolean;
  outline: boolean;
  outlineColor?: string;
  // Enhanced options for viral caption rendering
  outlineWidth?: number;        // 1-8, default 3
  highlightScale?: number;      // 100-150, default 120
  textTransform?: "none" | "uppercase";
  wordsPerLine?: number;        // 3-7, default 5
}

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").default("draft").notNull(), // 'draft' | 'active' | 'completed' | 'archived'
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("idx_project_workspaceId").on(table.workspaceId),
    createdByIdx: index("idx_project_createdBy").on(table.createdBy),
    statusIdx: index("idx_project_status").on(table.status),
  })
);

export const video = pgTable(
  "video",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(), // 'upload' | 'youtube' | 'url'
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    storageUrl: text("storage_url"),
    // Audio storage fields for transcription
    audioStorageKey: text("audio_storage_key"),
    audioStorageUrl: text("audio_storage_url"),
    title: text("title"),
    duration: integer("duration"),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    metadata: jsonb("metadata"),
    transcript: text("transcript"),
    transcriptWords: jsonb("transcript_words"),
    // Transcript metadata
    transcriptLanguage: text("transcript_language"),
    transcriptConfidence: real("transcript_confidence"),
    // Usage tracking
    creditsUsed: integer("credits_used").default(0).notNull(),
    regenerationCount: integer("regeneration_count").default(0).notNull(),
    minutesConsumed: integer("minutes_consumed").default(0).notNull(),
    status: text("status").default("pending").notNull(), // 'pending' | 'downloading' | 'uploading' | 'transcribing' | 'analyzing' | 'completed' | 'failed'
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    projectIdIdx: index("idx_video_projectId").on(table.projectId),
    workspaceIdIdx: index("idx_video_workspaceId").on(table.workspaceId),
    userIdIdx: index("idx_video_userId").on(table.userId),
    statusIdx: index("idx_video_status").on(table.status),
    sourceTypeIdx: index("idx_video_sourceType").on(table.sourceType),
    createdAtIdx: index("idx_video_createdAt").on(table.createdAt),
    userIdCreatedAtIdx: index("idx_video_userId_createdAt").on(table.userId, table.createdAt),
  })
);

// Platform recommendation type
export type RecommendedPlatform =
  | "youtube_shorts"
  | "instagram_reels"
  | "tiktok"
  | "linkedin"
  | "twitter"
  | "facebook_reels";

export const viralClip = pgTable(
  "viral_clip",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => video.id, { onDelete: "cascade" }),
    // Clip timing
    startTime: integer("start_time").notNull(),
    endTime: integer("end_time").notNull(),
    duration: integer("duration"), // Calculated from endTime - startTime
    // Clip metadata
    title: text("title"), // Catchy title for the clip
    introTitle: text("intro_title"), // AI-generated intro title to burn in first 3 seconds
    score: integer("score").default(0).notNull(), // Virality score (0-100)
    reason: text("reason"), // Kept for backward compatibility
    viralityReason: text("virality_reason"), // Detailed explanation of viral potential
    hooks: jsonb("hooks").$type<string[]>(), // Array of attention-grabbing elements
    emotions: jsonb("emotions").$type<string[]>(), // Array of emotions the clip evokes
    transcript: text("transcript"),
    transcriptWithEmojis: text("transcript_with_emojis"), // Transcript with AI-generated emojis
    // Platform recommendations - which platforms this clip is best suited for
    recommendedPlatforms: jsonb("recommended_platforms").$type<RecommendedPlatform[]>(),
    // Storage - clip WITH captions (for download/share)
    storageKey: text("storage_key"),
    storageUrl: text("storage_url"),
    // Raw storage - clip WITHOUT captions (for editing)
    rawStorageKey: text("raw_storage_key"),
    rawStorageUrl: text("raw_storage_url"),
    // Thumbnail
    thumbnailKey: text("thumbnail_key"),
    thumbnailUrl: text("thumbnail_url"),
    // Clip settings
    aspectRatio: text("aspect_ratio"), // '9:16' | '1:1' | '16:9'
    favorited: boolean("favorited").default(false).notNull(), // User favorite flag
    // Status: 'detected' | 'generating' | 'ready' | 'exported' | 'failed'
    status: text("status").default("detected").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    videoIdIdx: index("idx_viralClip_videoId").on(table.videoId),
    statusIdx: index("idx_viralClip_status").on(table.status),
    scoreIdx: index("idx_viralClip_score").on(table.score),
    favoritedIdx: index("idx_viralClip_favorited").on(table.favorited),
    videoIdStatusIdx: index("idx_viralClip_videoId_status").on(table.videoId, table.status),
    videoIdScoreIdx: index("idx_viralClip_videoId_score").on(table.videoId, table.score),
  })
);

// Caption Style table - stores caption style configurations per clip
// Validates: Requirements 11.7, 12.8, 15.5
export const captionStyle = pgTable(
  "caption_style",
  {
    id: text("id").primaryKey(),
    clipId: text("clip_id")
      .notNull()
      .references(() => viralClip.id, { onDelete: "cascade" }),
    templateId: text("template_id"), // Reference to built-in template (nullable for custom styles)
    config: jsonb("config").$type<CaptionStyleConfig>().notNull(), // Full style configuration
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    clipIdIdx: index("idx_captionStyle_clipId").on(table.clipId),
  })
);

// Relations
export const projectRelations = relations(project, ({ one, many }) => ({
  workspace: one(workspace, {
    fields: [project.workspaceId],
    references: [workspace.id],
  }),
  createdByUser: one(user, {
    fields: [project.createdBy],
    references: [user.id],
  }),
  videos: many(video),
}));

export const videoRelations = relations(video, ({ one, many }) => ({
  project: one(project, {
    fields: [video.projectId],
    references: [project.id],
  }),
  user: one(user, {
    fields: [video.userId],
    references: [user.id],
  }),
  viralClips: many(viralClip),
}));

export const viralClipRelations = relations(viralClip, ({ one, many }) => ({
  video: one(video, {
    fields: [viralClip.videoId],
    references: [video.id],
  }),
  captionStyle: one(captionStyle, {
    fields: [viralClip.id],
    references: [captionStyle.clipId],
  }),
  exports: many(videoExport),
}));

export const captionStyleRelations = relations(captionStyle, ({ one }) => ({
  clip: one(viralClip, {
    fields: [captionStyle.clipId],
    references: [viralClip.id],
  }),
}));

// Brand Kit table - stores workspace brand assets
// Validates: Requirements 16.4, 16.5
export const brandKit = pgTable(
  "brand_kit",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .unique() // One brand kit per workspace
      .references(() => workspace.id, { onDelete: "cascade" }),
    // Logo
    logoStorageKey: text("logo_storage_key"),
    logoUrl: text("logo_url"),
    // Colors (stored as JSONB for flexibility, max 5 colors)
    colors: jsonb("colors").$type<BrandKitConfig>().notNull(),
    // Typography
    fontFamily: text("font_family").notNull().default("Inter"),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    workspaceIdIdx: index("idx_brandKit_workspaceId").on(table.workspaceId),
  })
);

export const brandKitRelations = relations(brandKit, ({ one }) => ({
  workspace: one(workspace, {
    fields: [brandKit.workspaceId],
    references: [workspace.id],
  }),
}));

// Batch Export table - tracks batch export jobs
// Validates: Requirements 19.3
export const batchExport = pgTable(
  "batch_export",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Progress tracking
    totalClips: integer("total_clips").notNull(),
    completedClips: integer("completed_clips").default(0).notNull(),
    failedClips: integer("failed_clips").default(0).notNull(),
    // Status: 'processing' | 'completed' | 'partial' | 'failed'
    status: text("status").default("processing").notNull(),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_batchExport_userId").on(table.userId),
    statusIdx: index("idx_batchExport_status").on(table.status),
  })
);

// Video Export table - tracks export jobs for clips
// Validates: Requirements 18.7, 18.8
export const videoExport = pgTable(
  "video_export",
  {
    id: text("id").primaryKey(),
    clipId: text("clip_id")
      .notNull()
      .references(() => viralClip.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Batch export reference (nullable - individual exports don't have a batch)
    batchExportId: text("batch_export_id").references(() => batchExport.id, { onDelete: "set null" }),
    // Export settings
    format: text("format").notNull(), // 'mp4' | 'mov'
    resolution: text("resolution").notNull(), // '720p' | '1080p' | '4k'
    // Storage
    storageKey: text("storage_key"),
    storageUrl: text("storage_url"),
    downloadUrl: text("download_url"),
    expiresAt: timestamp("expires_at"), // Download URL expiration (24 hours)
    fileSize: integer("file_size"),
    // Progress tracking
    status: text("status").default("queued").notNull(), // 'queued' | 'processing' | 'completed' | 'failed'
    progress: integer("progress").default(0).notNull(), // 0-100
    errorMessage: text("error_message"),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    clipIdIdx: index("idx_videoExport_clipId").on(table.clipId),
    userIdIdx: index("idx_videoExport_userId").on(table.userId),
    batchExportIdIdx: index("idx_videoExport_batchExportId").on(table.batchExportId),
    statusIdx: index("idx_videoExport_status").on(table.status),
  })
);

export const batchExportRelations = relations(batchExport, ({ one, many }) => ({
  user: one(user, {
    fields: [batchExport.userId],
    references: [user.id],
  }),
  exports: many(videoExport),
}));

export const videoExportRelations = relations(videoExport, ({ one }) => ({
  clip: one(viralClip, {
    fields: [videoExport.clipId],
    references: [viralClip.id],
  }),
  user: one(user, {
    fields: [videoExport.userId],
    references: [user.id],
  }),
  batchExport: one(batchExport, {
    fields: [videoExport.batchExportId],
    references: [batchExport.id],
  }),
}));
