ALTER TABLE connections ADD COLUMN http_base_url TEXT NOT NULL DEFAULT '';
ALTER TABLE connections ADD COLUMN http_headers_json_encrypted TEXT NOT NULL DEFAULT '';
ALTER TABLE connections ADD COLUMN http_docs_url TEXT NOT NULL DEFAULT '';
ALTER TABLE query_jobs ADD COLUMN http_sources TEXT NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX connections_http_base_url ON connections (workspace_id,rtrim(http_base_url,'/'))
WHERE connection_type=8 AND archived=false;
