package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Base64;
import java.util.Map;
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
        "spring.datasource.url=jdbc:h2:mem:phase3;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "app.jwt.secret=phase-three-integration-secret-at-least-32-bytes",
        "app.bootstrap.officer-email=phase3-officer@test.invalid",
        "app.bootstrap.officer-password=officer-test-password",
        "app.bootstrap.worker-email=phase3-worker@test.invalid",
        "app.bootstrap.worker-password=worker-test-password",
        "app.upload-dir=target/test-uploads-phase3"})
class ComplaintsAndAssignmentIntegrationTest {
    @Autowired TestRestTemplate rest;

    @Test
    void citizenReportsAndOfficerAssignsWithoutLeakingWorkerName() {
        String officer = login("phase3-officer@test.invalid", "officer-test-password");
        String worker = login("phase3-worker@test.invalid", "worker-test-password");
        String citizen = register("citizen3@test.invalid");
        String stranger = register("stranger3@test.invalid");
        long pondId = createPond(officer, "Phase 3 pond");

        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("pondId", String.valueOf(pondId));
        parts.add("category", "PLASTIC_WASTE");
        parts.add("description", "There is plastic waste along the shore.");
        parts.add("landmark", "Near the steps");
        parts.add("images", image());
        ResponseEntity<Map> created = rest.exchange("/api/problems", HttpMethod.POST,
                multipart(citizen, parts), Map.class);
        assertThat(created.getStatusCode().value()).isEqualTo(200);
        long problemId = ((Number) created.getBody().get("id")).longValue();
        assertThat(created.getBody()).containsEntry("status", "SUBMITTED");
        assertThat(created.getBody().get("images").toString()).contains("/uploads/problems/");

        ResponseEntity<Map> privateProblem = rest.exchange("/api/problems/" + problemId, HttpMethod.GET,
                json(stranger, null), Map.class);
        assertThat(privateProblem.getStatusCode().value()).isEqualTo(403);
        ResponseEntity<Map> workerBeforeAssignment = rest.exchange("/api/problems/" + problemId, HttpMethod.GET,
                json(worker, null), Map.class);
        assertThat(workerBeforeAssignment.getStatusCode().value()).isEqualTo(403);
        ResponseEntity<Map> citizenAssignment = rest.exchange("/api/tasks", HttpMethod.POST,
                json(citizen, Map.of("problemId", problemId, "assignedWorkerId", 1,
                        "priority", "HIGH", "deadline", "2030-01-01T00:00:00Z")), Map.class);
        assertThat(citizenAssignment.getStatusCode().value()).isEqualTo(403);

        ResponseEntity<Map> publicPond = rest.getForEntity("/api/public/ponds/" + pondId, Map.class);
        assertThat(publicPond.getBody()).containsEntry("totalComplaints", 1).containsEntry("activeComplaints", 1);
        assertThat(publicPond.getBody()).containsEntry("recoveryPercent", 0);
        ResponseEntity<Map[]> activity = rest.getForEntity("/api/public/activity", Map[].class);
        assertThat(activity.getBody()).isNotEmpty();
        assertThat(activity.getBody()[0]).containsEntry("text", "New complaint reported");
        ResponseEntity<Map> deactivation = rest.exchange("/api/ponds/" + pondId, HttpMethod.PUT,
                json(officer, Map.of("active", false)), Map.class);
        assertThat(deactivation.getStatusCode().value()).isEqualTo(409);

        ResponseEntity<Map[]> workers = rest.exchange("/api/users?role=FIELD_WORKER", HttpMethod.GET,
                json(officer, null), Map[].class);
        long workerId = ((Number) workers.getBody()[0].get("id")).longValue();
        ResponseEntity<Map> assigned = rest.exchange("/api/tasks", HttpMethod.POST,
                json(officer, Map.of("problemId", problemId, "assignedWorkerId", workerId,
                        "priority", "HIGH", "deadline", "2030-01-01T00:00:00Z",
                        "instructions", "Remove waste")), Map.class);
        assertThat(assigned.getStatusCode().value()).isEqualTo(200);
        assertThat(assigned.getBody()).containsEntry("status", "ASSIGNED");
        assertThat(assigned.getBody().get("task").toString()).contains("workerName");
        assertThat(rest.getForEntity("/api/public/ponds/" + pondId, Map.class).getBody())
                .containsEntry("recoveryPercent", 20);
        assertThat(rest.exchange("/api/tasks", HttpMethod.POST,
                json(officer, Map.of("problemId", problemId, "assignedWorkerId", workerId,
                        "priority", "HIGH", "deadline", "2030-01-01T00:00:00Z")), Map.class)
                .getStatusCode().value()).isEqualTo(409);

        ResponseEntity<Map> citizenView = rest.exchange("/api/problems/" + problemId, HttpMethod.GET,
                json(citizen, null), Map.class);
        assertThat(citizenView.getBody().toString()).doesNotContain("phase3-worker", "workerName", "workerPhone");
        assertThat(citizenView.getBody().get("history").toString()).contains("Field worker assigned.");
        assertThat(rest.exchange("/api/problems/" + problemId, HttpMethod.GET,
                json(worker, null), Map.class).getStatusCode().value()).isEqualTo(200);
        assertThat(rest.exchange("/api/problems?mine=true", HttpMethod.GET,
                json(citizen, null), Map[].class).getBody()).hasSize(1);
        assertThat(rest.exchange("/api/problems?status=ASSIGNED", HttpMethod.GET,
                json(officer, null), Map[].class).getBody()).hasSize(1);
        assertThat(rest.exchange("/api/problems?status=SUBMITTED", HttpMethod.GET,
                json(officer, null), Map[].class).getBody()).isEmpty();
    }

