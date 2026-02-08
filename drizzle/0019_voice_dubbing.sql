-- Migration: Voice Dubbing System
-- Adds voice_dubbing and dubbed_clip_audio tables for AI voice dubbing feature

CREATE TABLE "voice_dubbing" (
  "id" text PRIMARY KEY,
  "translation_id" text NOT NULL REFERENCES "video_translation"("id") ON DELETE CASCADE,
  "video_id" text NOT NULL REFERENCES "video"("id") ON DELETE CASCADE,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "target_language" text NOT NULL,
  "tts_provider" text NOT NULL DEFAULT 'elevenlabs',
  "voice_id" text NOT NULL,
  "voice_name" text,
  "voice_settings" jsonb,
  "audio_mode" text NOT NULL DEFAULT 'duck',
  "duck_volume" real DEFAULT 0.15,
  "dubbed_audio_key" text,
  "dubbed_audio_url" text,
  "mixed_audio_key" text,
  "mixed_audio_url" text,
  "total_segments" integer DEFAULT 0,
  "processed_segments" integer DEFAULT 0,
  "duration_seconds" real,
  "tts_characters_used" integer DEFAULT 0,
  "status" text DEFAULT 'pending' NOT NULL,
  "error" text,
  "progress" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "dubbed_clip_audio" (
  "id" text PRIMARY KEY,
  "clip_id" text NOT NULL REFERENCES "viral_clip"("id") ON DELETE CASCADE,
  "dubbing_id" text NOT NULL REFERENCES "voice_dubbing"("id") ON DELETE CASCADE,
  "target_language" text NOT NULL,
  "audio_key" text,
  "audio_url" text,
  "duration_seconds" real,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for voice_dubbing
CREATE INDEX "idx_voiceDubbing_videoId" ON "voice_dubbing" ("video_id");
CREATE INDEX "idx_voiceDubbing_workspaceId" ON "voice_dubbing" ("workspace_id");
CREATE UNIQUE INDEX "uq_voiceDubbing_translationId" ON "voice_dubbing" ("translation_id");

-- Indexes for dubbed_clip_audio
CREATE INDEX "idx_dubbedClipAudio_clipId" ON "dubbed_clip_audio" ("clip_id");
CREATE INDEX "idx_dubbedClipAudio_dubbingId" ON "dubbed_clip_audio" ("dubbing_id");
CREATE UNIQUE INDEX "uq_dubbedClipAudio_clipId_dubbingId" ON "dubbed_clip_audio" ("clip_id", "dubbing_id");
