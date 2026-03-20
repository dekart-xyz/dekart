-- Add auto refresh interval column to reports table

ALTER TABLE reports
ADD COLUMN IF NOT EXISTS auto_refresh_interval_seconds int DEFAULT 0;

