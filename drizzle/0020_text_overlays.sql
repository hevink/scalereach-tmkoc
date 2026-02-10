-- Text overlays persistence for clip editor
CREATE TABLE IF NOT EXISTS "clip_text_overlay" (
  "id" text PRIMARY KEY NOT NULL,
  "clip_id" text NOT NULL UNIQUE REFERENCES "viral_clip"("id") ON DELETE CASCADE,
  "overlays" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_clipTextOverlay_clipId" ON "clip_text_overlay" ("clip_id");
