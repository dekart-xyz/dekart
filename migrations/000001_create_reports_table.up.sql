CREATE TABLE IF NOT EXISTS reports (
  id uuid NOT NULL,
  map_config text,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id)
);