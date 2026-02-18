-- Migration: Social Scheduler
-- Creates social_account and scheduled_post tables

CREATE TABLE IF NOT EXISTS "social_account" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "platform_account_id" text NOT NULL,
  "account_name" text NOT NULL,
  "account_handle" text,
  "avatar_url" text,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "token_expires_at" timestamp,
  "scopes" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "scheduled_post" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "clip_id" text NOT NULL REFERENCES "viral_clip"("id") ON DELETE CASCADE,
  "social_account_id" text NOT NULL REFERENCES "social_account"("id") ON DELETE CASCADE,
  "platform" text NOT NULL,
  "post_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "caption" text,
  "hashtags" jsonb DEFAULT '[]',
  "scheduled_at" timestamp,
  "drip_group_id" text,
  "drip_order" integer,
  "platform_post_id" text,
  "platform_post_url" text,
  "error_message" text,
  "retry_count" integer NOT NULL DEFAULT 0,
  "posted_at" timestamp,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_social_account_workspace_id" ON "social_account" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_social_account_platform" ON "social_account" ("platform");
CREATE INDEX IF NOT EXISTS "idx_social_account_workspace_platform" ON "social_account" ("workspace_id", "platform");

CREATE INDEX IF NOT EXISTS "idx_scheduled_post_workspace_id" ON "scheduled_post" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_scheduled_post_clip_id" ON "scheduled_post" ("clip_id");
CREATE INDEX IF NOT EXISTS "idx_scheduled_post_status" ON "scheduled_post" ("status");
CREATE INDEX IF NOT EXISTS "idx_scheduled_post_drip_group" ON "scheduled_post" ("drip_group_id");
CREATE INDEX IF NOT EXISTS "idx_scheduled_post_scheduled_at" ON "scheduled_post" ("scheduled_at");
