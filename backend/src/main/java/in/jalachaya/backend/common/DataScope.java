package in.jalachaya.backend.common;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Server-owned scope. Request parameters and browser role labels cannot change it. */
@Component
public class DataScope {
    private final JdbcTemplate jdbc;
    public DataScope(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public boolean demo(long userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT is_demo FROM app_users WHERE id = ?", Boolean.class, userId));
    }
    public boolean authenticated() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof Jwt;
    }
    public boolean currentDemo() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return authenticated() && demo(Long.parseLong(((Jwt) auth.getPrincipal()).getSubject()));
    }
    public String problems(String alias, boolean demo) {
        return (alias.isEmpty() ? "" : alias + ".") + "pond_id IN (SELECT id FROM ponds WHERE is_demo = " + (demo ? "TRUE" : "FALSE") + ")";
    }
    public void requirePond(long pondId, boolean demo) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM ponds WHERE id = ? AND is_demo = ?", Integer.class, pondId, demo) != 1)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pond not found.");
    }
    public void requireProblem(long problemId, boolean demo) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM problems WHERE id = ? AND " + problems("", demo), Integer.class, problemId) != 1)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Complaint not found.");
    }
}
