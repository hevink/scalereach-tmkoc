CREATE TABLE "batch_export" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"total_clips" integer NOT NULL,
	"completed_clips" integer DEFAULT 0 NOT NULL,
	"failed_clips" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kit" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"logo_storage_key" text,
	"logo_url" text,
	"colors" jsonb NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brand_kit_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "caption_style" (
	"id" text PRIMARY KEY NOT NULL,
	"clip_id" text NOT NULL,
	"template_id" text,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_export" (
	"id" text PRIMARY KEY NOT NULL,
	"clip_id" text NOT NULL,
	"user_id" text NOT NULL,
	"batch_export_id" text,
	"format" text NOT NULL,
	"resolution" text NOT NULL,
	"storage_key" text,
	"storage_url" text,
	"download_url" text,
	"expires_at" timestamp,
	"file_size" integer,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "viral_clip" ALTER COLUMN "status" SET DEFAULT 'detected';--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "audio_storage_key" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "audio_storage_url" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "transcript_words" jsonb;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "transcript_language" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "transcript_confidence" real;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "credits_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "duration" integer;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "virality_reason" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "hooks" jsonb;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "emotions" jsonb;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "aspect_ratio" text;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "favorited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "viral_clip" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "batch_export" ADD CONSTRAINT "batch_export_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caption_style" ADD CONSTRAINT "caption_style_clip_id_viral_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."viral_clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_export" ADD CONSTRAINT "video_export_clip_id_viral_clip_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."viral_clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_export" ADD CONSTRAINT "video_export_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_export" ADD CONSTRAINT "video_export_batch_export_id_batch_export_id_fk" FOREIGN KEY ("batch_export_id") REFERENCES "public"."batch_export"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_batchExport_userId" ON "batch_export" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_batchExport_status" ON "batch_export" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_brandKit_workspaceId" ON "brand_kit" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_captionStyle_clipId" ON "caption_style" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "idx_videoExport_clipId" ON "video_export" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "idx_videoExport_userId" ON "video_export" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_videoExport_batchExportId" ON "video_export" USING btree ("batch_export_id");--> statement-breakpoint
CREATE INDEX "idx_videoExport_status" ON "video_export" USING btree ("status");--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_video_userId" ON "video" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_viralClip_favorited" ON "viral_clip" USING btree ("favorited");