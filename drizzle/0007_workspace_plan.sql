-- Add plan column to workspace table
ALTER TABLE "workspace" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;

-- Upgrade all existing workspaces to pro
UPDATE "workspace" SET "plan" = 'pro';
