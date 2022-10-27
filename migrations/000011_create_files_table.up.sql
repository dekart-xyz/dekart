CREATE TABLE IF NOT EXISTS files (
  id uuid NOT NULL,
  file_source_id uuid,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id)
);