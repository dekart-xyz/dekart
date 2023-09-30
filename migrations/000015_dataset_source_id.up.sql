ALTER TABLE datasets ADD COLUMN source_id uuid;
ALTER TABLE datasets ADD CONSTRAINT fk_source FOREIGN KEY(source_id) REFERENCES sources;
