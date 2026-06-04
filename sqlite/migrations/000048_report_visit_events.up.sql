CREATE TABLE IF NOT EXISTS report_visit_events (
    id TEXT NOT NULL PRIMARY KEY DEFAULT (
        lower(hex(randomblob(4))) || '-' ||
        lower(hex(randomblob(2))) || '-' ||
        lower(hex(randomblob(2))) || '-' ||
        lower(hex(randomblob(2))) || '-' ||
        lower(hex(randomblob(6)))
    ),
    report_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_report_visit_events_report_created_at
    ON report_visit_events (report_id, created_at);

CREATE INDEX IF NOT EXISTS idx_report_visit_events_email_created_at
    ON report_visit_events (email, created_at);
