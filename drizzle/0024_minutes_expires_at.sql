-- Add expires_at to workspace_minutes for free plan credit expiry (60 days)
ALTER TABLE "workspace_minutes" ADD COLUMN "expires_at" timestamp;
