-- Remove dataset_id column from query_jobs table
-- Drop the index
DROP INDEX IF EXISTS idx_query_jobs_dataset_id;

-- Drop the column
-- SQLite doesn't support DROP COLUMN directly in older versions, but newer versions do
-- For compatibility, we'll use the standard ALTER TABLE DROP COLUMN syntax
-- If this fails on older SQLite, a more complex migration would be needed
ALTER TABLE query_jobs
DROP COLUMN dataset_id;

