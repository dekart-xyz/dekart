CREATE TABLE IF NOT EXISTS track_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    event_name TEXT NOT NULL,
    event_data_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_track_events_email ON track_events(email);
CREATE INDEX IF NOT EXISTS idx_track_events_created_at ON track_events(created_at);

