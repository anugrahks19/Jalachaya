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
        "spring.datasource.url=jdbc:h2:mem:phase2;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "app.jwt.secret=phase-two-integration-secret-at-least-32-bytes",
        "app.bootstrap.officer-email=officer@test.invalid",
        "app.bootstrap.officer-password=officer-test-password",
        "app.bootstrap.worker-email=worker@test.invalid",
        "app.bootstrap.worker-password=worker-test-password",
        "app.upload-dir=target/test-uploads"})
class AccountsAndPondsIntegrationTest {
    @Autowired
    private TestRestTemplate rest;

    @Test
    void selectedLoginRoleMustMatchStoredRole() {
        rest.postForEntity("/api/auth/register", Map.of("name", "Role selection citizen",
                "email", "role-choice@test.invalid", "password", "citizen-choice-password"), Map.class);
        var mismatch = rest.postForEntity("/api/auth/login", Map.of("email", "role-choice@test.invalid",
                "password", "citizen-choice-password", "role", "PANCHAYAT_OFFICER"), Map.class);
        assertThat(mismatch.getStatusCode().value()).isEqualTo(403);
        assertThat(mismatch.getBody()).doesNotContainKey("token");
        var citizen = rest.postForEntity("/api/auth/login", Map.of("email", "role-choice@test.invalid",
                "password", "citizen-choice-password", "role", "COMMUNITY_MEMBER"), Map.class);
        assertThat(citizen.getStatusCode().value()).isEqualTo(200);
        assertThat(citizen.getBody()).containsEntry("role", "COMMUNITY_MEMBER");
        var officer = rest.postForEntity("/api/auth/login", Map.of("email", "officer@test.invalid",
                "password", "officer-test-password", "role", "PANCHAYAT_OFFICER"), Map.class);
        assertThat(officer.getStatusCode().value()).isEqualTo(200);
        var worker = rest.postForEntity("/api/auth/login", Map.of("email", "worker@test.invalid",
                "password", "worker-test-password", "role", "FIELD_WORKER"), Map.class);
        assertThat(worker.getStatusCode().value()).isEqualTo(200);
        var invalid = rest.postForEntity("/api/auth/login", Map.of("email", "worker@test.invalid",
                "password", "worker-test-password", "role", "ADMIN"), Map.class);
        assertThat(invalid.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void citizensRegisterLoginAndCannotManagePonds() {
        Map<String, Object> registration = Map.of(
                "name", "Anjali Menon", "email", "Anjali@Example.com", "phone", "9876543210",
                "ward", "Ward 3", "password", "citizen123");
        ResponseEntity<Map> created = rest.postForEntity("/api/auth/register", registration, Map.class);
        assertThat(created.getStatusCode().value()).isEqualTo(200);
        assertThat(created.getBody()).containsEntry("role", "COMMUNITY_MEMBER");
        assertThat(created.getBody()).containsKey("token");

        ResponseEntity<Map> duplicate = rest.postForEntity("/api/auth/register", registration, Map.class);
        assertThat(duplicate.getStatusCode().value()).isEqualTo(409);
        assertThat(duplicate.getBody()).containsKey("message");

        ResponseEntity<Map> wrongPassword = rest.postForEntity("/api/auth/login",
                Map.of("email", "anjali@example.com", "password", "wrong"), Map.class);
        assertThat(wrongPassword.getStatusCode().value()).isEqualTo(401);

        String token = login("ANJALI@example.com", "citizen123");
        ResponseEntity<Map> me = rest.exchange("/api/users/me", HttpMethod.GET,
                authorized(token, null), Map.class);
        assertThat(me.getStatusCode().value()).isEqualTo(200);
        assertThat(me.getBody()).containsEntry("email", "anjali@example.com");
        assertThat(me.getBody()).doesNotContainKeys("password", "passwordHash");

        ResponseEntity<Map> denied = rest.exchange("/api/ponds", HttpMethod.POST,
                authorized(token, pond("Citizen Pond")), Map.class);
        assertThat(denied.getStatusCode().value()).isEqualTo(403);
        assertThat(denied.getBody()).containsKey("message");

        ResponseEntity<Map> anonymous = rest.getForEntity("/api/users/me", Map.class);
        assertThat(anonymous.getStatusCode().value()).isEqualTo(401);

        ResponseEntity<Map> invalidToken = rest.exchange("/api/users/me", HttpMethod.GET,
                authorized(token + "invalid", null), Map.class);
        assertThat(invalidToken.getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void officerManagesPondsAndWorkerList() {
        String officer = login("officer@test.invalid", "officer-test-password");
        ResponseEntity<Object[]> workers = rest.exchange("/api/users?role=FIELD_WORKER", HttpMethod.GET,
                authorized(officer, null), Object[].class);
        assertThat(workers.getStatusCode().value()).isEqualTo(200);
        assertThat(workers.getBody()).hasSize(1);

        String worker = login("worker@test.invalid", "worker-test-password");
        ResponseEntity<Map> workerDenied = rest.exchange("/api/ponds", HttpMethod.POST,
                authorized(worker, pond("Worker Pond")), Map.class);
        assertThat(workerDenied.getStatusCode().value()).isEqualTo(403);

        ResponseEntity<Map> created = rest.exchange("/api/ponds", HttpMethod.POST,
                authorized(officer, pond("Integration Pond")), Map.class);
        assertThat(created.getStatusCode().value()).isEqualTo(200);
        Number id = (Number) created.getBody().get("id");
        assertThat(created.getBody()).containsEntry("activeComplaints", 0);
        assertThat(created.getBody().get("recoveryPercent")).isNull();

        ResponseEntity<Map> publicPond = rest.getForEntity("/api/public/ponds/" + id, Map.class);
        assertThat(publicPond.getStatusCode().value()).isEqualTo(200);
        assertThat(publicPond.getBody()).containsEntry("name", "Integration Pond");
        assertThat(publicPond.getBody()).doesNotContainKeys("reporterName", "workerName");

        ResponseEntity<Map> duplicate = rest.exchange("/api/ponds", HttpMethod.POST,
                authorized(officer, pond("integration pond")), Map.class);
        assertThat(duplicate.getStatusCode().value()).isEqualTo(409);

        ResponseEntity<Map> updated = rest.exchange("/api/ponds/" + id, HttpMethod.PUT,
                authorized(officer, pond("Renamed Integration Pond")), Map.class);
        assertThat(updated.getStatusCode().value()).isEqualTo(200);
        assertThat(updated.getBody()).containsEntry("name", "Renamed Integration Pond");

        ResponseEntity<Map> invalid = rest.exchange("/api/ponds", HttpMethod.POST,
                authorized(officer, Map.of("name", "Bad pond", "ward", "Ward 2",
                        "latitude", 99, "longitude", 76)), Map.class);
        assertThat(invalid.getStatusCode().value()).isEqualTo(400);

        ResponseEntity<Map> formShape = rest.exchange("/api/ponds", HttpMethod.POST,
                authorized(officer, Map.of("name", "Form Pond", "ward", "Ward 4",
                        "areaAcres", "", "latitude", "10.5310", "longitude", "76.3290")), Map.class);
        assertThat(formShape.getStatusCode().value()).isEqualTo(200);
        assertThat(formShape.getBody().get("areaAcres")).isNull();

        ResponseEntity<Map> deactivated = rest.exchange("/api/ponds/" + id, HttpMethod.PUT,
                authorized(officer, Map.of("active", false)), Map.class);
        assertThat(deactivated.getStatusCode().value()).isEqualTo(200);
        assertThat(deactivated.getBody()).containsEntry("active", false);
        assertThat(rest.getForEntity("/api/public/ponds/" + id, Map.class).getStatusCode().value())
                .isEqualTo(404);

        ResponseEntity<Map> reactivated = rest.exchange("/api/ponds/" + id, HttpMethod.PUT,
                authorized(officer, Map.of("active", true)), Map.class);
        assertThat(reactivated.getStatusCode().value()).isEqualTo(200);
        assertThat(reactivated.getBody()).containsEntry("active", true);
    }

    @Test
    void officerUploadsAndRemovesPondPhoto() {
        String officer = login("officer@test.invalid", "officer-test-password");
        ResponseEntity<Map> created = rest.exchange("/api/ponds", HttpMethod.POST,
                authorized(officer, pond("Photo Pond")), Map.class);
        Number id = (Number) created.getBody().get("id");

        byte[] png = Base64.getDecoder().decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=");
        ByteArrayResource image = new ByteArrayResource(png) {
            @Override public String getFilename() { return "pond.png"; }
        };
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.IMAGE_PNG);
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add("image", new HttpEntity<>(image, partHeaders));
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(officer);
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        ResponseEntity<Map> uploaded = rest.exchange("/api/ponds/" + id + "/image", HttpMethod.POST,
                new HttpEntity<>(parts, headers), Map.class);
        assertThat(uploaded.getStatusCode().value()).isEqualTo(200);
        String imageUrl = (String) uploaded.getBody().get("imageUrl");
        assertThat(imageUrl).startsWith("/uploads/ponds/");
        assertThat(rest.getForEntity(imageUrl, byte[].class).getBody()).isEqualTo(png);

        ResponseEntity<Map> removed = rest.exchange("/api/ponds/" + id + "/image", HttpMethod.DELETE,
                authorized(officer, null), Map.class);
        assertThat(removed.getStatusCode().value()).isEqualTo(200);
        assertThat(removed.getBody().get("imageUrl")).isNull();
        assertThat(rest.getForEntity(imageUrl, byte[].class).getStatusCode().value()).isEqualTo(404);
    }

    private String login(String email, String password) {
        ResponseEntity<Map> response = rest.postForEntity("/api/auth/login",
                Map.of("email", email, "password", password), Map.class);
        assertThat(response.getStatusCode().value()).isEqualTo(200);
        return (String) response.getBody().get("token");
    }

    private HttpEntity<?> authorized(String token, Object body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }

    private Map<String, Object> pond(String name) {
        return Map.of("name", name, "ward", "Ward 2", "village", "Peechi",
                "areaAcres", 1.2, "latitude", 10.5310, "longitude", 76.3290,
                "description", "Integration test pond");
    }
}
