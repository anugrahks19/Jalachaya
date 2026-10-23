ALTER TABLE problem_history ADD COLUMN system_event BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE deadline_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL,
    problem_id BIGINT NOT NULL,
    history_id BIGINT NOT NULL,
    level INT NOT NULL,
    destination VARCHAR(100) NOT NULL,
    message VARCHAR(500) NOT NULL,
    deadline_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT uq_deadline_task_level UNIQUE(task_id, level),
    CONSTRAINT fk_deadline_task FOREIGN KEY(task_id) REFERENCES tasks(id),
    CONSTRAINT fk_deadline_problem FOREIGN KEY(problem_id) REFERENCES problems(id),
    CONSTRAINT fk_deadline_history FOREIGN KEY(history_id) REFERENCES problem_history(id)
);
CREATE TABLE authority_contacts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    kind VARCHAR(30) NOT NULL,
    email VARCHAR(254) NOT NULL,
    CONSTRAINT uq_authority_scope UNIQUE(is_demo, kind)
);
CREATE TABLE authority_deliveries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT NOT NULL,
    recipient VARCHAR(254),
    status VARCHAR(30) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP(6) NOT NULL,
    last_error VARCHAR(300),
    sent_at TIMESTAMP(6),
    CONSTRAINT uq_delivery_event UNIQUE(event_id),
    CONSTRAINT fk_delivery_event FOREIGN KEY(event_id) REFERENCES deadline_events(id)
);
CREATE INDEX idx_authority_delivery_due ON authority_deliveries(status, next_attempt_at);
