-- Remove dataset_id column from query_jobs table
-- Drop the foreign key constraint
ALTER TABLE query_jobs
DROP CONSTRAINT IF EXISTS fk_dataset;

-- Drop the index
DROP INDEX IF EXISTS idx_query_jobs_dataset_id;

-- Drop the column
ALTER TABLE query_jobs
DROP COLUMN IF EXISTS dataset_id;

