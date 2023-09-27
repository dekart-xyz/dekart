ALTER TABLE queries ADD COLUMN source_id uuid;
ALTER TABLE queries ADD CONSTRAINT fk_source FOREIGN KEY(source_id) REFERENCES sources;
ALTER TABLE files ADD COLUMN source_id uuid;
ALTER TABLE files ADD CONSTRAINT fk_source FOREIGN KEY(source_id) REFERENCES sources;
