CREATE TABLE "video_config" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"skip_clipping" boolean DEFAULT false,
	"clip_model" text DEFAULT 'ClipBasic',
	"genre" text DEFAULT 'Auto',
	"clip_duration_min" integer DEFAULT 0,
	"clip_duration_max" integer DEFAULT 180,
	"timeframe_start" integer DEFAULT 0,
	"timeframe_end" integer,
	"language" text,
	"enable_auto_hook" boolean DEFAULT true,
	"custom_prompt" text,
	"topic_keywords" text[],
	"caption_template_id" text DEFAULT 'karaoke',
	"aspect_ratio" text DEFAULT '9:16',
	"enable_watermark" boolean DEFAULT true,
	"enable_captions" boolean DEFAULT true,
	"enable_emojis" boolean DEFAULT true,
	"enable_intro_title" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_caption" (
	"id" text PRIMARY KEY NOT NULL,
	"clip_id" text NOT NULL,
	"words" jsonb NOT NULL,
	"style_config" jsonb,
	"template_id" text,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clip_caption_clip_id_unique" UNIQUE("clip_id")
);
--> statement-breakpoint
CREATE TABLE "minute_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"video_id" text,
	"type" text NOT NULL,
	"minutes_amount" integer NOT NULL,
	"minutes_before" integer NOT NULL,
	"minutes_after" integer NOT NULL,
	"description" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_minutes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"minutes_total" integer DEFAULT 0 NOT NULL,
	"minutes_used" integer DEFAULT 0 NOT NULL,
	"minutes_remaining" integer DEFAULT 0 NOT NULL,
	"minutes_reset_date" timestamp,
	"editing_operations_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_minutes_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "translated_clip_caption" (
	"id" text PRIMARY KEY NOT NULL,
	"clip_id" text NOT NULL,
	"translation_id" text NOT NULL,
	"target_language" text NOT NULL,
	"words" jsonb NOT NULL,
	"style_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_translatedClipCaption_clipId_targetLang" UNIQUE("clip_id","target_language")
);
--> statement-breakpoint
CREATE TABLE "video_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text NOT NULL,
	"workspace_id" text NOT NULL,
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
	CONSTRAINT "uq_videoTranslation_videoId_targetLang" UNIQUE("video_id","target_language")
);
--> statement-breakpoint
CREATE TABLE "dubbed_clip_audio" (
	"id" text PRIMARY KEY NOT NULL,
	"clip_id" text NOT NULL,
	"dubbing_id" text NOT NULL,
	"target_language" text NOT NULL,
	"audio_key" text,
	"audio_url" text,
	"duration_seconds" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_dubbedClipAudio_clipId_dubbingId" UNIQUE("clip_id","dubbing_id")
);
--> statement-breakpoint
CREATE TABLE "voice_dubbing" (
	"id" text PRIMARY KEY NOT NULL,
	"translation_id" text NOT NULL,
	"video_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"target_language" text NOT NULL,
	"tts_provider" text DEFAULT 'elevenlabs' NOT NULL,
	"voice_id" text NOT NULL,
	"voice_name" text,
	"voice_settings" jsonb,
	"audio_mode" text DEFAULT 'duck' NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_voiceDubbing_translationId" UNIQUE("translation_id")
);
--> statement-breakpoint
CREATE TABLE "share_analytics" (
	"id" text PRIMARY KEY NOT NULL,
	"share_link_id" text NOT NULL,
	"event_type" text NOT NULL,
	"viewer_hash" text NOT NULL,
	"clip_id" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"video_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "credit_package" DROP CONSTRAINT "credit_package_polar_product_id_unique";--> statement-breakpoint
DROP INDEX "idx_user_id";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "primary_platforms" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "billing_cycle" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "subscription_renewal_date" timestamp;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "subscription_cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "default_caption_style" jsonb;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "regeneration_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "minutes_consumed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "intro_title" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "transcript_with_emojis" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "recommended_platforms" jsonb;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "raw_storage_key" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "raw_storage_url" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "thumbnail_key" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "credit_package" ADD COLUMN "dodo_product_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_package" ADD COLUMN "is_subscription" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_package" ADD COLUMN "billing_period" text;--> statement-breakpoint
ALTER TABLE "video_config" ADD CONSTRAINT "video_config_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_caption" ADD CONSTRAINT "clip_caption_clip_id_viral_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."viral_clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_transaction" ADD CONSTRAINT "minute_transaction_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_transaction" ADD CONSTRAINT "minute_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minute_transaction" ADD CONSTRAINT "minute_transaction_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_minutes" ADD CONSTRAINT "workspace_minutes_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translated_clip_caption" ADD CONSTRAINT "translated_clip_caption_clip_id_viral_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."viral_clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translated_clip_caption" ADD CONSTRAINT "translated_clip_caption_translation_id_video_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."video_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_translation" ADD CONSTRAINT "video_translation_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_translation" ADD CONSTRAINT "video_translation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dubbed_clip_audio" ADD CONSTRAINT "dubbed_clip_audio_clip_id_viral_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."viral_clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dubbed_clip_audio" ADD CONSTRAINT "dubbed_clip_audio_dubbing_id_voice_dubbing_id_fk" FOREIGN KEY ("dubbing_id") REFERENCES "public"."voice_dubbing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_dubbing" ADD CONSTRAINT "voice_dubbing_translation_id_video_translation_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."video_translation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_dubbing" ADD CONSTRAINT "voice_dubbing_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_dubbing" ADD CONSTRAINT "voice_dubbing_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_analytics" ADD CONSTRAINT "share_analytics_share_link_id_share_links_id_fk" FOREIGN KEY ("share_link_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_analytics" ADD CONSTRAINT "share_analytics_clip_id_viral_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."viral_clip"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_video_config_video_id" ON "video_config" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "idx_clipCaption_clipId" ON "clip_caption" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "idx_minute_transaction_workspace_id" ON "minute_transaction" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_minute_transaction_user_id" ON "minute_transaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_minute_transaction_video_id" ON "minute_transaction" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "idx_minute_transaction_type" ON "minute_transaction" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_minute_transaction_created_at" ON "minute_transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_workspace_minutes_workspace_id" ON "workspace_minutes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_translatedClipCaption_clipId" ON "translated_clip_caption" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "idx_translatedClipCaption_translationId" ON "translated_clip_caption" USING btree ("translation_id");--> statement-breakpoint
CREATE INDEX "idx_videoTranslation_videoId" ON "video_translation" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "idx_videoTranslation_workspaceId" ON "video_translation" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_dubbedClipAudio_clipId" ON "dubbed_clip_audio" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "idx_dubbedClipAudio_dubbingId" ON "dubbed_clip_audio" USING btree ("dubbing_id");--> statement-breakpoint
CREATE INDEX "idx_voiceDubbing_videoId" ON "voice_dubbing" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "idx_voiceDubbing_workspaceId" ON "voice_dubbing" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_shareAnalytics_shareLinkId" ON "share_analytics" USING btree ("share_link_id");--> statement-breakpoint
CREATE INDEX "idx_shareAnalytics_eventType" ON "share_analytics" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_shareAnalytics_timestamp" ON "share_analytics" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_shareAnalytics_shareLinkId_timestamp" ON "share_analytics" USING btree ("share_link_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_shareLinks_token" ON "share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_shareLinks_videoId" ON "share_links" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "idx_shareLinks_workspaceId" ON "share_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_shareLinks_revokedAt" ON "share_links" USING btree ("revoked_at");--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_user_username" ON "user" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_video_workspaceId" ON "video" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_video_createdAt" ON "video" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_video_userId_createdAt" ON "video" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_viralClip_videoId_status" ON "viral_clip" USING btree ("video_id","status");--> statement-breakpoint
CREATE INDEX "idx_viralClip_videoId_score" ON "viral_clip" USING btree ("video_id","score");--> statement-breakpoint
CREATE INDEX "idx_invitation_expiresAt" ON "workspace_invitation" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_invitation_email_status_expiresAt" ON "workspace_invitation" USING btree ("email","status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_credit_package_isActive" ON "credit_package" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "credit_package" DROP COLUMN "polar_product_id";--> statement-breakpoint
ALTER TABLE "credit_package" ADD CONSTRAINT "credit_package_dodo_product_id_unique" UNIQUE("dodo_product_id");