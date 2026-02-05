-- Add raw storage fields to viral_clip table
-- These store the clip WITHOUT captions for editing purposes

ALTER TABLE "viral_clip" ADD COLUMN "raw_storage_key" text;
ALTER TABLE "viral_clip" ADD COLUMN "raw_storage_url" text;
