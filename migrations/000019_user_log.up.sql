CREATE TABLE IF NOT EXISTS users (
    email varchar(255) PRIMARY KEY,
    sensitive_scope TEXT default '', -- requested before sensitive scope
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );