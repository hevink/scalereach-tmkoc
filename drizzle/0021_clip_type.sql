ALTER TABLE "video_config" ADD COLUMN "clip_type" text DEFAULT 'viral-clips';
ALTER TABLE "viral_clip" ADD COLUMN "clip_type" text;
