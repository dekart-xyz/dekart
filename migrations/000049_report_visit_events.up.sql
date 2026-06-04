CREATE TABLE IF NOT EXISTS report_visit_events (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid NOT NULL,
    email varchar(255) NOT NULL,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_visit_events_report_created_at
    ON report_visit_events (report_id, created_at);

CREATE INDEX IF NOT EXISTS idx_report_visit_events_email_created_at
    ON report_visit_events (email, created_at);
