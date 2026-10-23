CREATE TABLE task_notes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL,
    text VARCHAR(1000) NOT NULL,
    image_path VARCHAR(500),
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_task_notes_task FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX idx_task_notes_task ON task_notes(task_id);

CREATE TABLE task_evidence (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL,
    before_image_path VARCHAR(500) NOT NULL,
    after_image_path VARCHAR(500) NOT NULL,
    remarks VARCHAR(1000) NOT NULL,
    submitted_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_task_evidence_task FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX idx_task_evidence_task ON task_evidence(task_id);

CREATE TABLE task_reviews (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL,
    officer_id BIGINT NOT NULL,
    decision VARCHAR(16) NOT NULL,
    comment VARCHAR(300),
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_task_reviews_task FOREIGN KEY (task_id) REFERENCES tasks(id),
    CONSTRAINT fk_task_reviews_officer FOREIGN KEY (officer_id) REFERENCES app_users(id)
);
CREATE INDEX idx_task_reviews_task ON task_reviews(task_id);

CREATE TABLE community_verifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    task_id BIGINT NOT NULL,
    problem_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    decision VARCHAR(16) NOT NULL,
    comment VARCHAR(500),
    image_path VARCHAR(500),
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_community_verifications_task FOREIGN KEY (task_id) REFERENCES tasks(id),
    CONSTRAINT fk_community_verifications_problem FOREIGN KEY (problem_id) REFERENCES problems(id),
    CONSTRAINT fk_community_verifications_user FOREIGN KEY (user_id) REFERENCES app_users(id),
    CONSTRAINT uq_community_verification UNIQUE (task_id, user_id)
);
CREATE INDEX idx_community_verifications_problem ON community_verifications(problem_id);
