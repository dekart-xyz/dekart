CREATE TABLE IF NOT EXISTS queries (
  report_id uuid NOT NULL,
  id uuid NOT NULL,
  query_text text NOT NULL,
  job_status int DEFAULT 0,
  job_result_id uuid,
  job_error text,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  CONSTRAINT fk_report FOREIGN KEY(report_id) REFERENCES reports
);