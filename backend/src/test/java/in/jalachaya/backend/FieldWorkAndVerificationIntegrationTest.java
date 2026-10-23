package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Base64;
import java.nio.file.Files;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import in.jalachaya.backend.problem.ProblemImageStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:phase4;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "app.jwt.secret=phase-four-integration-secret-at-least-32-bytes",
        "app.bootstrap.officer-email=phase4-officer@test.invalid",
        "app.bootstrap.officer-password=officer-test-password",
        "app.bootstrap.worker-email=phase4-worker@test.invalid",
        "app.bootstrap.worker-password=worker-test-password",
        "app.upload-dir=target/test-uploads-phase4"})
class FieldWorkAndVerificationIntegrationTest {
    @Autowired TestRestTemplate rest;
    @Autowired ProblemImageStore imageStore;

    @Test
    void fullVerifiedFlowUsesOneCompletionAndPreventsDuplicateEvidence() throws IOException {
        Context c = setup();
        assertThat(rest.exchange("/api/tasks?mine=true", HttpMethod.GET,
                json(c.worker, null), Map[].class).getBody()).anySatisfy(task ->
                assertThat(task).containsEntry("id", (int) c.taskId));
        assertThat(rest.exchange("/api/tasks/" + c.taskId, HttpMethod.PUT,
                json(c.citizen, Map.of("status", "IN_PROGRESS")), Map.class).getStatusCode().value()).isEqualTo(403);
        assertThat(rest.exchange("/api/tasks/" + c.taskId, HttpMethod.PUT,
                json(c.worker, Map.of("status", "IN_PROGRESS")), Map.class).getStatusCode().value()).isEqualTo(200);

        MultiValueMap<String, Object> note = new LinkedMultiValueMap<>();
        note.add("text", "Initial site inspection");
        note.add("image", image());
        assertThat(rest.exchange("/api/tasks/" + c.taskId + "/notes", HttpMethod.POST,
                multipart(c.worker, note), Map.class).getStatusCode().value()).isEqualTo(200);

        long beforeFiles = fileCount();
        MultiValueMap<String, Object> invalid = evidence();
        invalid.set("afterImage", invalidImage());
        assertThat(rest.exchange("/api/tasks/" + c.taskId + "/complete", HttpMethod.POST,
                multipart(c.worker, invalid), Map.class).getStatusCode().value()).isEqualTo(400);
        assertThat(fileCount()).isEqualTo(beforeFiles);

        MultiValueMap<String, Object> evidence = evidence();
        ResponseEntity<Map> completed = rest.exchange("/api/tasks/" + c.taskId + "/complete",
                HttpMethod.POST, multipart(c.worker, evidence), Map.class);
        assertThat(completed.getStatusCode().value()).isEqualTo(200);
        assertThat(completed.getBody().get("evidence").toString()).contains("beforeImageUrl", "afterImageUrl");
        assertThat(rest.exchange("/api/tasks/" + c.taskId + "/complete", HttpMethod.POST,
                multipart(c.worker, evidence), Map.class).getStatusCode().value()).isEqualTo(409);
        ResponseEntity<Map> problem = rest.exchange("/api/problems/" + c.problemId, HttpMethod.GET,
                json(c.officer, null), Map.class);
        assertThat(problem.getBody()).containsEntry("status", "COMPLETION_CLAIMED");
        assertThat(rest.exchange("/api/verifications", HttpMethod.POST,
                json(c.officer, Map.of("taskId", c.taskId, "decision", "FORWARD", "comment", "Looks good")),
                Map.class).getStatusCode().value()).isEqualTo(200);

        ResponseEntity<Map[]> pending = rest.exchange("/api/community-verifications/pending", HttpMethod.GET,
                json(c.citizen, null), Map[].class);
        assertThat(pending.getBody()).hasSize(1);
        assertThat(pending.getBody()[0].get("evidence").toString()).contains("beforeImageUrl");
        MultiValueMap<String, Object> vote = new LinkedMultiValueMap<>();
        vote.add("taskId", String.valueOf(c.taskId));
        vote.add("decision", "CONFIRM");
        vote.add("comment", "The bank is now clean");
        ResponseEntity<Map> verified = rest.exchange("/api/community-verifications", HttpMethod.POST,
                multipart(c.citizen, vote), Map.class);
        assertThat(verified.getStatusCode().value()).isEqualTo(200);
        assertThat(verified.getBody()).containsEntry("status", "VERIFIED");
        assertThat(rest.exchange("/api/community-verifications", HttpMethod.POST,
                multipart(c.citizen, vote), Map.class).getStatusCode().value()).isEqualTo(409);
        assertThat(rest.getForEntity("/api/public/ponds/" + c.pondId, Map.class).getBody())
                .containsEntry("resolvedComplaints", 1).containsEntry("recoveryPercent", 100);
        assertThat(rest.getForEntity("/api/public/highlights", Map[].class).getBody()).hasSize(1);
        assertThat(rest.exchange("/api/problems/" + c.problemId, HttpMethod.GET,
                json(c.citizen, null), Map.class).getBody().get("task").toString()).contains("evidence");
    }

