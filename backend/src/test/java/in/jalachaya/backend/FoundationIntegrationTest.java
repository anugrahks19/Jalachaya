package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.datasource.url=jdbc:h2:mem:foundation;MODE=MySQL;DB_CLOSE_DELAY=-1",
                "app.jwt.secret=foundation-test-secret-that-is-at-least-32-bytes"})
class FoundationIntegrationTest {
    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void migrationRunsAndHealthChecksDatabase() {
        var response = rest.getForEntity("/api/health", String.class);
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).contains("\"database\":\"UP\"");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ponds", Integer.class)).isZero();
    }

    @Test
    void frontendOriginCanCallApi() {
        var headers = new HttpHeaders();
        headers.add("Origin", "http://localhost:5500");
        headers.add("Access-Control-Request-Method", "GET");
        var response = rest.exchange("/api/health", HttpMethod.OPTIONS,
                new HttpEntity<Void>(headers), String.class);
        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getFirst("Access-Control-Allow-Origin"))
                .isEqualTo("http://localhost:5500");
    }

    @Test
    void missingRouteReturnsJsonMessage() {
        var response = rest.getForEntity("/api/public/does-not-exist", String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(404);
        assertThat(response.getBody()).contains("\"message\":\"The requested record was not found.\"");
    }
}
