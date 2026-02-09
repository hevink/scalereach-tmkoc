-- Fix billing cycle for existing workspaces
-- This script updates workspaces that have a plan but no billing_cycle set

-- Update starter plan workspaces with 200 minutes (monthly) to have monthly billing cycle
UPDATE workspace 
SET billing_cycle = 'monthly'
WHERE plan = 'starter' 
  AND billing_cycle IS NULL
  AND id IN (
    SELECT workspace_id 
    FROM minutes_balance 
    WHERE minutes_total = 200
  );

-- Update starter plan workspaces with 1800 minutes (annual) to have annual billing cycle
UPDATE workspace 
SET billing_cycle = 'annual'
WHERE plan = 'starter' 
  AND billing_cycle IS NULL
  AND id IN (
    SELECT workspace_id 
    FROM minutes_balance 
    WHERE minutes_total = 1800
  );

-- Update pro plan workspaces with 300 minutes (monthly) to have monthly billing cycle
UPDATE workspace 
SET billing_cycle = 'monthly'
WHERE plan = 'pro' 
  AND billing_cycle IS NULL
  AND id IN (
    SELECT workspace_id 
    FROM minutes_balance 
    WHERE minutes_total = 300
  );

-- Update pro plan workspaces with 3600 minutes (annual) to have annual billing cycle
UPDATE workspace 
SET billing_cycle = 'annual'
WHERE plan = 'pro' 
  AND billing_cycle IS NULL
  AND id IN (
    SELECT workspace_id 
    FROM minutes_balance 
    WHERE minutes_total = 3600
  );

-- Verify the updates
SELECT 
  w.id,
  w.name,
  w.plan,
  w.billing_cycle,
  mb.minutes_total
FROM workspace w
LEFT JOIN minutes_balance mb ON w.id = mb.workspace_id
WHERE w.plan != 'free'
ORDER BY w.plan, w.billing_cycle;
