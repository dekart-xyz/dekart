ALTER TABLE reports
ADD COLUMN track_viewers BOOLEAN DEFAULT 0;

-- Set track_viewers to TRUE for all existing public reports for backward compatibility
UPDATE reports
SET track_viewers = 1
WHERE is_public = 1;



