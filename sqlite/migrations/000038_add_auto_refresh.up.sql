-- Add auto refresh interval column to reports table

ALTER TABLE reports
ADD COLUMN auto_refresh_interval_seconds INTEGER DEFAULT 0;

