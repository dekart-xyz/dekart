ALTER TABLE connections
ADD COLUMN postgres_host text default NULL,
ADD COLUMN postgres_username text default NULL,
ADD COLUMN postgres_password_encrypted text default NULL,
ADD COLUMN postgres_database text default NULL,
ADD COLUMN postgres_port integer default NULL;
