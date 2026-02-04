-- Add language column to video_config table for multi-language transcription support
ALTER TABLE "video_config" ADD COLUMN "language" text;

-- Comment: null or 'auto' = auto-detect, otherwise ISO language code like 'en', 'es', 'hi', etc.
