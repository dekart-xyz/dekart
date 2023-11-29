create table IF NOT EXISTS subscription_log (
    owner_email varchar(255) not null,
    customer_id varchar(255) default null,
    cancelled boolean not null default false,
    plan_type int not null default 0,
    created_at timestamptz DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subscriptions_owner_email ON subscription_log(owner_email);
CREATE INDEX idx_subscription_log_created_at ON subscription_log (created_at);
