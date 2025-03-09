-- Update column types to bigint
ALTER TABLE query_jobs
    ALTER COLUMN job_status SET DATA TYPE bigint,
    ALTER COLUMN total_rows SET DATA TYPE bigint,
    ALTER COLUMN result_size SET DATA TYPE bigint;