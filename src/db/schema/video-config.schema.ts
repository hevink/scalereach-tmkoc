import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { video } from "./project.schema";

/**
 * Video Configuration Table
 * Stores user configuration for video processing (AI clipping, templates, etc.)
 */
export const videoConfig = pgTable(
  "video_config",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => video.id, { onDelete: "cascade" }),

    // Clipping Mode
    skipClipping: boolean("skip_clipping").default(false),
    clipModel: text("clip_model").default("ClipBasic"), // ClipBasic, ClipPro
    genre: text("genre").default("Auto"), // Auto, Podcast, Gaming, Education, Entertainment

    // Duration Settings (in seconds)
    clipDurationMin: integer("clip_duration_min").default(0),
    clipDurationMax: integer("clip_duration_max").default(180),

    // Timeframe (processing range in seconds)
    timeframeStart: integer("timeframe_start").default(0),
    timeframeEnd: integer("timeframe_end"), // null = full video

    // Language Settings
    language: text("language"), // null = auto-detect, or ISO code like 'en', 'es', 'hi', etc.

    // AI Settings
    enableAutoHook: boolean("enable_auto_hook").default(true),
    clipType: text("clip_type").default("viral-clips"),
    customPrompt: text("custom_prompt"),
    topicKeywords: text("topic_keywords").array(),

    // Template Settings
    captionTemplateId: text("caption_template_id").default("karaoke"),
    aspectRatio: text("aspect_ratio").default("9:16"), // 9:16, 16:9, 1:1
    enableWatermark: boolean("enable_watermark").default(true),

    // Editing Options
    enableCaptions: boolean("enable_captions").default(true),
    enableEmojis: boolean("enable_emojis").default(false),
    enableIntroTitle: boolean("enable_intro_title").default(false),

    // Split-Screen Options
    enableSplitScreen: boolean("enable_split_screen").default(false),
    splitScreenBgVideoId: text("split_screen_bg_video_id"),
    splitScreenBgCategoryId: text("split_screen_bg_category_id"),
    splitRatio: integer("split_ratio").default(50),

    // Background Style (for vertical non-split-screen clips)
    backgroundStyle: text("background_style").default("blur"), // blur, black, white

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    videoIdIdx: index("idx_video_config_video_id").on(table.videoId),
  })
);

// Relations
export const videoConfigRelations = relations(videoConfig, ({ one }) => ({
  video: one(video, {
    fields: [videoConfig.videoId],
    references: [video.id],
  }),
}));

// TypeScript types
export type VideoConfig = typeof videoConfig.$inferSelect;
export type NewVideoConfig = typeof videoConfig.$inferInsert;
