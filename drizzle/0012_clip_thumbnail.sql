-- Add thumbnail fields to viral_clip table
ALTER TABLE "viral_clip" ADD COLUMN "thumbnail_key" text;
ALTER TABLE "viral_clip" ADD COLUMN "thumbnail_url" text;
