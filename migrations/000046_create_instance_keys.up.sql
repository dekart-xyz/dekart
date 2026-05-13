CREATE TABLE IF NOT EXISTS instance_keys (
    id TEXT PRIMARY KEY,
    key_name TEXT NOT NULL UNIQUE,
    private_key_pem TEXT NOT NULL,
    public_key_pem TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
