package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.LinkedMultiValueMap;
import in.jalachaya.backend.notification.NotificationService;
import in.jalachaya.backend.user.*;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:namedscope;MODE=MySQL;DB_CLOSE_DELAY=-1",
    "app.jwt.secret=named-pond-scope-integration-secret-at-least-32-bytes",
    "app.demo.enabled=true", "app.demo.samples-dir=../assets/samples",
    "app.upload-dir=target/test-uploads-scope"})
class NamedPondsAndScopeIntegrationTest {
    @Autowired TestRestTemplate rest;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired NotificationService notifications;

    @Test
    void namedPondsAndAllPortalsKeepDemoAndRealDataSeparate() {
        var citizen = rest.postForObject("/api/auth/register", Map.of("name", "Real Citizen", "email", "real@scope.test",
                "password", "RealCitizenPassword123!", "ward", "Ward 7"), Map.class);
        assertThat(citizen).containsEntry("demo", false);
        String citizenToken = (String) citizen.get("token");
        String officer = staff("real-officer@scope.test", Role.PANCHAYAT_OFFICER);
        String worker = staff("real-worker@scope.test", Role.FIELD_WORKER);
        String demoOfficer = login("officer@judges.invalid", "JudgeOfficer123!");
        String demoCitizen = login("citizen@judges.invalid", "JudgeCitizen123!");
        long demoProblem = jdbc.queryForObject("SELECT MIN(id) FROM problems", Long.class);
        long demoPond = jdbc.queryForObject("SELECT MIN(id) FROM ponds", Long.class);
        long demoTask = jdbc.queryForObject("SELECT MIN(id) FROM tasks", Long.class);
        long demoWorker = users.findByEmailIgnoreCase("worker@judges.invalid").orElseThrow().getId();
        long realWorker = users.findByEmailIgnoreCase("real-worker@scope.test").orElseThrow().getId();

        // Real users see no seeded ponds, officer totals, workers, or community verification.
        assertThat(get("/api/public/ponds", citizenToken).getBody().toString()).isEqualTo("[]");
        assertThat(get("/api/ponds", officer).getBody().toString()).isEqualTo("[]");
        assertThat(get("/api/community-verifications/pending", citizenToken).getBody().toString()).isEqualTo("[]");
        assertThat(get("/api/dashboard/summary", officer).getBody().toString()).contains("totalPonds=0", "activeProblems=0");
        assertThat(get("/api/users?role=FIELD_WORKER", officer).getBody().toString()).contains("real-worker").doesNotContain("Judges Demo");
        assertThat(get("/api/users?role=FIELD_WORKER", demoOfficer).getBody().toString()).contains("Judges Demo").doesNotContain("real-worker");
        assertThat(get("/api/problems/" + demoProblem, officer).getStatusCode().value()).isEqualTo(404);
        assertThat(get("/api/public/ponds/" + demoPond, citizenToken).getStatusCode().value()).isEqualTo(404);
        assertThat(get("/api/ponds/" + demoPond, officer).getStatusCode().value()).isEqualTo(404);

        var created = report(citizenToken, "Neighbourhood Pond", "Ward 7", "A real report of plastic waste near the pond bank.");
        assertThat(created.getStatusCode().value()).isEqualTo(200);
        Map body = (Map) created.getBody();
        long problem = ((Number) body.get("id")).longValue();
        long pond = ((Number) body.get("pondId")).longValue();
        assertThat(body).containsEntry("pondName", "Neighbourhood Pond").containsEntry("latitude", null).containsEntry("longitude", null);
        assertThat(jdbc.queryForObject("SELECT is_demo FROM ponds WHERE id = ?", Boolean.class, pond)).isFalse();
        assertThat(get("/api/problems/" + problem, demoOfficer).getStatusCode().value()).isEqualTo(404);
        assertThat(get("/api/public/ponds", citizenToken).getBody().toString()).contains("Neighbourhood Pond").doesNotContain("JUDGES DEMO");
        assertThat(rest.getForObject("/api/public/ponds", String.class)).contains("Neighbourhood Pond").doesNotContain("JUDGES DEMO");
        assertThat(get("/api/public/activity", citizenToken).getBody().toString()).doesNotContain("JUDGES DEMO");
        assertThat(get("/api/public/highlights", citizenToken).getBody().toString()).isEqualTo("[]");
        assertThat(get("/api/public/highlights", demoOfficer).getBody().toString()).contains("JUDGES DEMO");
        assertThat(get("/api/dashboard/analytics", officer).getBody().toString()).contains("Neighbourhood Pond").doesNotContain("JUDGES DEMO");

        // Name + locality reuse stays within one scope, including case-insensitive names.
        assertThat(report(citizenToken, "neighbourhood pond", "ward 7", "Another real report concerning this same pond.").getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ponds WHERE is_demo = FALSE", Integer.class)).isEqualTo(1);
        assertThat(report(demoCitizen, "Neighbourhood Pond", "Ward 7", "A separate demo report must never enter the real dataset.").getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ponds WHERE name = 'Neighbourhood Pond'", Integer.class)).isEqualTo(2);
        assertThat(report(citizenToken, "Should Roll Back", "Ward 7", "short").getStatusCode().value()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ponds WHERE name = 'Should Roll Back'", Integer.class)).isZero();

        var assignment = Map.of("problemId", problem, "assignedWorkerId", demoWorker,
                "deadline", Instant.now().plus(2, ChronoUnit.DAYS).toString(), "priority", "MEDIUM", "instructions", "Inspect this pond.");
        assertThat(post("/api/tasks", officer, assignment).getStatusCode().value()).isEqualTo(400);
        assignment = Map.of("problemId", problem, "assignedWorkerId", realWorker,
                "deadline", Instant.now().plus(2, ChronoUnit.DAYS).toString(), "priority", "MEDIUM", "instructions", "Inspect this pond.");
        assertThat(post("/api/tasks", officer, assignment).getStatusCode().value()).isEqualTo(200);
        long task = jdbc.queryForObject("SELECT id FROM tasks WHERE problem_id = ? AND active = TRUE", Long.class, problem);
        assertThat(get("/api/tasks?mine=true", worker).getBody().toString()).contains("Neighbourhood Pond").doesNotContain("JUDGES DEMO");
        assertThat(post("/api/verifications", demoOfficer, Map.of("taskId", task, "decision", "FORWARD", "comment", "Wrong scope")).getStatusCode().value()).isEqualTo(404);
        assertThat(post("/api/escalations", officer, Map.of("taskId", demoTask, "reason", "Wrong scope task")).getStatusCode().value()).isEqualTo(404);
        long pending = jdbc.queryForObject("SELECT t.id FROM tasks t JOIN problems p ON p.id = t.problem_id WHERE p.status = 'COMMUNITY_VERIFICATION'", Long.class);
        var vote = new LinkedMultiValueMap<String,Object>();vote.add("taskId",pending);vote.add("decision","CONFIRM");
        assertThat(postMultipart("/api/community-verifications", citizenToken, vote).getStatusCode().value()).isEqualTo(404);
        notifications.collect();
        assertThat(get("/api/notifications", officer).getBody().toString()).contains("Neighbourhood Pond").doesNotContain("JUDGES DEMO");
        assertThat(get("/api/notifications", demoOfficer).getBody().toString()).doesNotContain("problemId=" + problem + ",");
    }

    private ResponseEntity<Object> report(String token, String name, String ward, String description) {
        var data = new LinkedMultiValueMap<String,Object>();data.add("pondName",name);data.add("pondWard",ward);
        data.add("category","PLASTIC_WASTE");data.add("description",description);
        return postMultipart("/api/problems",token,data);
    }
    private String staff(String email, Role role) {
        var user = new User();user.setName(email);user.setEmail(email);user.setRole(role);
        user.setPasswordHash(passwords.encode("StaffPassword123!"));users.saveAndFlush(user);
        return login(email,"StaffPassword123!");
    }
    private String login(String email, String password) {
        return (String) rest.postForObject("/api/auth/login",Map.of("email",email,"password",password),Map.class).get("token");
    }
    private HttpHeaders headers(String token) { var headers=new HttpHeaders();headers.setBearerAuth(token);return headers; }
    private ResponseEntity<Object> get(String path,String token) { return rest.exchange(path,HttpMethod.GET,new HttpEntity<>(headers(token)),Object.class); }
    private ResponseEntity<Object> post(String path,String token,Object data) { return rest.exchange(path,HttpMethod.POST,new HttpEntity<>(data,headers(token)),Object.class); }
    private ResponseEntity<Object> postMultipart(String path,String token,Object data) {
        var h=headers(token);h.setContentType(MediaType.MULTIPART_FORM_DATA);return rest.exchange(path,HttpMethod.POST,new HttpEntity<>(data,h),Object.class);
    }
}
