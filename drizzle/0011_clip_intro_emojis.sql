-- Add intro title and transcript with emojis columns to viral_clip table
ALTER TABLE "viral_clip" ADD COLUMN "intro_title" text;
ALTER TABLE "viral_clip" ADD COLUMN "transcript_with_emojis" text;
