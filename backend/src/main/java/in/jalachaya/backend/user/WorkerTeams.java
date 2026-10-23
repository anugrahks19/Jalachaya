package in.jalachaya.backend.user;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Grants are held in MySQL, never inferred from a browser-selected team. */
@Component
public class WorkerTeams {
    private final UserRepository users;
    private final JdbcTemplate jdbc;
    public WorkerTeams(UserRepository users, JdbcTemplate jdbc) { this.users = users; this.jdbc = jdbc; }
    public boolean allowed(User login, User worker) {
        if (login.getRole() != Role.FIELD_WORKER || worker.getRole() != Role.FIELD_WORKER
                || !login.isActive() || !worker.isActive() || login.isDemo() != worker.isDemo()) return false;
        return login.getId().equals(worker.getId()) || jdbc.queryForObject(
                "SELECT COUNT(*) FROM worker_team_access WHERE login_user_id = ? AND worker_user_id = ?",
                Integer.class, login.getId(), worker.getId()) > 0;
    }
    public User select(User login, String requested) {
        if (requested == null || requested.isBlank()) return login;
        if (login.getRole() != Role.FIELD_WORKER || !requested.matches("Team [1-5]"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid field worker team.");
        if (requested.equals(login.getTeam())) return login;
        return users.findByRoleAndActiveTrueOrderByName(Role.FIELD_WORKER).stream()
                .filter(worker -> requested.equals(worker.getTeam()) && allowed(login, worker)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "This login does not have access to the selected team."));
    }
}
