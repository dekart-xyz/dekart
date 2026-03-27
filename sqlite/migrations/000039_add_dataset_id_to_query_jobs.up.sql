ALTER TABLE query_jobs
ADD COLUMN dataset_id uuid;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_query_jobs_dataset_id ON query_jobs(dataset_id);

-- Backfill dataset_id from the relationship: query_jobs -> queries <- datasets
-- If multiple datasets reference the same query_id, we pick one (ordered by created_at)
UPDATE query_jobs
SET dataset_id = (
  SELECT datasets.id
  FROM datasets
  WHERE datasets.query_id = query_jobs.query_id
  ORDER BY datasets.created_at ASC
  LIMIT 1
)
WHERE query_jobs.dataset_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM datasets
    WHERE datasets.query_id = query_jobs.query_id
  );

