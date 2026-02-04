-- Add recommended_platforms field to viral_clip table
ALTER TABLE "viral_clip" ADD COLUMN "recommended_platforms" jsonb;

-- Add intro_title and transcript_with_emojis fields if they don't exist
ALTER TABLE "viral_clip" ADD COLUMN IF NOT EXISTS "intro_title" text;
ALTER TABLE "viral_clip" ADD COLUMN IF NOT EXISTS "transcript_with_emojis" text;
