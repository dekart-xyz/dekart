create table IF NOT EXISTS organizations (
    id uuid primary key,
    name varchar(255) not null,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

create table IF NOT EXISTS organization_log (
    organization_id uuid not null,
    email varchar(255) not null,
    id uuid primary key,
    status int not null default 0, -- 1 added, 2 removed
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    authored_by varchar(255) not null,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

create table IF NOT EXISTS confirmation_log (
    organization_log_id uuid not null,
    accepted boolean not null default false,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    authored_by varchar(255) not null,
    FOREIGN KEY (organization_log_id) REFERENCES organization_log(id)
);


create table IF NOT EXISTS subscription_log (
    customer_id varchar(255) default null,
    payment_cancelled boolean not null default false,
    authored_by varchar(255) not null,
    plan_type int not null default 0,
    organization_id uuid not null,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX idx_subscription_log_created_at ON subscription_log (created_at);
CREATE INDEX idx_organization_log_created_at ON organization_log (created_at);

ALTER TABLE reports
ADD COLUMN organization_id uuid
REFERENCES organizations(id);

ALTER TABLE connections
ADD COLUMN organization_id uuid
REFERENCES organizations(id);
