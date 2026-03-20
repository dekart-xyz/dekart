-- Update map_previews table: remove map_preview_data_uri, add resource_id

ALTER TABLE map_previews
DROP COLUMN map_preview_data_uri;

ALTER TABLE map_previews
ADD COLUMN resource_id uuid DEFAULT NULL;
