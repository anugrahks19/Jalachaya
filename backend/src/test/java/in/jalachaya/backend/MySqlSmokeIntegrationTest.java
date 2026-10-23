package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.ResponseEntity;

@EnabledIfEnvironmentVariable(named = "RUN_MYSQL_TEST", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"app.jwt.secret=mysql-smoke-test-secret-at-least-32-bytes",
                "app.bootstrap.officer-email=", "app.bootstrap.officer-password=",
                "app.bootstrap.worker-email=", "app.bootstrap.worker-password="})
class MySqlSmokeIntegrationTest {
    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestRestTemplate rest;

    @Test
    void connectsToMysqlAndAppliesAllMigrations() throws Exception {
        try (var connection = dataSource.getConnection()) {
            assertThat(connection.getMetaData().getDatabaseProductName()).containsIgnoringCase("MySQL");
        }
        assertThat(jdbc.queryForObject("SELECT version FROM flyway_schema_history "
                + "WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1", String.class)).isEqualTo("10");
        ResponseEntity<String> health = rest.getForEntity("/api/health", String.class);
        assertThat(health.getStatusCode().value()).isEqualTo(200);
        assertThat(health.getBody()).contains("\"database\":\"UP\"");
    }
}
