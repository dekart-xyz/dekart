ALTER TABLE query_jobs
ADD COLUMN IF NOT EXISTS dw_job_location text DEFAULT NULL;
