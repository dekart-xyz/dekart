ALTER TABLE reports
ADD COLUMN track_viewers BOOLEAN DEFAULT FALSE;

-- Set track_viewers to TRUE for all existing public reports for backward compatibility
UPDATE reports
SET track_viewers = TRUE
WHERE is_public = TRUE;



