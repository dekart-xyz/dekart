-- Add version_id column to reports table
-- Default to well-known UUID for reports without version history yet
ALTER TABLE reports
ADD COLUMN version_id uuid DEFAULT '00000000-0000-0000-0000-000000000000';

-- Create index for version lookups
CREATE INDEX idx_reports_version_id ON reports(version_id);

-- Report snapshots - stores only user-editable content fields
CREATE TABLE IF NOT EXISTS report_snapshots (
  version_id uuid NOT NULL PRIMARY KEY,
  report_id uuid NOT NULL,

  -- Only user-editable content fields
  map_config text,
  title text,
  query_params text DEFAULT '',
  readme text,

  changed_by text NOT NULL,  -- author_email of user who made change
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_report FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- Dataset snapshots - stores complete dataset state at each report version
-- Multiple snapshots can exist for the same report_version_id and dataset_id
-- to track changes within the same report version
CREATE TABLE IF NOT EXISTS dataset_snapshots (
  snapshot_id uuid NOT NULL PRIMARY KEY,
  report_version_id uuid NOT NULL,  -- References report_snapshots.version_id
  dataset_id uuid NOT NULL,
  report_id uuid NOT NULL,

  -- All dataset columns (mirror of datasets table)
  query_id uuid,
  file_id uuid,
  name varchar DEFAULT '',
  connection_id uuid,

  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_version FOREIGN KEY(report_version_id) REFERENCES report_snapshots(version_id) ON DELETE CASCADE,
  CONSTRAINT fk_report FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- Indexes for fast queries
CREATE INDEX idx_report_snapshots_report ON report_snapshots(report_id, created_at DESC);
CREATE INDEX idx_dataset_snapshots_version ON dataset_snapshots(report_version_id);
CREATE INDEX idx_dataset_snapshots_report ON dataset_snapshots(report_id, created_at DESC);
CREATE INDEX idx_dataset_snapshots_version_dataset ON dataset_snapshots(report_version_id, dataset_id, created_at DESC);

-- Create snapshots for existing reports using report_id as version_id
INSERT INTO report_snapshots (
  version_id, report_id, map_config, title, query_params, readme, changed_by, created_at
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
  snapshot_id, report_version_id, dataset_id, report_id, query_id, file_id, name, connection_id, created_at
)
SELECT
  gen_random_uuid(),
  r.id,
  d.id,
  d.report_id,
  d.query_id,
  d.file_id,
  COALESCE(d.name, ''),
  d.connection_id,
  COALESCE(d.updated_at, d.created_at)
FROM datasets d
JOIN reports r ON d.report_id = r.id
WHERE r.version_id = r.id;
