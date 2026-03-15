-- Affiliate Program Migration
-- Run this against your database to create the affiliate tables

CREATE TABLE IF NOT EXISTS "referral" (
  "id" text PRIMARY KEY NOT NULL,
  "referrer_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "referred_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "referred_workspace_id" text REFERENCES "workspace"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'signed_up',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "converted_at" timestamp,
  CONSTRAINT "referral_referred_user_id_unique" UNIQUE("referred_user_id")
);

CREATE TABLE IF NOT EXISTS "affiliate_commission" (
  "id" text PRIMARY KEY NOT NULL,
  "referral_id" text NOT NULL REFERENCES "referral"("id") ON DELETE CASCADE,
  "referrer_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "payment_amount_cents" integer NOT NULL,
  "commission_amount_cents" integer NOT NULL,
  "commission_rate" integer NOT NULL DEFAULT 25,
  "status" text NOT NULL DEFAULT 'pending',
  "payment_id" text,
  "subscription_id" text,
  "plan_name" text,
  "paid_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for referral table
CREATE INDEX IF NOT EXISTS "idx_referral_referrer" ON "referral" ("referrer_user_id");
CREATE INDEX IF NOT EXISTS "idx_referral_referred" ON "referral" ("referred_user_id");
CREATE INDEX IF NOT EXISTS "idx_referral_status" ON "referral" ("status");

-- Indexes for affiliate_commission table
CREATE INDEX IF NOT EXISTS "idx_commission_referral" ON "affiliate_commission" ("referral_id");
CREATE INDEX IF NOT EXISTS "idx_commission_referrer" ON "affiliate_commission" ("referrer_user_id");
CREATE INDEX IF NOT EXISTS "idx_commission_status" ON "affiliate_commission" ("status");
CREATE INDEX IF NOT EXISTS "idx_commission_payment" ON "affiliate_commission" ("payment_id");
