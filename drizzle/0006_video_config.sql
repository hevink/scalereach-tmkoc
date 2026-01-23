-- Video Configuration Table
-- Stores user configuration for video processing (AI clipping, templates, etc.)

CREATE TABLE IF NOT EXISTS "video_config" (
  "id" TEXT PRIMARY KEY,
  "video_id" TEXT NOT NULL REFERENCES "video"("id") ON DELETE CASCADE,
  
  -- Clipping Mode
  "skip_clipping" BOOLEAN DEFAULT FALSE,
  "clip_model" TEXT DEFAULT 'ClipBasic',
  "genre" TEXT DEFAULT 'Auto',
  
  -- Duration Settings (in seconds)
  "clip_duration_min" INTEGER DEFAULT 0,
  "clip_duration_max" INTEGER DEFAULT 180,
  
  -- Timeframe (processing range in seconds)
  "timeframe_start" INTEGER DEFAULT 0,
  "timeframe_end" INTEGER,
  
  -- AI Settings
  "enable_auto_hook" BOOLEAN DEFAULT TRUE,
  "custom_prompt" TEXT,
  "topic_keywords" TEXT[],
  
  -- Template Settings
  "caption_template_id" TEXT DEFAULT 'karaoke',
  "aspect_ratio" TEXT DEFAULT '9:16',
  "enable_watermark" BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookup by video_id
CREATE INDEX IF NOT EXISTS "idx_video_config_video_id" ON "video_config"("video_id");
