CREATE TABLE worker_team_access (
    login_user_id BIGINT NOT NULL,
    worker_user_id BIGINT NOT NULL,
    PRIMARY KEY (login_user_id, worker_user_id),
    CONSTRAINT fk_team_login FOREIGN KEY (login_user_id) REFERENCES app_users(id),
    CONSTRAINT fk_team_worker FOREIGN KEY (worker_user_id) REFERENCES app_users(id)
);
