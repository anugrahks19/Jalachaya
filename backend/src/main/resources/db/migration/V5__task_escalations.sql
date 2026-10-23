CREATE TABLE task_escalations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL,
    level INT NOT NULL,
    escalated_to VARCHAR(80) NOT NULL,
    reason VARCHAR(300) NOT NULL,
    officer_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_task_escalations_task FOREIGN KEY (task_id) REFERENCES tasks(id),
    CONSTRAINT fk_task_escalations_officer FOREIGN KEY (officer_id) REFERENCES app_users(id),
    CONSTRAINT uq_task_escalation_level UNIQUE (task_id, level)
);
CREATE INDEX idx_task_escalations_task ON task_escalations(task_id);
