-- Add billing_cycle column to workspace table
ALTER TABLE workspace 
ADD COLUMN IF NOT EXISTS billing_cycle TEXT;

-- Add comment
COMMENT ON COLUMN workspace.billing_cycle IS 'Billing cycle: monthly, annual, or null for free plan';

-- Update existing workspaces based on their subscription status
-- This is a one-time migration, adjust as needed for your data
UPDATE workspace 
SET billing_cycle = 'annual' 
WHERE plan IN ('starter', 'pro') 
AND subscription_status = 'active'
AND billing_cycle IS NULL;
