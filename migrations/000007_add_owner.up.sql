ALTER TABLE reports
ADD COLUMN author_email text default 'UNKNOWN_EMAIL';
CREATE INDEX author_email_index ON reports (author_email);