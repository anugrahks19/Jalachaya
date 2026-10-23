CREATE TABLE problems (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    pond_id BIGINT NOT NULL,
    reporter_id BIGINT NOT NULL,
    category VARCHAR(40) NOT NULL,
    priority VARCHAR(16) NOT NULL,
    status VARCHAR(32) NOT NULL,
    description TEXT NOT NULL,
    landmark VARCHAR(255),
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    rejection_reason VARCHAR(300),
    created_at TIMESTAMP(6) NOT NULL,
    updated_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_problems_pond FOREIGN KEY (pond_id) REFERENCES ponds(id),
    CONSTRAINT fk_problems_reporter FOREIGN KEY (reporter_id) REFERENCES app_users(id)
);
CREATE INDEX idx_problems_pond ON problems(pond_id);
CREATE INDEX idx_problems_reporter ON problems(reporter_id);
CREATE INDEX idx_problems_status ON problems(status);

CREATE TABLE problem_images (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    problem_id BIGINT NOT NULL,
    path VARCHAR(500) NOT NULL,
    caption VARCHAR(80) NOT NULL,
    added_by_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_problem_images_problem FOREIGN KEY (problem_id) REFERENCES problems(id),
    CONSTRAINT fk_problem_images_user FOREIGN KEY (added_by_id) REFERENCES app_users(id)
);
CREATE INDEX idx_problem_images_problem ON problem_images(problem_id);

CREATE TABLE problem_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    problem_id BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    note VARCHAR(600) NOT NULL,
    actor_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    CONSTRAINT fk_problem_history_problem FOREIGN KEY (problem_id) REFERENCES problems(id),
    CONSTRAINT fk_problem_history_actor FOREIGN KEY (actor_id) REFERENCES app_users(id)
);
CREATE INDEX idx_problem_history_problem ON problem_history(problem_id);

CREATE TABLE tasks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    problem_id BIGINT NOT NULL,
    worker_id BIGINT NOT NULL,
    assigned_by_id BIGINT NOT NULL,
    priority VARCHAR(16) NOT NULL,
    deadline TIMESTAMP(6) NOT NULL,
    instructions VARCHAR(400),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(6) NOT NULL,
    started_at TIMESTAMP(6),
    CONSTRAINT fk_tasks_problem FOREIGN KEY (problem_id) REFERENCES problems(id),
    CONSTRAINT fk_tasks_worker FOREIGN KEY (worker_id) REFERENCES app_users(id),
    CONSTRAINT fk_tasks_assigner FOREIGN KEY (assigned_by_id) REFERENCES app_users(id)
);
CREATE INDEX idx_tasks_problem ON tasks(problem_id);
CREATE INDEX idx_tasks_worker ON tasks(worker_id);
