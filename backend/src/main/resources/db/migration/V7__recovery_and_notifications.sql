ALTER TABLE app_users ADD COLUMN auth_version INT NOT NULL DEFAULT 0;

CREATE TABLE password_reset_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES app_users(id)
);
CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id);

ALTER TABLE problem_history ADD COLUMN notifications_scanned BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE problem_history SET notifications_scanned = TRUE;
CREATE INDEX idx_history_notifications ON problem_history(notifications_scanned, id);

CREATE TABLE user_notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    history_id BIGINT NOT NULL,
    message VARCHAR(500) NOT NULL,
    problem_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    read_at TIMESTAMP(6),
    CONSTRAINT uq_user_notification_history UNIQUE (user_id, history_id),
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES app_users(id),
    CONSTRAINT fk_notification_history FOREIGN KEY (history_id) REFERENCES problem_history(id),
    CONSTRAINT fk_notification_problem FOREIGN KEY (problem_id) REFERENCES problems(id)
);
CREATE INDEX idx_user_notifications ON user_notifications(user_id, read_at, id);
