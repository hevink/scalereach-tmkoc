-- Add editing options columns to video_config table
ALTER TABLE "video_config" ADD COLUMN "enable_captions" boolean DEFAULT true;
ALTER TABLE "video_config" ADD COLUMN "enable_emojis" boolean DEFAULT true;
ALTER TABLE "video_config" ADD COLUMN "enable_intro_title" boolean DEFAULT true;
