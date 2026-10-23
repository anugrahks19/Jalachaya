package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:phase5;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "app.jwt.secret=phase-five-integration-secret-at-least-32-bytes",
        "app.bootstrap.officer-email=phase5-officer@test.invalid",
        "app.bootstrap.officer-password=officer-test-password",
        "app.bootstrap.worker-email=phase5-worker@test.invalid",
        "app.bootstrap.worker-password=worker-test-password",
        "app.upload-dir=target/test-uploads-phase5"})
class OperationsIntegrationTest {
    @Autowired TestRestTemplate rest;
    @Autowired JdbcTemplate jdbc;

    @Test
    void overdueEscalationsAndDashboardReflectStoredData() {
        String officer = login("phase5-officer@test.invalid", "officer-test-password");
        String worker = login("phase5-worker@test.invalid", "worker-test-password");
        String citizen = register();
        long pondId = number(rest.exchange("/api/ponds", HttpMethod.POST,
                json(officer, Map.of("name", "Phase 5 pond", "ward", "Ward 5",
                        "latitude", 10.5, "longitude", 76.2)), Map.class).getBody(), "id");
        long problemId = number(rest.exchange("/api/problems", HttpMethod.POST,
                multipart(citizen, pondId), Map.class).getBody(), "id");

        assertThat(get("/api/dashboard/summary", citizen).getStatusCode().value()).isEqualTo(403);
        assertThat(get("/api/dashboard/analytics", worker).getStatusCode().value()).isEqualTo(403);
        Map summary = get("/api/dashboard/summary", officer).getBody();
        assertThat(summary).containsEntry("totalPonds", 1).containsEntry("activeProblems", 1)
                .containsEntry("newComplaints", 1).containsEntry("overdue", 0);
        Map analytics = get("/api/dashboard/analytics", officer).getBody();
        assertThat((Map) analytics.get("byCategory")).containsEntry("PLASTIC_WASTE", 1)
                .containsEntry("SEWAGE_DISCHARGE", 0);
        assertThat((Map) analytics.get("byStatus")).containsEntry("SUBMITTED", 1)
                .containsEntry("VERIFIED", 0);
        assertThat((List) analytics.get("ponds")).hasSize(1);

        ResponseEntity<Map[]> workers = rest.exchange("/api/users?role=FIELD_WORKER", HttpMethod.GET,
                json(officer, null), Map[].class);
        long workerId = number(workers.getBody()[0], "id");
        Map assigned = rest.exchange("/api/tasks", HttpMethod.POST, json(officer,
                Map.of("problemId", problemId, "assignedWorkerId", workerId,
                        "priority", "HIGH", "deadline", "2030-01-01T00:00:00Z")), Map.class).getBody();
        long taskId = number((Map) assigned.get("task"), "id");
        Map assignedAnalytics = get("/api/dashboard/analytics", officer).getBody();
        assertThat((Map) ((List) assignedAnalytics.get("ponds")).get(0))
                .containsEntry("totalComplaints", 1).containsEntry("activeComplaints", 1)
                .containsEntry("recoveryPercent", 20);
        String path = "/api/escalations";
        assertThat(rest.exchange(path, HttpMethod.POST, json(officer,
                Map.of("taskId", taskId, "reason", "Past deadline")), Map.class)
                .getStatusCode().value()).isEqualTo(409);

        jdbc.update("UPDATE tasks SET deadline = ? WHERE id = ?",
                LocalDateTime.now(ZoneOffset.UTC).minusDays(1), taskId);
        assertThat(get("/api/dashboard/summary", officer).getBody())
                .containsEntry("newComplaints", 0).containsEntry("inProgress", 1).containsEntry("overdue", 1);
        ResponseEntity<Map[]> overdue = rest.exchange("/api/problems?overdue=true", HttpMethod.GET,
                json(officer, null), Map[].class);
        assertThat(overdue.getBody()).hasSize(1);
        assertThat(overdue.getBody()[0]).containsEntry("overdue", true);
        assertThat(rest.exchange(path, HttpMethod.POST, json(worker,
                Map.of("taskId", taskId, "reason", "Past deadline")), Map.class)
                .getStatusCode().value()).isEqualTo(403);
        assertThat(rest.exchange(path, HttpMethod.POST, json(officer,
                Map.of("taskId", taskId, "reason", "bad")), Map.class)
                .getStatusCode().value()).isEqualTo(400);
        assertThat(rest.exchange(path, HttpMethod.POST, json(officer,
                Map.of("taskId", taskId, "reason", "Past deadline")), Map.class)
                .getStatusCode().value()).isEqualTo(200);
        Map latest = null;
        for (int level = 2; level <= 3; level++) {
            latest = rest.exchange(path, HttpMethod.POST, json(officer,
                    Map.of("taskId", taskId, "reason", "Still overdue")), Map.class).getBody();
            assertThat((Map) latest.get("task")).containsEntry("escalationLevel", level);
        }
        assertThat((List) ((Map) latest.get("task")).get("escalations")).hasSize(3);
        assertThat(((Map) ((List) ((Map) latest.get("task")).get("escalations")).get(2)))
                .containsEntry("escalatedTo", "Block Development Officer");
        assertThat(rest.exchange(path, HttpMethod.POST, json(officer,
                Map.of("taskId", taskId, "reason", "Still overdue")), Map.class)
                .getStatusCode().value()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM task_escalations WHERE task_id = ?",
                Integer.class, taskId)).isEqualTo(3);
        ResponseEntity<Map[]> workerTasks = rest.exchange("/api/tasks?mine=true", HttpMethod.GET,
                json(worker, null), Map[].class);
        assertThat(workerTasks.getBody()).hasSize(1);
        assertThat(workerTasks.getBody()[0]).containsEntry("escalationLevel", 3);
        assertThat(get("/api/dashboard/analytics", officer).getBody()).isNotNull();
    }

    private ResponseEntity<Map> get(String path, String token) {
        return rest.exchange(path, HttpMethod.GET, json(token, null), Map.class);
    }

    private String login(String email, String password) {
        return (String) rest.postForEntity("/api/auth/login", Map.of("email", email, "password", password),
                Map.class).getBody().get("token");
    }

    private String register() {
        return (String) rest.postForEntity("/api/auth/register", Map.of("name", "Phase Five Citizen",
                "email", "phase5-citizen@test.invalid", "password", "citizen-test-password",
                "phone", "9876543210", "ward", "Ward 5"), Map.class).getBody().get("token");
    }

    private HttpEntity<?> multipart(String token, long pondId) {
        org.springframework.util.MultiValueMap<String, Object> body = new org.springframework.util.LinkedMultiValueMap<>();
        body.add("pondId", String.valueOf(pondId));
        body.add("category", "PLASTIC_WASTE");
        body.add("description", "Waste has collected at the bank.");
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        return new HttpEntity<>(body, headers);
    }

    private HttpEntity<?> json(String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }

    private long number(Map row, String field) { return ((Number) row.get(field)).longValue(); }
}
