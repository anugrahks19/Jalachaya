CREATE TABLE ai_jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    operation_key VARCHAR(100) NOT NULL,
    kind VARCHAR(32) NOT NULL,
    problem_id BIGINT NOT NULL,
    task_id BIGINT,
    evidence_id BIGINT,
    status VARCHAR(20) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP(6) NOT NULL,
    model_version VARCHAR(80),
    confidence DECIMAL(5, 4),
    result_json TEXT,
    warnings_json TEXT,
    last_error VARCHAR(200),
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uq_ai_job_operation UNIQUE (operation_key),
    CONSTRAINT fk_ai_jobs_problem FOREIGN KEY (problem_id) REFERENCES problems(id),
    CONSTRAINT fk_ai_jobs_task FOREIGN KEY (task_id) REFERENCES tasks(id),
    CONSTRAINT fk_ai_jobs_evidence FOREIGN KEY (evidence_id) REFERENCES task_evidence(id)
);
CREATE INDEX idx_ai_jobs_due ON ai_jobs(status, next_attempt_at);
CREATE INDEX idx_ai_jobs_problem ON ai_jobs(problem_id);
