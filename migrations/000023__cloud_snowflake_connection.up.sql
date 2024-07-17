ALTER TABLE connections
ADD COLUMN connection_type INT default 1,
ADD COLUMN snowflake_account_id text default NULL,
ADD COLUMN snowflake_username text default NULL,
ADD COLUMN snowflake_password_encrypted text default NULL,
ADD COLUMN snowflake_warehouse text default NULL;
