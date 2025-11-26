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

-- Create snapshots for existing reports using report_id as version_id
INSERT INTO report_snapshots (
  version_id, report_id, map_config, title, query_params, readme, author_email, created_at
)
SELECT
  id,
  id,
  map_config,
  COALESCE(title, 'Untitled'),
  COALESCE(query_params, ''),
  readme,
  author_email,
  COALESCE(updated_at, created_at)
FROM reports
WHERE version_id = '00000000-0000-0000-0000-000000000000';

-- Create dataset snapshots for existing datasets
INSERT INTO dataset_snapshots (
  snapshot_id, report_version_id, dataset_id, report_id, query_id, file_id, name, connection_id, author_email, created_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(6))),
  r.id,
  d.id,
  d.report_id,
  d.query_id,
  d.file_id,
  COALESCE(d.name, ''),
  d.connection_id,
  r.author_email,
  COALESCE(d.updated_at, d.created_at)
FROM datasets d
JOIN reports r ON d.report_id = r.id
WHERE r.version_id = r.id;

-- Create query snapshots for existing queries
INSERT INTO query_snapshots (
  snapshot_id,
  report_version_id,
  query_id,
  report_id,
  query_text,
  author_email,
  created_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(2))) || '-' ||
  lower(hex(randomblob(6))),
  r.id,
  q.id,
  q.report_id,
  q.query_text,
  r.author_email,
  COALESCE(q.updated_at, q.created_at)
FROM queries q
JOIN reports r ON q.report_id = r.id
WHERE r.version_id = r.id;
