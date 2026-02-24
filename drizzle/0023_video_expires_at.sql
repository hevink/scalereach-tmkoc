-- Add expires_at column to video table for plan-based storage expiry
ALTER TABLE "video" ADD COLUMN IF NOT EXISTS "expires_at" timestamp;

-- Index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS "idx_video_expiresAt" ON "video" ("expires_at");

-- Backfill existing videos based on workspace plan
-- Free plan: 14 days from created_at
UPDATE "video" v
SET expires_at = v.created_at + INTERVAL '14 days'
FROM workspace w
WHERE v.workspace_id = w.id
  AND w.plan IS NULL OR w.plan = 'free'
  AND v.expires_at IS NULL;

-- Starter plan: 90 days from created_at
UPDATE "video" v
SET expires_at = v.created_at + INTERVAL '90 days'
FROM workspace w
WHERE v.workspace_id = w.id
  AND w.plan = 'starter'
  AND v.expires_at IS NULL;

-- Pro plan: 180 days from created_at
UPDATE "video" v
SET expires_at = v.created_at + INTERVAL '180 days'
FROM workspace w
WHERE v.workspace_id = w.id
  AND w.plan = 'pro'
  AND v.expires_at IS NULL;
