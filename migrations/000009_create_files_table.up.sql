CREATE TABLE IF NOT EXISTS files (
  id uuid NOT NULL,
  file_source_id uuid,
  name varchar DEFAULT '',
  size bigint DEFAULT 0,
  mime_type varchar DEFAULT '',
  file_status int DEFAULT 1,
  upload_error text DEFAULT '',
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id)
);

CREATE INDEX IF NOT EXISTS files_file_source_id_idx ON files (file_source_id);
