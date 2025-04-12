-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id TEXT NOT NULL,  -- Using TEXT for UUID
  map_config TEXT,
  title TEXT,
  archived BOOLEAN DEFAULT 0,  -- SQLite uses 0/1 for BOOLEAN
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- SQLite uses DATETIME instead of timestamptz
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  author_email TEXT DEFAULT 'UNKNOWN_EMAIL',
  discoverable BOOLEAN DEFAULT 0,
  allow_edit BOOLEAN DEFAULT 0,
  PRIMARY KEY(id)
);

CREATE INDEX IF NOT EXISTS author_email_index ON reports (author_email);
CREATE INDEX IF NOT EXISTS discoverable_index ON reports (discoverable);

-- Create queries table
CREATE TABLE IF NOT EXISTS queries (
  report_id TEXT,  -- Using TEXT for UUID
  id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  job_status INTEGER DEFAULT 0,
  job_result_id TEXT,
  job_error TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  job_started DATETIME,
  total_rows INTEGER DEFAULT 0,
  bytes_processed INTEGER DEFAULT 0,  -- Changed to INTEGER since SQLite doesn't differentiate types as strictly
  result_size INTEGER DEFAULT 0,
  query_source INTEGER DEFAULT 1,
  query_source_id VARCHAR(40) DEFAULT '',
  dw_job_id VARCHAR(255),
  PRIMARY KEY(id),
  FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE -- Adjusted for SQLite
);

-- Create files table
CREATE TABLE IF NOT EXISTS files (
  id TEXT NOT NULL,  -- Using TEXT for UUID
  file_source_id TEXT,
  name VARCHAR DEFAULT '',
  size INTEGER DEFAULT 0,
  mime_type VARCHAR DEFAULT '',
  file_status INTEGER DEFAULT 1,
  upload_error TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id)
);

CREATE INDEX IF NOT EXISTS files_file_source_id_idx ON files (file_source_id);

-- Create datasets table
CREATE TABLE IF NOT EXISTS datasets (
  report_id TEXT NOT NULL,  -- Using TEXT for UUID
  id TEXT NOT NULL,
  query_id TEXT,
  file_id TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR DEFAULT '',
  connection_id TEXT,
  PRIMARY KEY(id),
  FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
  FOREIGN KEY(query_id) REFERENCES queries(id) ON DELETE CASCADE,
  FOREIGN KEY(connection_id) REFERENCES connections(id) ON DELETE CASCADE
);

-- Create connections table
CREATE TABLE IF NOT EXISTS connections (
  id TEXT NOT NULL,  -- Using TEXT for UUID
  connection_name TEXT NOT NULL,
  author_email TEXT DEFAULT 'UNKNOWN_EMAIL',
  bigquery_project_id TEXT DEFAULT NULL,
  cloud_storage_bucket TEXT DEFAULT NULL,
  archived BOOLEAN DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_default BOOLEAN DEFAULT 0,
  connection_type INTEGER DEFAULT 1,
  snowflake_account_id TEXT DEFAULT NULL,
  snowflake_username TEXT DEFAULT NULL,
  snowflake_password_encrypted TEXT DEFAULT NULL,
  snowflake_warehouse TEXT DEFAULT NULL,
  PRIMARY KEY(id)
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    email VARCHAR(255) PRIMARY KEY,
    sensitive_scope TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
