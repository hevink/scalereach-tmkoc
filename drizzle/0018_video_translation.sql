-- Migration: Video Translation System
-- Adds tables for video translation and translated clip captions

CREATE TABLE IF NOT EXISTS "video_translation" (
  "id" text PRIMARY KEY NOT NULL,
  "video_id" text NOT NULL REFERENCES "video"("id") ON DELETE CASCADE,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "source_language" text NOT NULL,
  "target_language" text NOT NULL,
  "translated_transcript" text,
  "translated_words" jsonb,
  "status" text DEFAULT 'pending' NOT NULL,
  "error" text,
  "provider" text,
  "character_count" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_videoTranslation_videoId_targetLang" UNIQUE("video_id", "target_language")
);

CREATE TABLE IF NOT EXISTS "translated_clip_caption" (
  "id" text PRIMARY KEY NOT NULL,
  "clip_id" text NOT NULL REFERENCES "viral_clip"("id") ON DELETE CASCADE,
  "translation_id" text NOT NULL REFERENCES "video_translation"("id") ON DELETE CASCADE,
  "target_language" text NOT NULL,
  "words" jsonb NOT NULL,
  "style_config" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "uq_translatedClipCaption_clipId_targetLang" UNIQUE("clip_id", "target_language")
);

CREATE INDEX IF NOT EXISTS "idx_videoTranslation_videoId" ON "video_translation" ("video_id");
CREATE INDEX IF NOT EXISTS "idx_videoTranslation_workspaceId" ON "video_translation" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_translatedClipCaption_clipId" ON "translated_clip_caption" ("clip_id");
CREATE INDEX IF NOT EXISTS "idx_translatedClipCaption_translationId" ON "translated_clip_caption" ("translation_id");
