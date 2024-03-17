ALTER TABLE users
ADD COLUMN is_playground BOOLEAN DEFAULT false;

ALTER TABLE reports
ADD COLUMN is_playground BOOLEAN DEFAULT false;
