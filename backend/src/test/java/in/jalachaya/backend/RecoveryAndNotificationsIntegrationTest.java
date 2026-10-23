package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;

import in.jalachaya.backend.auth.PasswordRecoveryController;
import in.jalachaya.backend.notification.NotificationService;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:recovery;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "app.jwt.secret=recovery-integration-secret-at-least-32-bytes",
        "app.bootstrap.officer-email=recovery-officer@test.invalid",
        "app.bootstrap.officer-password=officer-test-password",
        "app.notifications.poll-ms=3600000"})
class RecoveryAndNotificationsIntegrationTest {
    @Autowired TestRestTemplate rest;
    @Autowired JdbcTemplate jdbc;
    @Autowired NotificationService notifications;

    @Test
    void resetIsSingleUseExpiresAndRevokesExistingSessions() {
        String email = UUID.randomUUID() + "@test.invalid";
        Map account = register(email);
        String oldJwt = (String) account.get("token");
        long id = ((Number) account.get("userId")).longValue();
        String token = "A".repeat(43);
        insertReset(id, token, -1);
        assertThat(reset(token).getStatusCode().value()).isEqualTo(400);
        jdbc.update("DELETE FROM password_reset_tokens WHERE user_id = ?", id);
        insertReset(id, token, 30);
        assertThat(reset(token).getStatusCode().value()).isEqualTo(200);
        assertThat(reset(token).getStatusCode().value()).isEqualTo(400);
        assertThat(rest.exchange("/api/users/me", HttpMethod.GET, auth(oldJwt, null), Map.class)
                .getStatusCode().value()).isEqualTo(401);
        assertThat(rest.postForEntity("/api/auth/login", Map.of("email", email,
                "password", "original-password-123"), Map.class).getStatusCode().value()).isEqualTo(401);
        Map login = rest.postForObject("/api/auth/login", Map.of("email", email,
                "password", "replacement-password-123"), Map.class);
        assertThat(rest.exchange("/api/users/me", HttpMethod.GET,
                auth((String) login.get("token"), null), Map.class).getStatusCode().value()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = ?",
                Integer.class, id)).isZero();
    }

    @Test
    void notificationsComeFromRealHistoryArePrivateAndCollectedOnce() {
        Map officer = rest.postForObject("/api/auth/login", Map.of("email", "recovery-officer@test.invalid",
                "password", "officer-test-password"), Map.class);
        Map citizen = register(UUID.randomUUID() + "@test.invalid");
        Map stranger = register(UUID.randomUUID() + "@test.invalid");
        String jwt = (String) officer.get("token");
        Map pond = rest.exchange("/api/ponds", HttpMethod.POST, auth(jwt, Map.of(
                "name", "Notifications pond", "ward", "Ward 1", "latitude", 10.5, "longitude", 76.2)), Map.class).getBody();
        long pondId = ((Number) pond.get("id")).longValue();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        jdbc.update("INSERT INTO problems (pond_id, reporter_id, category, priority, status, description, latitude, longitude, created_at, updated_at) "
                + "VALUES (?, ?, 'PLASTIC_WASTE', 'MEDIUM', 'SUBMITTED', 'Actual database notification test', 10.5, 76.2, ?, ?)",
                pondId, citizen.get("userId"), now, now);
        long problemId = jdbc.queryForObject("SELECT MAX(id) FROM problems WHERE pond_id = ?", Long.class, pondId);
        jdbc.update("INSERT INTO problem_history (problem_id, status, note, actor_id, created_at) VALUES (?, 'SUBMITTED', 'Submitted', ?, ?)",
                problemId, citizen.get("userId"), now);
        notifications.collect();
        Map inbox = rest.exchange("/api/notifications", HttpMethod.GET, auth(jwt, null), Map.class).getBody();
        assertThat(((Number) inbox.get("unreadCount")).intValue()).isEqualTo(1);
        notifications.collect();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM user_notifications WHERE problem_id = ?", Integer.class, problemId)).isEqualTo(1);
        long notificationId = jdbc.queryForObject("SELECT id FROM user_notifications WHERE problem_id = ?", Long.class, problemId);
        rest.exchange("/api/notifications/" + notificationId + "/read", HttpMethod.POST,
                auth((String) stranger.get("token"), null), Map.class);
        assertThat(jdbc.queryForObject("SELECT read_at FROM user_notifications WHERE id = ?", Object.class, notificationId)).isNull();
        rest.exchange("/api/notifications/" + notificationId + "/read", HttpMethod.POST, auth(jwt, null), Map.class);
        assertThat(rest.exchange("/api/notifications", HttpMethod.GET,
                auth(jwt, null), Map.class).getBody()).containsEntry("unreadCount", 0);
        assertThat(rest.exchange("/api/notifications", HttpMethod.GET,
                auth((String) stranger.get("token"), null), Map.class).getBody()).containsEntry("unreadCount", 0);
        assertThat(rest.getForEntity("/api/notifications", Map.class).getStatusCode().value()).isEqualTo(401);
    }

    private Map register(String email) {
        return rest.postForObject("/api/auth/register", Map.of("name", "Recovery Citizen", "email", email,
                "password", "original-password-123"), Map.class);
    }
    private void insertReset(long id, String token, int minutes) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        jdbc.update("INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                PasswordRecoveryController.hash(token), id, now.plusMinutes(minutes), now);
    }
    private ResponseEntity<Map> reset(String token) {
        return rest.postForEntity("/api/auth/reset-password", Map.of("token", token,
                "password", "replacement-password-123"), Map.class);
    }
    private HttpEntity<Object> auth(String jwt, Object body) {
        HttpHeaders headers = new HttpHeaders(); headers.setBearerAuth(jwt);
        headers.setContentType(MediaType.APPLICATION_JSON); return new HttpEntity<>(body, headers);
    }
}
