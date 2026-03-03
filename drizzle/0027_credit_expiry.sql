-- Add expires_at to credit_transaction for 60-day expiry
ALTER TABLE "credit_transaction"
  ADD COLUMN "expires_at" timestamp;

-- Backfill: existing purchase/bonus credits expire 60 days from creation
UPDATE "credit_transaction"
  SET "expires_at" = "created_at" + INTERVAL '60 days'
  WHERE "type" IN ('purchase', 'bonus')
    AND "expires_at" IS NULL;
