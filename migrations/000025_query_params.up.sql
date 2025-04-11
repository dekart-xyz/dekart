CREATE TABLE IF NOT EXISTS query_jobs (
    id              uuid        NOT NULL,
    query_id        uuid        NOT NULL,
    job_status      bigint         DEFAULT 0,
    job_result_id   uuid,
    job_error       text,
    total_rows      bigint       DEFAULT 0,
    bytes_processed bigint    DEFAULT 0,
    result_size     bigint       DEFAULT 0,
    query_params_hash     char(32)    NOT NULL,
    dw_job_id       VARCHAR(255) NULL DEFAULT NULL,
    updated_at      timestamptz DEFAULT CURRENT_TIMESTAMP,
    created_at      timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    CONSTRAINT fk_query FOREIGN KEY(query_id) REFERENCES queries
);

CREATE INDEX idx_query_jobs_query_id ON query_jobs(query_id);
CREATE INDEX idx_query_jobs_job_status ON query_jobs(job_status);
CREATE INDEX idx_query_jobs_params_hash ON query_jobs(query_params_hash);

-- migrate from queries to query_jobs
INSERT INTO query_jobs (
    id,
    query_id,
    job_status,
    job_result_id,
    job_error,
    total_rows,
    bytes_processed,
    result_size,
    query_params_hash,
    dw_job_id,
    updated_at,
    created_at
)
SELECT
    id, -- use query id as job id
    id,
    job_status,
    job_result_id,
    job_error,
    total_rows,
    bytes_processed,
    result_size,
    'd41d8cd98f00b204e9800998ecf8427e',
    dw_job_id,
    updated_at,
    created_at
FROM queries
WHERE job_result_id IS NOT NULL;

-- add query_params column in reports table
ALTER TABLE reports
ADD COLUMN query_params text DEFAULT '' NOT NULL;