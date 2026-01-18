import { relations } from "drizzle-orm";
import {
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

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status")
      .notNull()
      .$type<"draft" | "processing" | "completed" | "failed">()
      .default("draft"),
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
    projectId: text("project_id").references(() => project.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceType: text("source_type")
      .notNull()
      .$type<"youtube" | "upload">(),
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    storageUrl: text("storage_url"),
    title: text("title"),
    duration: integer("duration"),
    fileSize: integer("file_size"),
    mimeType: text("mime_type"),
    metadata: jsonb("metadata").$type<{
      youtubeId?: string;
      thumbnail?: string;
      channelName?: string;
      resolution?: string;
    }>(),
    // Transcript fields
    transcript: text("transcript"),
    transcriptWords: jsonb("transcript_words").$type<{
      word: string;
      start: number;
      end: number;
      confidence: number;
    }[]>(),
    status: text("status")
      .notNull()
      .$type<"pending" | "downloading" | "uploading" | "transcribing" | "analyzing" | "completed" | "failed">()
      .default("pending"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    projectIdIdx: index("idx_video_projectId").on(table.projectId),
    userIdIdx: index("idx_video_userId").on(table.userId),
    statusIdx: index("idx_video_status").on(table.status),
    sourceTypeIdx: index("idx_video_sourceType").on(table.sourceType),
  })
);

export const viralClip = pgTable(
  "viral_clip",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => video.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startTime: real("start_time").notNull(),
    endTime: real("end_time").notNull(),
    duration: real("duration").notNull(),
    transcript: text("transcript").notNull(),
    viralityScore: real("virality_score").notNull(),
    viralityReason: text("virality_reason").notNull(),
    hooks: jsonb("hooks").$type<string[]>(),
    emotions: jsonb("emotions").$type<string[]>(),
    status: text("status")
      .notNull()
      .$type<"pending" | "processing" | "completed" | "failed">()
      .default("pending"),
    clipStorageKey: text("clip_storage_key"),
    clipStorageUrl: text("clip_storage_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    videoIdIdx: index("idx_viralClip_videoId").on(table.videoId),
    viralityScoreIdx: index("idx_viralClip_viralityScore").on(table.viralityScore),
    statusIdx: index("idx_viralClip_status").on(table.status),
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

export const viralClipRelations = relations(viralClip, ({ one }) => ({
  video: one(video, {
    fields: [viralClip.videoId],
    references: [video.id],
  }),
}));