    @Test
    void returnThenResubmitAndDisputeReopensForReassignment() {
        Context c = setup();
        String verifier = register();
        rest.exchange("/api/tasks/" + c.taskId, HttpMethod.PUT,
                json(c.worker, Map.of("status", "IN_PROGRESS")), Map.class);
        rest.exchange("/api/tasks/" + c.taskId + "/complete", HttpMethod.POST,
                multipart(c.worker, evidence()), Map.class);
        assertThat(rest.exchange("/api/verifications", HttpMethod.POST,
                json(c.officer, Map.of("taskId", c.taskId, "decision", "RETURN", "comment", "Clean the bank too")),
                Map.class).getBody()).containsEntry("status", "IN_PROGRESS");
        assertThat(rest.exchange("/api/tasks/" + c.taskId + "/complete", HttpMethod.POST,
                multipart(c.worker, evidence()), Map.class).getStatusCode().value()).isEqualTo(200);
        rest.exchange("/api/verifications", HttpMethod.POST,
                json(c.officer, Map.of("taskId", c.taskId, "decision", "FORWARD", "comment", "")), Map.class);
        MultiValueMap<String, Object> vote = new LinkedMultiValueMap<>();
        vote.add("taskId", String.valueOf(c.taskId));
        vote.add("decision", "DISPUTE");
        vote.add("comment", "Waste remains near the road");
        vote.add("image", image());
        assertThat(rest.exchange("/api/community-verifications", HttpMethod.POST,
                multipart(verifier, vote), Map.class).getBody()).containsEntry("status", "REOPENED");
        assertThat(rest.exchange("/api/problems/" + c.problemId, HttpMethod.GET,
                json(c.officer, null), Map.class).getBody()).containsEntry("status", "REOPENED");
        Map[] tasks = rest.exchange("/api/tasks?mine=true", HttpMethod.GET,
                json(c.worker, null), Map[].class).getBody();
        assertThat(tasks[0]).containsEntry("stage", "CLOSED").containsEntry("active", false);
        assertThat(rest.exchange("/api/tasks/" + c.taskId + "/complete", HttpMethod.POST,
                multipart(c.worker, evidence()), Map.class).getStatusCode().value()).isEqualTo(409);
        assertThat(rest.exchange("/api/problems/" + c.problemId, HttpMethod.GET,
                json(c.officer, null), Map.class).getBody().get("images").toString()).contains("Photo from dispute");
        assertThat(rest.exchange("/api/problems/" + c.problemId, HttpMethod.GET,
                json(c.citizen, null), Map.class).getBody().get("images").toString())
                .contains("Community member").doesNotContain("Phase Four Citizen");
    }

    private Context setup() {
        String officer = login("phase4-officer@test.invalid", "officer-test-password");
        String worker = login("phase4-worker@test.invalid", "worker-test-password");
        String citizen = register();
        long pondId = id(rest.exchange("/api/ponds", HttpMethod.POST,
                json(officer, Map.of("name", "Phase 4 pond " + UUID.randomUUID(), "ward", "Ward 4",
                        "latitude", 10.5, "longitude", 76.2)), Map.class).getBody());
        MultiValueMap<String, Object> report = new LinkedMultiValueMap<>();
        report.add("pondId", String.valueOf(pondId));
        report.add("category", "PLASTIC_WASTE");
        report.add("description", "Plastic waste is collecting near the shore.");
        long problemId = id(rest.exchange("/api/problems", HttpMethod.POST,
                multipart(citizen, report), Map.class).getBody());
        Map[] workers = rest.exchange("/api/users?role=FIELD_WORKER", HttpMethod.GET,
                json(officer, null), Map[].class).getBody();
        long workerId = id(workers[0]);
        Map assigned = rest.exchange("/api/tasks", HttpMethod.POST,
                json(officer, Map.of("problemId", problemId, "assignedWorkerId", workerId,
                        "priority", "HIGH", "deadline", "2030-01-01T00:00:00Z")), Map.class).getBody();
        long taskId = ((Number) ((Map) assigned.get("task")).get("id")).longValue();
        return new Context(officer, worker, citizen, pondId, problemId, taskId);
    }

    private MultiValueMap<String, Object> evidence() {
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("beforeImage", image());
        parts.add("afterImage", image());
        parts.add("remarks", "Removed all visible plastic waste.");
        return parts;
    }

    private HttpEntity<ByteArrayResource> image() {
        byte[] png = Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=");
        ByteArrayResource resource = new ByteArrayResource(png) {
            @Override public String getFilename() { return "evidence.png"; }
        };
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.IMAGE_PNG);
        return new HttpEntity<>(resource, headers);
    }

    private HttpEntity<ByteArrayResource> invalidImage() {
        ByteArrayResource resource = new ByteArrayResource("not a png".getBytes()) {
            @Override public String getFilename() { return "invalid.png"; }
        };
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.IMAGE_PNG);
        return new HttpEntity<>(resource, headers);
    }

    private long fileCount() throws IOException {
        if (!Files.exists(imageStore.directory())) return 0;
        try (var files = Files.list(imageStore.directory())) { return files.count(); }
    }

    private String register() {
        Map result = rest.postForEntity("/api/auth/register", Map.of("name", "Phase Four Citizen",
                "email", UUID.randomUUID() + "@test.invalid", "password", "citizen123",
                "ward", "Ward 4", "phone", "9876543210"), Map.class).getBody();
        return (String) result.get("token");
    }

    private String login(String email, String password) {
        return (String) rest.postForEntity("/api/auth/login", Map.of("email", email,
                "password", password), Map.class).getBody().get("token");
    }

    private long id(Map map) { return ((Number) map.get("id")).longValue(); }
    private HttpEntity<?> json(String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
    private HttpEntity<?> multipart(String token, MultiValueMap<String, Object> parts) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        return new HttpEntity<>(parts, headers);
    }
    private record Context(String officer, String worker, String citizen, long pondId, long problemId, long taskId) {}
}
