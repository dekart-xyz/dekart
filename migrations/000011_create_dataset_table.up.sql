CREATE TABLE IF NOT EXISTS datasets (
  report_id uuid NOT NULL,
  id uuid NOT NULL,
  query_id uuid,
  file_id uuid,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  CONSTRAINT fk_report FOREIGN KEY(report_id) REFERENCES reports,
  CONSTRAINT fk_file FOREIGN KEY(file_id) REFERENCES files,
  CONSTRAINT fk_query FOREIGN KEY(query_id) REFERENCES queries
);
