-- Add trial support: explicit trial end timestamp and index for lookups

ALTER TABLE subscription_log
ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Helpful for fetching effective trial end per workspace
CREATE INDEX IF NOT EXISTS idx_subscription_log_trial_ends
  ON subscription_log (workspace_id, plan_type, trial_ends_at);


