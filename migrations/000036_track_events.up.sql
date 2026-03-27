CREATE TABLE IF NOT EXISTS track_events (
    id SERIAL PRIMARY KEY,
    email varchar(255) NOT NULL,
    event_name varchar(255) NOT NULL,
    event_data_json TEXT,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_track_events_email ON track_events(email);
CREATE INDEX IF NOT EXISTS idx_track_events_created_at ON track_events(created_at);

