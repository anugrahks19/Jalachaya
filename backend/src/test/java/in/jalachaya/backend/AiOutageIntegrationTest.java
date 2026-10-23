package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.jalachaya.backend.problem.AiJobService;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:phase6;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "app.jwt.secret=phase-six-integration-secret-at-least-32-bytes",
        "app.bootstrap.officer-email=phase6-officer@test.invalid",
        "app.bootstrap.officer-password=officer-test-password",
        "app.bootstrap.worker-email=phase6-worker@test.invalid",
        "app.bootstrap.worker-password=worker-test-password",
        "app.upload-dir=target/test-uploads-phase6",
        "app.ai.enabled=false"})
class AiOutageIntegrationTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final AtomicBoolean ONLINE = new AtomicBoolean(false);
    private static final AtomicBoolean WRONG_TASK_ID = new AtomicBoolean(false);
    private static final HttpServer AI = startAiStub();

    @Autowired TestRestTemplate rest;
    @Autowired JdbcTemplate jdbc;
    @Autowired AiJobService aiJobs;

    @DynamicPropertySource
    static void aiService(DynamicPropertyRegistry properties) {
        properties.add("app.ai.service-url", () -> "http://127.0.0.1:" + AI.getAddress().getPort());
    }

    @AfterAll
    static void stopAiStub() { AI.stop(0); }

    @Test
    void workflowSurvivesAiOutageAndJobsRetryWithValidatedResponses() {
        String officer = login("phase6-officer@test.invalid", "officer-test-password");
        String worker = login("phase6-worker@test.invalid", "worker-test-password");
        String citizen = (String) rest.postForEntity("/api/auth/register", Map.of(
                "name", "AI Test Citizen", "email", "phase6-citizen@test.invalid",
                "password", "citizen-test-password", "phone", "9876543210", "ward", "Ward 6"),
                Map.class).getBody().get("token");
        long pondId = id(rest.exchange("/api/ponds", HttpMethod.POST, json(officer,
                Map.of("name", "Phase 6 pond", "ward", "Ward 6", "latitude", 10.5,
                        "longitude", 76.2)), Map.class).getBody());
        MultiValueMap<String, Object> tooMany = new LinkedMultiValueMap<>();
        tooMany.add("pondId", String.valueOf(pondId));
        tooMany.add("category", "PLASTIC_WASTE");
        tooMany.add("description", "Plastic waste covers part of the pond bank.");
        for (int index = 0; index < 4; index++) tooMany.add("images", image());
        assertThat(rest.exchange("/api/problems", HttpMethod.POST, multipart(citizen, tooMany),
                Map.class).getStatusCode().value()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM problems", Integer.class)).isZero();

        MultiValueMap<String, Object> oversized = new LinkedMultiValueMap<>();
        oversized.add("pondId", String.valueOf(pondId));
        oversized.add("category", "PLASTIC_WASTE");
        oversized.add("description", "Plastic waste covers part of the pond bank.");
        oversized.add("images", oversizedImage());
        assertThat(rest.exchange("/api/problems", HttpMethod.POST, multipart(citizen, oversized),
                Map.class).getStatusCode().value()).isEqualTo(400);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM problems", Integer.class)).isZero();

        MultiValueMap<String, Object> report = new LinkedMultiValueMap<>();
        report.add("pondId", String.valueOf(pondId));
        report.add("category", "PLASTIC_WASTE");
        report.add("description", "Plastic waste covers part of the pond bank.");
        report.add("images", image());
        long problemId = id(rest.exchange("/api/problems", HttpMethod.POST,
                multipart(citizen, report), Map.class).getBody());
        assertThat(jdbc.queryForObject("SELECT status FROM ai_jobs WHERE operation_key = ?", String.class,
                "CLASSIFY:" + problemId)).isEqualTo("PENDING");
        aiJobs.processDue();
        assertThat(jdbc.queryForObject("SELECT attempts FROM ai_jobs WHERE operation_key = ?", Integer.class,
                "CLASSIFY:" + problemId)).isEqualTo(1);
        assertThat(rest.exchange("/api/problems/" + problemId, HttpMethod.GET,
                json(citizen, null), Map.class).getBody()).containsEntry("status", "SUBMITTED");

        Map[] workers = rest.exchange("/api/users?role=FIELD_WORKER", HttpMethod.GET,
                json(officer, null), Map[].class).getBody();
        Map assigned = rest.exchange("/api/tasks", HttpMethod.POST, json(officer,
                Map.of("problemId", problemId, "assignedWorkerId", id(workers[0]),
                        "priority", "HIGH", "deadline", "2030-01-01T00:00:00Z")), Map.class).getBody();
        long taskId = id((Map) assigned.get("task"));
        assertThat(rest.exchange("/api/tasks/" + taskId, HttpMethod.PUT,
                json(worker, Map.of("status", "IN_PROGRESS")), Map.class).getStatusCode().value()).isEqualTo(200);
        MultiValueMap<String, Object> evidence = new LinkedMultiValueMap<>();
        evidence.add("beforeImage", image());
        evidence.add("afterImage", image());
        evidence.add("remarks", "Removed visible bottles and plastic bags.");
        assertThat(rest.exchange("/api/tasks/" + taskId + "/complete", HttpMethod.POST,
                multipart(worker, evidence), Map.class).getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_jobs WHERE kind = 'VERIFY_COMPLETION' "
                + "AND task_id = ?", Integer.class, taskId)).isEqualTo(1);
        aiJobs.processDue();
        assertThat(rest.exchange("/api/verifications", HttpMethod.POST, json(officer,
                Map.of("taskId", taskId, "decision", "FORWARD", "comment", "Photo reviewed")), Map.class)
                .getStatusCode().value()).isEqualTo(200);
        MultiValueMap<String, Object> vote = new LinkedMultiValueMap<>();
        vote.add("taskId", String.valueOf(taskId));
        vote.add("decision", "CONFIRM");
        vote.add("comment", "The bank looks clean now");
        assertThat(rest.exchange("/api/community-verifications", HttpMethod.POST,
                multipart(citizen, vote), Map.class).getBody()).containsEntry("status", "VERIFIED");

        ONLINE.set(true);
        dueNow();
        WRONG_TASK_ID.set(true);
        aiJobs.processDue();
        assertThat(jdbc.queryForObject("SELECT status FROM ai_jobs WHERE kind = 'CLASSIFY'", String.class))
                .isEqualTo("SUCCEEDED");
        assertThat(jdbc.queryForObject("SELECT status FROM ai_jobs WHERE kind = 'VERIFY_COMPLETION'",
                String.class)).isEqualTo("PENDING");
        WRONG_TASK_ID.set(false);
        dueNow();
        aiJobs.processDue();
        Map officerView = rest.exchange("/api/problems/" + problemId, HttpMethod.GET,
                json(officer, null), Map.class).getBody();
        assertThat((Map) officerView.get("aiClassification"))
                .containsEntry("status", "SUCCEEDED").containsEntry("modelVersion", "stub-v1");
        assertThat((Map) ((Map) officerView.get("task")).get("aiVerification"))
                .containsEntry("status", "SUCCEEDED").containsEntry("modelVersion", "stub-v1");
        assertThat(officerView).containsEntry("status", "VERIFIED");
    }

    private void dueNow() {
        jdbc.update("UPDATE ai_jobs SET next_attempt_at = ? WHERE status = 'PENDING'",
                LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1));
    }

    private static HttpServer startAiStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/ai/", exchange -> {
                byte[] body;
                int status;
                if (!ONLINE.get()) {
                    status = 503;
                    body = "Service unavailable".getBytes(StandardCharsets.UTF_8);
                } else {
                    JsonNode request = JSON.readTree(exchange.getRequestBody());
                    boolean classify = exchange.getRequestURI().getPath().endsWith("/classify");
                    String response = classify
                            ? "{\"success\":true,\"modelVersion\":\"stub-v1\",\"problemId\":"
                                + request.path("problemId").asLong() + ",\"result\":{\"category\":\"PLASTIC_WASTE\"},"
                                + "\"confidence\":0.82,\"warnings\":[]}"
                            : "{\"success\":true,\"modelVersion\":\"stub-v1\",\"taskId\":"
                                + (request.path("taskId").asLong() + (WRONG_TASK_ID.get() ? 1 : 0))
                                + ",\"taskType\":\"" + request.path("taskType").asText() + "\","
                                + "\"result\":{\"visibleReductionPercent\":80},"
                                + "\"confidence\":0.76,\"warnings\":[]} ";
                    status = 200;
                    body = response.getBytes(StandardCharsets.UTF_8);
                }
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, body.length);
                try (var output = exchange.getResponseBody()) { output.write(body); }
            });
            server.start();
            return server;
        } catch (Exception exception) {
            throw new IllegalStateException("Could not start AI test service", exception);
        }
    }

    private HttpEntity<ByteArrayResource> image() {
        byte[] png = Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=");
        ByteArrayResource resource = new ByteArrayResource(png) {
            @Override public String getFilename() { return "sample.png"; }
        };
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.IMAGE_PNG);
        return new HttpEntity<>(resource, headers);
    }

    private HttpEntity<ByteArrayResource> oversizedImage() {
        byte[] bytes = new byte[5 * 1024 * 1024 + 1];
        byte[] signature = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
        System.arraycopy(signature, 0, bytes, 0, signature.length);
        ByteArrayResource resource = new ByteArrayResource(bytes) {
            @Override public String getFilename() { return "oversized.png"; }
        };
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.IMAGE_PNG);
        return new HttpEntity<>(resource, headers);
    }

    private String login(String email, String password) {
        return (String) rest.postForEntity("/api/auth/login", Map.of("email", email,
                "password", password), Map.class).getBody().get("token");
    }

    private HttpEntity<?> json(String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }

    private HttpEntity<?> multipart(String token, MultiValueMap<String, Object> body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        return new HttpEntity<>(body, headers);
    }

    private long id(Map row) { return ((Number) row.get("id")).longValue(); }
}
