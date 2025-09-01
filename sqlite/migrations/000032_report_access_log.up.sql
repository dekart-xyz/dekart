CREATE TABLE IF NOT EXISTS report_access_log (
  report_id uuid NOT NULL,
  email varchar(255) NOT NULL,
  status int NOT NULL DEFAULT 0, -- 1 = granted, 2 = revoked
  access_level int NOT NULL DEFAULT 1, -- 1 = view, 2 = edit
  authored_by varchar(255) NOT NULL, -- who made the change
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES reports(id)
);
