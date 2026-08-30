-- Says whether a query runs in a data warehouse or in browser-local DuckDB.
ALTER TABLE queries
ADD COLUMN execution_engine INTEGER NOT NULL DEFAULT 0 CHECK (execution_engine IN (0, 1, 2));

UPDATE queries SET execution_engine = 1;

-- Lists the datasets referenced by the saved DuckDB SQL.
ALTER TABLE queries
ADD COLUMN duckdb_dependency_dataset_ids text NOT NULL DEFAULT '[]';

-- Stores a dependency error so every browser sees the same invalid query state.
ALTER TABLE queries
ADD COLUMN duckdb_validation_error text NOT NULL DEFAULT '';

-- Keeps the execution engine with each saved query snapshot so restore uses the same engine.
ALTER TABLE query_snapshots
ADD COLUMN execution_engine INTEGER NOT NULL DEFAULT 0 CHECK (execution_engine IN (0, 1, 2));

UPDATE query_snapshots SET execution_engine = 1;

-- Records the exact source jobs or files that this DuckDB job must read.
ALTER TABLE query_jobs
ADD COLUMN dependency_revisions text NOT NULL DEFAULT '[]';
