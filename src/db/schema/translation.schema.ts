import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspace.schema";
import { video, viralClip, CaptionStyleConfig } from "./project.schema";

/**
 * Translated word with timing information
 */
export interface TranslatedWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Video Translation table - stores translation records per video per language
 */
export const videoTranslation = pgTable(
  "video_translation",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => video.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sourceLanguage: text("source_language").notNull(),
    targetLanguage: text("target_language").notNull(),
    translatedTranscript: text("translated_transcript"),
    translatedWords: jsonb("translated_words").$type<TranslatedWord[]>(),
    status: text("status").default("pending").notNull(), // 'pending' | 'translating' | 'completed' | 'failed'
    error: text("error"),
    provider: text("provider"), // 'deepl' | 'google' | 'groq'
    characterCount: integer("character_count"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    videoIdIdx: index("idx_videoTranslation_videoId").on(table.videoId),
    workspaceIdIdx: index("idx_videoTranslation_workspaceId").on(table.workspaceId),
    videoIdTargetLangIdx: unique("uq_videoTranslation_videoId_targetLang").on(
      table.videoId,
      table.targetLanguage
    ),
  })
);

/**
 * Translated Clip Caption table - stores translated captions per clip per language
 */
export const translatedClipCaption = pgTable(
  "translated_clip_caption",
  {
    id: text("id").primaryKey(),
    clipId: text("clip_id")
      .notNull()
      .references(() => viralClip.id, { onDelete: "cascade" }),
    translationId: text("translation_id")
      .notNull()
      .references(() => videoTranslation.id, { onDelete: "cascade" }),
    targetLanguage: text("target_language").notNull(),
    words: jsonb("words").$type<TranslatedWord[]>().notNull(),
    styleConfig: jsonb("style_config").$type<CaptionStyleConfig>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    clipIdIdx: index("idx_translatedClipCaption_clipId").on(table.clipId),
    translationIdIdx: index("idx_translatedClipCaption_translationId").on(table.translationId),
    clipIdTargetLangIdx: unique("uq_translatedClipCaption_clipId_targetLang").on(
      table.clipId,
      table.targetLanguage
    ),
  })
);

// Relations
export const videoTranslationRelations = relations(videoTranslation, ({ one, many }) => ({
  video: one(video, {
    fields: [videoTranslation.videoId],
    references: [video.id],
  }),
  workspace: one(workspace, {
    fields: [videoTranslation.workspaceId],
    references: [workspace.id],
  }),
  translatedCaptions: many(translatedClipCaption),
}));

export const translatedClipCaptionRelations = relations(translatedClipCaption, ({ one }) => ({
  clip: one(viralClip, {
    fields: [translatedClipCaption.clipId],
    references: [viralClip.id],
  }),
  translation: one(videoTranslation, {
    fields: [translatedClipCaption.translationId],
    references: [videoTranslation.id],
  }),
}));
