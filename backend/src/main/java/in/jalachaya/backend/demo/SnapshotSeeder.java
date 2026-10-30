package in.jalachaya.backend.demo;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SnapshotSeeder implements CommandLineRunner {
    private static final List<String> ID_TABLES = List.of(
            "app_users", "ponds", "problems", "problem_images", "problem_history",
            "tasks", "task_notes", "task_evidence", "task_reviews",
            "community_verifications", "ai_jobs", "user_notifications",
            "task_escalations", "deadline_events", "authority_contacts", "authority_deliveries");

    private final boolean enabled;
    private final JdbcTemplate jdbc;

    public SnapshotSeeder(@Value("${app.snapshot.enabled:false}") boolean enabled, JdbcTemplate jdbc) {
        this.enabled = enabled;
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) throws Exception {
        if (!enabled) return;
        Integer realPonds = jdbc.queryForObject("SELECT COUNT(*) FROM ponds WHERE is_demo = FALSE", Integer.class);
        if (realPonds != null && realPonds > 0) return;

        ClassPathResource resource = new ClassPathResource("snapshot/seed.sql");
        if (!resource.exists()) return;

        try { jdbc.execute("SET FOREIGN_KEY_CHECKS = 0"); } catch (Exception ignored) {}
        try { jdbc.execute("SET REFERENTIAL_INTEGRITY FALSE"); } catch (Exception ignored) {}

        for (String table : ID_TABLES) {
            try { jdbc.execute("DELETE FROM " + table); } catch (Exception ignored) {}
        }
        try { jdbc.execute("DELETE FROM worker_team_access"); } catch (Exception ignored) {}

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String sql = line.trim();
                if (sql.isEmpty() || sql.startsWith("--")) continue;
                if (sql.endsWith(";")) sql = sql.substring(0, sql.length() - 1);
                jdbc.execute(sql);
            }
        } finally {
            try { jdbc.execute("SET REFERENTIAL_INTEGRITY TRUE"); } catch (Exception ignored) {}
            try { jdbc.execute("SET FOREIGN_KEY_CHECKS = 1"); } catch (Exception ignored) {}
        }

        for (String table : ID_TABLES) {
            try {
                Long maxId = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) FROM " + table, Long.class);
                long nextId = (maxId == null ? 0L : maxId) + 1L;
                jdbc.execute("ALTER TABLE " + table + " ALTER COLUMN id RESTART WITH " + nextId);
            } catch (Exception ignored) {}
        }
    }
}
