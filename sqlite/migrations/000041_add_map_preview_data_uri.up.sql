-- Create map_previews table

CREATE TABLE IF NOT EXISTS map_previews (
  id TEXT NOT NULL PRIMARY KEY DEFAULT (
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6)))
  ),
  report_id TEXT NOT NULL,
  map_preview_data_uri TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT uq_map_previews_report UNIQUE (report_id)
);

CREATE INDEX IF NOT EXISTS idx_map_previews_report_id ON map_previews(report_id);
