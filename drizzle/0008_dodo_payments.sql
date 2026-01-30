-- Migration: Rename polar_product_id to dodo_product_id and add subscription fields
-- This migration updates the credit_package table for Dodo Payments integration

-- Rename column from polar_product_id to dodo_product_id
ALTER TABLE "credit_package" RENAME COLUMN "polar_product_id" TO "dodo_product_id";

-- Add new columns for subscription support
ALTER TABLE "credit_package" ADD COLUMN IF NOT EXISTS "is_subscription" integer NOT NULL DEFAULT 0;
ALTER TABLE "credit_package" ADD COLUMN IF NOT EXISTS "billing_period" text;
