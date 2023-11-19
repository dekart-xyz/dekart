create table IF NOT EXISTS subscriptions (
    id uuid not null,
    owner_email varchar(255) not null,
    customer_id varchar(255) default null,
    archived boolean not null default false,
    updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    UNIQUE (owner_email)
);
