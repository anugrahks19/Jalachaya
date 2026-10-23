package in.jalachaya.backend.common;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class OperationsHealthController {
    private final DataScope scope;
    private final JdbcTemplate jdbc;
    private final Path uploads;
    public OperationsHealthController(JdbcTemplate jdbc, @Value("${app.upload-dir}") String uploads, DataScope scope) {
        this.scope = scope;
        this.jdbc = jdbc; this.uploads = Path.of(uploads).toAbsolutePath();
    }
    @GetMapping("/api/operations/health")
    public Map<String, Object> health(@AuthenticationPrincipal Jwt jwt) throws java.io.IOException {
        if (!"PANCHAYAT_OFFICER".equals(jwt.getClaimAsString("role"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only officers can view system details.");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("database", jdbc.queryForObject("SELECT 1", Integer.class) == 1 ? "UP" : "DOWN");
        result.put("migrationVersion", jdbc.queryForObject("SELECT version FROM flyway_schema_history WHERE success = TRUE ORDER BY installed_rank DESC LIMIT 1", String.class));
        result.put("aiJobs", jdbc.queryForList("SELECT status, COUNT(*) AS total FROM ai_jobs WHERE problem_id IN (SELECT id FROM problems WHERE " + scope.problems("", scope.currentDemo()) + ") GROUP BY status"));
        result.put("notificationEventsPending", jdbc.queryForObject("SELECT COUNT(*) FROM problem_history WHERE notifications_scanned = FALSE AND problem_id IN (SELECT id FROM problems WHERE " + scope.problems("", scope.currentDemo()) + ")", Integer.class));
        Path directory = uploads;
        while (!Files.exists(directory)) directory = directory.getParent();
        result.put("storageUsableBytes", Files.getFileStore(directory).getUsableSpace());
        result.put("uptimeSeconds", java.lang.management.ManagementFactory.getRuntimeMXBean().getUptime() / 1000);
        return result;
    }
}
