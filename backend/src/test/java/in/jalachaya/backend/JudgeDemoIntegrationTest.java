package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;
import in.jalachaya.backend.demo.JudgeDemoSeeder;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:judges;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "app.jwt.secret=judge-demo-integration-secret-at-least-32-bytes",
        "app.demo.enabled=true", "app.demo.samples-dir=../assets/samples",
        "app.upload-dir=target/test-uploads-judges"})
class JudgeDemoIntegrationTest {
    @Autowired TestRestTemplate rest;
    @Autowired JdbcTemplate jdbc;
    @Autowired JudgeDemoSeeder seeder;

    @Test
    void realJudgeAccountsHaveAllWorkflowStagesAndRestartDoesNotDuplicateThem() throws Exception {
        for (var account : JudgeDemoSeeder.ACCOUNTS) {
            var response = rest.postForEntity("/api/auth/login", Map.of("email", account.email(),
                    "password", account.password()), Map.class);
            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(response.getBody()).containsEntry("role", account.role().name());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM problems", Integer.class)).isEqualTo(9);
        assertThat(jdbc.queryForObject("SELECT COUNT(DISTINCT status) FROM problems", Integer.class)).isEqualTo(8);
        seeder.run();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM problems", Integer.class)).isEqualTo(9);
        assertThat(rest.getForObject("/api/public/highlights", Map[].class)).hasSize(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ponds", Integer.class)).isEqualTo(3);
        var publicAccounts = rest.getForEntity("/api/public/demo-accounts", String.class);
        assertThat(publicAccounts.getBody()).contains("citizen@judges.invalid", "JudgeWorker123!");
    }
}
