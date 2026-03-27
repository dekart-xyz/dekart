-- Add version_id column to reports table
-- Default to well-known UUID for reports without version history yet
ALTER TABLE reports
ADD COLUMN version_id TEXT DEFAULT '00000000-0000-0000-0000-000000000000';

-- Create index for version lookups
CREATE INDEX IF NOT EXISTS idx_reports_version_id ON reports(version_id);

-- Report snapshots - stores only user-editable content fields
CREATE TABLE IF NOT EXISTS report_snapshots (
  version_id TEXT NOT NULL PRIMARY KEY,
  report_id TEXT NOT NULL,
  trigger_type INT NOT NULL,

  -- Only user-editable content fields
  map_config TEXT,
  title TEXT,
  query_params TEXT DEFAULT '',
  readme TEXT,

  author_email TEXT NOT NULL,  -- author_email of user who made change
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- Dataset snapshots - stores complete dataset state at each report version
-- Exactly one snapshot per (report_version_id, dataset_id)
CREATE TABLE IF NOT EXISTS dataset_snapshots (
  snapshot_id TEXT NOT NULL PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6)))
  ),
  report_version_id TEXT NOT NULL,  -- References report_snapshots.version_id
  dataset_id TEXT NOT NULL,
  report_id TEXT NOT NULL,

  -- All dataset columns (mirror of datasets table)
  query_id TEXT,
  file_id TEXT,
  name VARCHAR DEFAULT '',
  connection_id TEXT,

  author_email TEXT NOT NULL,  -- author_email of user who made change
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(report_version_id) REFERENCES report_snapshots(version_id) ON DELETE CASCADE,
  FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT uq_dataset_snapshots_version_dataset UNIQUE (report_version_id, dataset_id)
);

-- Query snapshots - stores complete query state at each report version
-- Exactly one snapshot per (report_version_id, query_id)
CREATE TABLE IF NOT EXISTS query_snapshots (
  snapshot_id TEXT NOT NULL PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6)))
  ),
  report_version_id TEXT NOT NULL,  -- References report_snapshots.version_id
  query_id TEXT NOT NULL,
  report_id TEXT,
  query_text TEXT NOT NULL,
  author_email TEXT NOT NULL,  -- author_email of user who made change
  query_source_id VARCHAR(40) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(report_version_id) REFERENCES report_snapshots(version_id) ON DELETE CASCADE,
  FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT uq_query_snapshots_version_query UNIQUE (report_version_id, query_id)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_report_snapshots_report ON report_snapshots(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_snapshots_version ON dataset_snapshots(report_version_id);
CREATE INDEX IF NOT EXISTS idx_dataset_snapshots_report ON dataset_snapshots(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_snapshots_version_dataset ON dataset_snapshots(report_version_id, dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_snapshots_version ON query_snapshots(report_version_id);
CREATE INDEX IF NOT EXISTS idx_query_snapshots_report ON query_snapshots(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_snapshots_version_query ON query_snapshots(report_version_id, query_id, created_at DESC);

