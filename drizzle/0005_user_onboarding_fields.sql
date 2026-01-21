-- Add onboarding fields to user table
ALTER TABLE "user" ADD COLUMN "role" text;
ALTER TABLE "user" ADD COLUMN "primary_platforms" jsonb DEFAULT '[]'::jsonb;
