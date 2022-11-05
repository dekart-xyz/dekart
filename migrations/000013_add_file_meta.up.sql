ALTER TABLE files
ADD COLUMN name varchar DEFAULT '',
ADD COLUMN size bigint DEFAULT 0,
ADD COLUMN mime_type varchar DEFAULT '',
ADD COLUMN file_status int DEFAULT 1;
