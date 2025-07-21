ALTER TABLE connections ADD COLUMN wherobots_key_encrypted text DEFAULT NULL;
ALTER TABLE connections ADD COLUMN wherobots_host text DEFAULT NULL;
ALTER TABLE connections ADD COLUMN wherobots_region text DEFAULT NULL;
ALTER TABLE connections ADD COLUMN wherobots_runtime text DEFAULT NULL;

ALTER TABLE query_jobs ADD COLUMN query_text text DEFAULT NULL;
ALTER TABLE query_jobs ADD COLUMN result_uri text DEFAULT NULL;