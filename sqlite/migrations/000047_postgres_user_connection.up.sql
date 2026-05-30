ALTER TABLE connections
ADD COLUMN postgres_host text default NULL;

ALTER TABLE connections
ADD COLUMN postgres_username text default NULL;

ALTER TABLE connections
ADD COLUMN postgres_password_encrypted text default NULL;

ALTER TABLE connections
ADD COLUMN postgres_database text default NULL;

ALTER TABLE connections
ADD COLUMN postgres_port integer default NULL;
