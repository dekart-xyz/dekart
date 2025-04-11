-- for all existing reports, set is_playground to true
-- should be only when author is UNKNOWN_EMAIL
UPDATE reports
SET is_playground = true
WHERE author_email = 'UNKNOWN_EMAIL';

ALTER TABLE workspace_log
ADD COLUMN role int default 1; -- before everyone was admin

-- Add bool is default to workspaces
ALTER TABLE workspaces
ADD COLUMN is_default BOOLEAN DEFAULT FALSE;

-- create default workspace
INSERT INTO workspaces (id, name, is_default)
VALUES ('00000000-0000-0000-0000-000000000000', 'Default', true);

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
