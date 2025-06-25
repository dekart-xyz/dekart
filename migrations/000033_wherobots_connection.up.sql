ALTER TABLE connections
ADD COLUMN wherobots_key_encrypted text default NULL,
ADD COLUMN wherobots_host text default NULL,
ADD COLUMN wherobots_region text default NULL,
ADD COLUMN wherobots_runtime text default NULL;

ALTER TABLE query_jobs
ADD COLUMN query_text text DEFAULT NULL;

ALTER TABLE query_jobs
ADD COLUMN result_uri text DEFAULT NULL;