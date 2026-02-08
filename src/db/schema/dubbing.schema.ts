import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { workspace } from "./workspace.schema";
import { video, viralClip } from "./project.schema";
import { videoTranslation } from "./translation.schema";

/**
 * Voice settings for TTS generation
 */
export interface VoiceSettings {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

/**
 * Voice Dubbing table - stores dubbing records per translation
 */
export const voiceDubbing = pgTable(
  "voice_dubbing",
  {
    id: text("id").primaryKey(),
    translationId: text("translation_id")
      .notNull()
      .references(() => videoTranslation.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => video.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    targetLanguage: text("target_language").notNull(),
    ttsProvider: text("tts_provider").notNull().default("elevenlabs"),
    voiceId: text("voice_id").notNull(),
    voiceName: text("voice_name"),
    voiceSettings: jsonb("voice_settings").$type<VoiceSettings>(),
    audioMode: text("audio_mode").notNull().default("duck"), // 'replace' | 'duck'
    duckVolume: real("duck_volume").default(0.15),
    dubbedAudioKey: text("dubbed_audio_key"),
    dubbedAudioUrl: text("dubbed_audio_url"),
    mixedAudioKey: text("mixed_audio_key"),
    mixedAudioUrl: text("mixed_audio_url"),
    totalSegments: integer("total_segments").default(0),
    processedSegments: integer("processed_segments").default(0),
    durationSeconds: real("duration_seconds"),
    ttsCharactersUsed: integer("tts_characters_used").default(0),
    status: text("status").default("pending").notNull(), // 'pending' | 'generating_tts' | 'mixing_audio' | 'completed' | 'failed'
    error: text("error"),
    progress: integer("progress").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    videoIdIdx: index("idx_voiceDubbing_videoId").on(table.videoId),
    workspaceIdIdx: index("idx_voiceDubbing_workspaceId").on(table.workspaceId),
    translationIdIdx: unique("uq_voiceDubbing_translationId").on(table.translationId),
  })
);

/**
 * Dubbed Clip Audio table - stores dubbed audio per clip per dubbing
 */
export const dubbedClipAudio = pgTable(
  "dubbed_clip_audio",
  {
    id: text("id").primaryKey(),
    clipId: text("clip_id")
      .notNull()
      .references(() => viralClip.id, { onDelete: "cascade" }),
    dubbingId: text("dubbing_id")
      .notNull()
      .references(() => voiceDubbing.id, { onDelete: "cascade" }),
    targetLanguage: text("target_language").notNull(),
    audioKey: text("audio_key"),
    audioUrl: text("audio_url"),
    durationSeconds: real("duration_seconds"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    clipIdIdx: index("idx_dubbedClipAudio_clipId").on(table.clipId),
    dubbingIdIdx: index("idx_dubbedClipAudio_dubbingId").on(table.dubbingId),
    clipDubbingIdx: unique("uq_dubbedClipAudio_clipId_dubbingId").on(
      table.clipId,
      table.dubbingId
    ),
  })
);

// Relations
export const voiceDubbingRelations = relations(voiceDubbing, ({ one, many }) => ({
  translation: one(videoTranslation, {
    fields: [voiceDubbing.translationId],
    references: [videoTranslation.id],
  }),
  video: one(video, {
    fields: [voiceDubbing.videoId],
    references: [video.id],
  }),
  workspace: one(workspace, {
    fields: [voiceDubbing.workspaceId],
    references: [workspace.id],
  }),
  clipAudios: many(dubbedClipAudio),
}));

export const dubbedClipAudioRelations = relations(dubbedClipAudio, ({ one }) => ({
  clip: one(viralClip, {
    fields: [dubbedClipAudio.clipId],
    references: [viralClip.id],
  }),
  dubbing: one(voiceDubbing, {
    fields: [dubbedClipAudio.dubbingId],
    references: [voiceDubbing.id],
  }),
}));
