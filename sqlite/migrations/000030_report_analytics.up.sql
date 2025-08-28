-- report analytics table
CREATE TABLE IF NOT EXISTS report_analytics (
    report_id uuid NOT NULL,
    email varchar(255) NOT NULL,
    num_views BIGINT DEFAULT 1,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES reports(id),
    CONSTRAINT unique_report_id_email UNIQUE (report_id, email)
);