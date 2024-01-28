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
