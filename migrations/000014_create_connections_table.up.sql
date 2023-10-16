CREATE TABLE IF NOT EXISTS connections (
  id uuid NOT NULL,
  connection_name text NOT NULL,
  author_email text default 'UNKNOWN_EMAIL',
  bigquery_project_id text default NULL,
  cloud_storage_bucket text default NULL,
  archived boolean default false,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id)
);
