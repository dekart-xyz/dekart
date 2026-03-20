-- Create map_previews table

CREATE TABLE IF NOT EXISTS map_previews (
  id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  map_preview_data_uri text NOT NULL,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_report FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE,
  CONSTRAINT uq_map_previews_report UNIQUE (report_id)
);

CREATE INDEX idx_map_previews_report_id ON map_previews(report_id);
