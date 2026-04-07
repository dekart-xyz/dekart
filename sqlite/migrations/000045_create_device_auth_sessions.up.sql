CREATE TABLE IF NOT EXISTS device_auth_log (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    device_name TEXT,
    status TEXT NOT NULL,
    email TEXT,
    workspace_id TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_auth_log_device_id_created_at ON device_auth_log (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_auth_log_expires_at ON device_auth_log (expires_at);
