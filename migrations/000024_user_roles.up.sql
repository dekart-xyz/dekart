-- 000017__cloud_001_workspace.up.sql

create table IF NOT EXISTS workspaces (
    id uuid primary key,
    name varchar(255) not null,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

create table IF NOT EXISTS workspace_log (
    workspace_id uuid not null,
    email varchar(255) not null,
    id uuid primary key,
    status int not null default 0, -- 1 added, 2 removed
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    authored_by varchar(255) not null,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

create table IF NOT EXISTS confirmation_log (
    workspace_log_id uuid not null,
    accepted boolean not null default false,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    authored_by varchar(255) not null,
    FOREIGN KEY (workspace_log_id) REFERENCES workspace_log(id)
);


create table IF NOT EXISTS subscription_log (
    customer_id varchar(255) default null,
    payment_cancelled boolean not null default false,
    authored_by varchar(255) not null,
    plan_type int not null default 0,
    workspace_id uuid not null,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX idx_subscription_log_created_at ON subscription_log (created_at);
CREATE INDEX idx_workspace_log_created_at ON workspace_log (created_at);

ALTER TABLE reports
ADD COLUMN workspace_id uuid
REFERENCES workspaces(id);

ALTER TABLE connections
ADD COLUMN workspace_id uuid
REFERENCES workspaces(id);

-- 000020_user_is_playground.up.sql

ALTER TABLE reports
ADD COLUMN is_playground BOOLEAN DEFAULT false;

-- for all existing reports, set is_playground to true
-- should be only when author is UNKNOWN_EMAIL
UPDATE reports
SET is_playground = true
WHERE author_email = 'UNKNOWN_EMAIL';

-- 000022__cloud_public_report.up.sql

ALTER TABLE reports
ADD COLUMN is_public BOOLEAN DEFAULT FALSE;

-- 000024_user_roles.up.sql

CREATE TABLE IF NOT EXISTS users (
    email varchar(255) PRIMARY KEY,
    sensitive_scope TEXT default '', -- requested before sensitive scope
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
    );

ALTER TABLE workspace_log
ADD COLUMN role int default 1; -- before everyone was admin

-- Add bool is default to workspaces
ALTER TABLE workspaces
ADD COLUMN is_default BOOLEAN DEFAULT FALSE;

-- create default workspace
INSERT INTO workspaces (id, name, is_default)
VALUES ('00000000-0000-0000-0000-000000000000', 'Default Workspace', true);

-- migrate authors as admin of new organization
INSERT INTO workspace_log (workspace_id, email, authored_by, status, role, id)
SELECT '00000000-0000-0000-0000-000000000000', author_email, author_email, 1, 1, gen_random_uuid()
FROM (
    SELECT DISTINCT author_email
    FROM reports
    WHERE author_email IS NOT NULL AND author_email != 'UNKNOWN_EMAIL' and is_playground = false
) AS authors;

-- create premium subscription for default workspace
INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
VALUES ('00000000-0000-0000-0000-000000000000', 'system', 5);


-- migrate authors reports to default workspace
UPDATE reports
SET workspace_id = '00000000-0000-0000-0000-000000000000'
WHERE author_email IS NOT NULL AND author_email != 'UNKNOWN_EMAIL' and is_playground = false;

-- migrate connections to default workspace
UPDATE connections
SET workspace_id = '00000000-0000-0000-0000-000000000000'
WHERE workspace_id IS NULL AND author_email IS NOT NULL AND author_email != 'UNKNOWN_EMAIL';
