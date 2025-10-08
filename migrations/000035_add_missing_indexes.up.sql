-- Add missing indexes for improved query performance

-- Index on reports.archived (used in WHERE clauses for filtering)
CREATE INDEX IF NOT EXISTS idx_reports_archived ON reports (archived);

-- Index on reports.workspace_id (used in WHERE clauses for filtering reports by workspace)
CREATE INDEX IF NOT EXISTS idx_reports_workspace_id ON reports (workspace_id);

-- Index on connections.archived (used in WHERE clauses for filtering)
CREATE INDEX IF NOT EXISTS idx_connections_archived ON connections (archived);

-- Index on connections.workspace_id (used in WHERE clauses for filtering connections by workspace)
CREATE INDEX IF NOT EXISTS idx_connections_workspace_id ON connections (workspace_id);

-- Index on datasets.report_id (frequently used in JOINs and WHERE clauses)
CREATE INDEX IF NOT EXISTS idx_datasets_report_id ON datasets (report_id);

-- Index on datasets.connection_id (used in JOINs and WHERE clauses)
CREATE INDEX IF NOT EXISTS idx_datasets_connection_id ON datasets (connection_id);

-- Index on queries.report_id (used in JOINs and WHERE clauses)
CREATE INDEX IF NOT EXISTS idx_queries_report_id ON queries (report_id);

-- Index on report_access_log.report_id (used in subqueries for access control)
CREATE INDEX IF NOT EXISTS idx_report_access_log_report_id ON report_access_log (report_id);

-- Composite index on report_access_log for access control queries
CREATE INDEX IF NOT EXISTS idx_report_access_log_report_email ON report_access_log (report_id, email, created_at DESC);

-- Index on workspace_log.workspace_id (used in many WHERE clauses)
CREATE INDEX IF NOT EXISTS idx_workspace_log_workspace_id ON workspace_log (workspace_id);

-- Index on workspace_log.email (used in WHERE clauses for user lookups)
CREATE INDEX IF NOT EXISTS idx_workspace_log_email ON workspace_log (email);

-- Composite index on workspace_log for user workspace queries
CREATE INDEX IF NOT EXISTS idx_workspace_log_email_status ON workspace_log (email, status, created_at DESC);

-- Index on report_analytics.report_id (for analytics queries)
CREATE INDEX IF NOT EXISTS idx_report_analytics_report_id ON report_analytics (report_id);

-- Index on confirmation_log.workspace_log_id (used in JOINs)
CREATE INDEX IF NOT EXISTS idx_confirmation_log_workspace_log_id ON confirmation_log (workspace_log_id);

-- Index on subscription_log.workspace_id (used for workspace subscription queries)
CREATE INDEX IF NOT EXISTS idx_subscription_log_workspace_id ON subscription_log (workspace_id);

