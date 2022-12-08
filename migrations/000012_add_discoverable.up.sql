ALTER TABLE reports
ADD COLUMN discoverable boolean default false;
CREATE INDEX discoverable_index ON reports (discoverable);
