ALTER TABLE datasets
ADD COLUMN file_id uuid,
ADD CONSTRAINT fk_file FOREIGN KEY(file_id) REFERENCES files;
