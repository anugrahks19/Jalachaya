package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import in.jalachaya.backend.user.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:teamlogin;MODE=MySQL;DB_CLOSE_DELAY=-1",
    "app.jwt.secret=worker-team-login-test-secret-at-least-32-bytes"})
class WorkerTeamLoginIntegrationTest {
    @Autowired TestRestTemplate rest;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;

    @Test
    void selectedTeamNeedsGrantAndOwnsOnlyItsTasksWithRevocableSessions() {
        User login = user("shared@team.test", "Team 1", Role.FIELD_WORKER, false);
        User team2 = user("lead2@team.test", "Team 2", Role.FIELD_WORKER, false);
        User team3 = user("lead3@team.test", "Team 3", Role.FIELD_WORKER, false);
        User demo = user("demo@team.test", "Team 4", Role.FIELD_WORKER, true);
        User citizen = user("citizen@team.test", null, Role.COMMUNITY_MEMBER, false);
        User officer = user("officer@team.test", null, Role.PANCHAYAT_OFFICER, false);
        assertThat(login(login, "Team 2").getStatusCode().value()).isEqualTo(403);
        jdbc.update("INSERT INTO worker_team_access VALUES (?, ?)", login.getId(), team2.getId());
        jdbc.update("INSERT INTO worker_team_access VALUES (?, ?)", login.getId(), demo.getId());
        assertThat(login(login, "Team 4").getStatusCode().value()).isEqualTo(403);
        assertThat(login(login, "Team 3").getStatusCode().value()).isEqualTo(403);
        assertThat(login(login, "Team 6").getStatusCode().value()).isEqualTo(400);
        assertThat(login(citizen, "Team 1").getStatusCode().value()).isEqualTo(400);
        Map selected = login(login, "Team 2").getBody();
        assertThat(selected).containsEntry("team", "Team 2");
        assertThat(((Number) selected.get("userId")).longValue()).isEqualTo(team2.getId());
        assertThat(((Number) selected.get("loginUserId")).longValue()).isEqualTo(login.getId());
        String token = (String) selected.get("token");
        long ownTask = task(login, citizen, officer, "Own team pond");
        long selectedTask = task(team2, citizen, officer, "Selected team pond");
        var tasks = get("/api/tasks?mine=true", token);
        assertThat(tasks.getStatusCode().value()).isEqualTo(200);
        assertThat(tasks.getBody()).contains("Selected team pond").doesNotContain("Own team pond");
        assertThat(put("/api/tasks/" + ownTask, token).getStatusCode().value()).isEqualTo(403);
        assertThat(put("/api/tasks/" + selectedTask, token).getStatusCode().value()).isEqualTo(200);
        assertThat(get("/api/users/me", token).getBody()).contains("Team 2", "lead2@team.test");
        jdbc.update("DELETE FROM worker_team_access WHERE login_user_id = ? AND worker_user_id = ?", login.getId(), team2.getId());
        assertThat(get("/api/users/me", token).getStatusCode().value()).isEqualTo(401);
        jdbc.update("INSERT INTO worker_team_access VALUES (?, ?)", login.getId(), team2.getId());
        jdbc.update("UPDATE app_users SET auth_version = auth_version + 1 WHERE id = ?", login.getId());
        assertThat(get("/api/users/me", token).getStatusCode().value()).isEqualTo(401);
        var fresh = login(login, "Team 2");assertThat(fresh.getStatusCode().value()).isEqualTo(200);
        assertThat(rest.postForObject("/api/auth/login", Map.of("email",login.getEmail(),"password","TeamPassword123!"),Map.class)).containsEntry("team","Team 1");
    }
    private User user(String email, String team, Role role, boolean demo) {
        var u=new User();u.setEmail(email);u.setName(email);u.setTeam(team);u.setRole(role);u.setDemo(demo);
        u.setPasswordHash(passwords.encode("TeamPassword123!"));return users.saveAndFlush(u);
    }
    private ResponseEntity<Map> login(User u,String team) {
        return rest.postForEntity("/api/auth/login",Map.of("email",u.getEmail(),"password","TeamPassword123!","role",u.getRole().name(),"team",team),Map.class);
    }
    private HttpHeaders headers(String token) {var h=new HttpHeaders();h.setBearerAuth(token);return h;}
    private ResponseEntity<String> get(String path,String token) {return rest.exchange(path,HttpMethod.GET,new HttpEntity<>(headers(token)),String.class);}
    private ResponseEntity<String> put(String path,String token) {return rest.exchange(path,HttpMethod.PUT,new HttpEntity<>(Map.of("status","IN_PROGRESS"),headers(token)),String.class);}
    private long task(User worker,User citizen,User officer,String name) {
        jdbc.update("INSERT INTO ponds (name,ward,latitude,longitude,active,created_at,is_demo) VALUES (?,'Ward 1',10,76,TRUE,CURRENT_TIMESTAMP,FALSE)",name);
        long pond=jdbc.queryForObject("SELECT MAX(id) FROM ponds",Long.class);
        jdbc.update("INSERT INTO problems (pond_id,reporter_id,category,priority,status,description,created_at,updated_at) VALUES (?,?,'PLASTIC_WASTE','MEDIUM','ASSIGNED','Temporary team test',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",pond,citizen.getId());
        long problem=jdbc.queryForObject("SELECT MAX(id) FROM problems",Long.class);
        jdbc.update("INSERT INTO tasks (problem_id,worker_id,assigned_by_id,priority,deadline,active,created_at) VALUES (?,?,?,'MEDIUM',CURRENT_TIMESTAMP,TRUE,CURRENT_TIMESTAMP)",problem,worker.getId(),officer.getId());
        return jdbc.queryForObject("SELECT MAX(id) FROM tasks",Long.class);
    }
}
