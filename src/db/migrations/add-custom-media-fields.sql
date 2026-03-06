-- Migration: Add custom media post support to scheduled_post table
-- Makes clipId nullable and adds media fields for user-uploaded posts

-- Make clipId nullable (was NOT NULL before)
ALTER TABLE scheduled_post ALTER COLUMN clip_id DROP NOT NULL;

-- Add custom media fields
ALTER TABLE scheduled_post ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE scheduled_post ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE scheduled_post ADD COLUMN IF NOT EXISTS media_thumbnail_url TEXT;
ALTER TABLE scheduled_post ADD COLUMN IF NOT EXISTS media_storage_key TEXT;

-- Media library table for persisting uploaded social media files
CREATE TABLE IF NOT EXISTS social_media (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_media_workspace_id ON social_media(workspace_id);