    @Test
    void officerCanRejectNewComplaintAndCitizenCanAddPhotoBeforeThat() {
        String officer = login("phase3-officer@test.invalid", "officer-test-password");
        String citizen = register("photo3@test.invalid");
        long pondId = createPond(officer, "Photo complaint pond");
        MultiValueMap<String, Object> report = new LinkedMultiValueMap<>();
        report.add("pondId", String.valueOf(pondId));
        report.add("category", "FOUL_SMELL");
        report.add("description", "The pond smells foul near the road.");
        ResponseEntity<Map> created = rest.exchange("/api/problems", HttpMethod.POST,
                multipart(citizen, report), Map.class);
        assertThat(created.getStatusCode().value()).isEqualTo(200);
        long id = ((Number) created.getBody().get("id")).longValue();
        MultiValueMap<String, Object> photo = new LinkedMultiValueMap<>();
        photo.add("image", image());
        photo.add("caption", "Latest photo");
        ResponseEntity<Map> added = rest.exchange("/api/problems/" + id + "/images", HttpMethod.POST,
                multipart(citizen, photo), Map.class);
        assertThat(added.getStatusCode().value()).isEqualTo(200);
        assertThat(added.getBody().get("images").toString()).contains("Latest photo");
        ResponseEntity<Map> rejected = rest.exchange("/api/problems/" + id, HttpMethod.PUT,
                json(officer, Map.of("status", "REJECTED", "reason", "Duplicate report")), Map.class);
        assertThat(rejected.getStatusCode().value()).isEqualTo(200);
        assertThat(rejected.getBody()).containsEntry("status", "REJECTED");
        assertThat(rest.exchange("/api/problems/" + id + "/images", HttpMethod.POST,
                multipart(citizen, photo), Map.class).getStatusCode().value()).isEqualTo(409);
        assertThat(rest.getForEntity("/api/public/ponds/" + pondId, Map.class).getBody())
                .containsEntry("totalComplaints", 0).containsEntry("activeComplaints", 0);
    }

    private long createPond(String officer, String name) {
        ResponseEntity<Map> response = rest.exchange("/api/ponds", HttpMethod.POST,
                json(officer, Map.of("name", name, "ward", "Ward 3", "latitude", 10.5,
                        "longitude", 76.2)), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return ((Number) response.getBody().get("id")).longValue();
    }

    private String register(String email) {
        ResponseEntity<Map> response = rest.postForEntity("/api/auth/register",
                Map.of("name", "Test Citizen", "email", email, "password", "citizen123",
                        "ward", "Ward 3", "phone", "9876543210"), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return (String) response.getBody().get("token");
    }

    private String login(String email, String password) {
        ResponseEntity<Map> response = rest.postForEntity("/api/auth/login",
                Map.of("email", email, "password", password), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return (String) response.getBody().get("token");
    }

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

    private HttpEntity<ByteArrayResource> image() {
        byte[] png = Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=");
        ByteArrayResource resource = new ByteArrayResource(png) {
            @Override public String getFilename() { return "report.png"; }
        };
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.IMAGE_PNG);
        return new HttpEntity<>(resource, headers);
    }
}
