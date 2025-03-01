-- Replacing `uuid` with `TEXT` since SQLite does not support UUID as a native type.
-- Using `LOWER(HEX(RANDOMBLOB(16)))` for UUID generation where needed.
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, -- Adjusted from uuid to TEXT
    name TEXT NOT NULL, -- Adjusted from varchar to TEXT
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Adjusted from timestamptz to DATETIME
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP -- Adjusted from timestamptz to DATETIME
);

CREATE TABLE IF NOT EXISTS workspace_log (
    workspace_id TEXT NOT NULL, -- Adjusted from uuid to TEXT
    email TEXT NOT NULL, -- Adjusted from varchar to TEXT
    id TEXT PRIMARY KEY, -- Adjusted from uuid to TEXT
    status INTEGER NOT NULL DEFAULT 0, -- Adjusted from int to INTEGER (no change in behavior, just SQLite terminology)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Adjusted from timestamptz to DATETIME
    authored_by TEXT NOT NULL, -- Adjusted from varchar to TEXT
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) -- Referential integrity remains unchanged
);

CREATE TABLE IF NOT EXISTS confirmation_log (
    workspace_log_id TEXT NOT NULL, -- Adjusted from uuid to TEXT
    accepted BOOLEAN NOT NULL DEFAULT 0, -- Adjusted from boolean to INTEGER (SQLite uses INTEGER for boolean-like fields)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Adjusted from timestamptz to DATETIME
    authored_by TEXT NOT NULL, -- Adjusted from varchar to TEXT
    FOREIGN KEY (workspace_log_id) REFERENCES workspace_log(id)
);

CREATE TABLE IF NOT EXISTS subscription_log (
    customer_id TEXT DEFAULT NULL, -- Adjusted from varchar to TEXT
    payment_cancelled BOOLEAN NOT NULL DEFAULT 0, -- Adjusted from boolean to INTEGER
    authored_by TEXT NOT NULL, -- Adjusted from varchar to TEXT
    plan_type INTEGER NOT NULL DEFAULT 0, -- Retained as INTEGER
    workspace_id TEXT NOT NULL, -- Adjusted from uuid to TEXT
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Adjusted from timestamptz to DATETIME
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Index creation remains unchanged as SQLite supports CREATE INDEX syntax.
CREATE INDEX idx_subscription_log_created_at ON subscription_log (created_at);
CREATE INDEX idx_workspace_log_created_at ON workspace_log (created_at);

-- Adding columns to existing tables. Note: SQLite requires recreating the table for ALTER TABLE.
ALTER TABLE reports
ADD COLUMN workspace_id TEXT REFERENCES workspaces(id); -- Adjusted from uuid to TEXT

ALTER TABLE connections
ADD COLUMN workspace_id TEXT REFERENCES workspaces(id); -- Adjusted from uuid to TEXT

-- Adding `is_playground` column, adjusted BOOLEAN to INTEGER (default 0).
ALTER TABLE reports
ADD COLUMN is_playground BOOLEAN DEFAULT 0; -- Adjusted to INTEGER for SQLite

-- Updating reports to set `is_playground`.
UPDATE reports
SET is_playground = 1 -- Adjusted BOOLEAN true to INTEGER 1
WHERE author_email = 'UNKNOWN_EMAIL';

-- Adding `is_public` column, adjusted BOOLEAN to INTEGER (default 0).
ALTER TABLE reports
ADD COLUMN is_public BOOLEAN DEFAULT 0; -- Adjusted to INTEGER for SQLite

-- Creating the `users` table.
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY, -- Adjusted from varchar to TEXT
    sensitive_scope TEXT DEFAULT '', -- Adjusted from varchar to TEXT
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, -- Adjusted from timestamptz to DATETIME
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP -- Adjusted from timestamptz to DATETIME
);

-- Adding `role` column to workspace_log. Adjusted INTEGER remains compatible.
ALTER TABLE workspace_log
ADD COLUMN role INTEGER DEFAULT 1; -- Remains as INTEGER

-- Adding `is_default` column to workspaces. Adjusted BOOLEAN to INTEGER (default 0).
ALTER TABLE workspaces
ADD COLUMN is_default BOOLEAN DEFAULT 0; -- Adjusted to INTEGER for SQLite

-- Insert default workspace. UUID replaced with a static string.
INSERT INTO workspaces (id, name, is_default)
VALUES ('00000000-0000-0000-0000-000000000000', 'Default', 1); -- Adjusted BOOLEAN true to INTEGER 1

-- Migrating authors as admins of the default workspace.
-- Using LOWER(HEX(RANDOMBLOB(16))) for UUID generation.
INSERT INTO workspace_log (workspace_id, email, authored_by, status, role, id)
SELECT '00000000-0000-0000-0000-000000000000', author_email, author_email, 1, 1, LOWER(HEX(RANDOMBLOB(16))) -- Adjusted UUID generation
FROM (
    SELECT DISTINCT author_email
    FROM reports
    WHERE author_email IS NOT NULL AND author_email != 'UNKNOWN_EMAIL' AND is_playground = 0
) AS authors;

-- Create premium subscription for the default workspace.
INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
VALUES ('00000000-0000-0000-0000-000000000000', 'system', 5);

-- Migrate authors' reports to the default workspace.
UPDATE reports
SET workspace_id = '00000000-0000-0000-0000-000000000000'
WHERE author_email IS NOT NULL AND author_email != 'UNKNOWN_EMAIL' AND is_playground = 0;

-- Migrate connections to the default workspace.
UPDATE connections
SET workspace_id = '00000000-0000-0000-0000-000000000000'
WHERE workspace_id IS NULL AND author_email IS NOT NULL AND author_email != 'UNKNOWN_EMAIL';
