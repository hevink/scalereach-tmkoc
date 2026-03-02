-- Add text_overlays JSONB column to clip_caption table
ALTER TABLE clip_caption ADD COLUMN IF NOT EXISTS text_overlays jsonb;
