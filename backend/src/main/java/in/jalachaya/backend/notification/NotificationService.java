package in.jalachaya.backend.notification;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Service
public class NotificationService {
    private final in.jalachaya.backend.common.DataScope scope;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public NotificationService(JdbcTemplate jdbc, PlatformTransactionManager manager, in.jalachaya.backend.common.DataScope scope) {
        this.scope = scope;
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
    }

    @Scheduled(fixedDelayString = "${app.notifications.poll-ms:5000}", initialDelay = 2000)
    public void collect() {
        transaction.executeWithoutResult(ignored -> {
            var events = jdbc.queryForList("SELECT * FROM problem_history WHERE notifications_scanned = FALSE "
                    + "ORDER BY id LIMIT 50 FOR UPDATE");
            for (var event : events) {
                long historyId = ((Number) event.get("id")).longValue();
                long problemId = ((Number) event.get("problem_id")).longValue();
                long actorId = ((Number) event.get("actor_id")).longValue();
                var problem = jdbc.queryForMap("SELECT p.reporter_id, d.name AS pond_name, d.is_demo FROM problems p "
                        + "JOIN ponds d ON d.id = p.pond_id WHERE p.id = ?", problemId);
                String message = "JC-" + (1000 + problemId) + " at " + problem.get("pond_name")
                        + ": " + event.get("status").toString().replace('_', ' ').toLowerCase(java.util.Locale.ROOT) + ".";
                List<Long> recipients = jdbc.query("SELECT DISTINCT u.id FROM app_users u WHERE u.active = TRUE "
                                + "AND u.is_demo = ? AND u.id <> ? AND (u.id = ? OR u.role = 'PANCHAYAT_OFFICER' OR u.id IN "
                                + "(SELECT worker_id FROM tasks WHERE problem_id = ? AND active = TRUE))",
                        (row, index) -> row.getLong(1), problem.get("is_demo"), actorId, problem.get("reporter_id"), problemId);
                for (Long userId : recipients) {
                    jdbc.update("INSERT INTO user_notifications (user_id, history_id, message, problem_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?)", userId, historyId, message, problemId,
                            LocalDateTime.now(ZoneOffset.UTC));
                }
                jdbc.update("UPDATE problem_history SET notifications_scanned = TRUE WHERE id = ?", historyId);
            }
            jdbc.update("DELETE FROM password_reset_tokens WHERE expires_at < ?", LocalDateTime.now(ZoneOffset.UTC));
        });
    }

    public Map<String, Object> inbox(long userId) {
        List<Map<String, Object>> items = jdbc.query("SELECT id, message, problem_id, created_at, read_at "
                + "FROM user_notifications WHERE user_id = ? AND problem_id IN (SELECT id FROM problems WHERE " + scope.problems("", scope.demo(userId)) + ") ORDER BY id DESC LIMIT 100", (row, index) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", row.getLong("id"));
            item.put("message", row.getString("message"));
            item.put("problemId", row.getLong("problem_id"));
            item.put("createdAt", row.getTimestamp("created_at").toLocalDateTime().toInstant(ZoneOffset.UTC));
            item.put("read", row.getTimestamp("read_at") != null);
            return item;
        }, userId);
        return Map.of("items", items, "unreadCount", jdbc.queryForObject(
                "SELECT COUNT(*) FROM user_notifications WHERE user_id = ? AND read_at IS NULL AND problem_id IN (SELECT id FROM problems WHERE " + scope.problems("", scope.demo(userId)) + ")", Integer.class, userId));
    }

    public void read(long userId, long notificationId) {
        jdbc.update("UPDATE user_notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL AND problem_id IN (SELECT id FROM problems WHERE " + scope.problems("", scope.demo(userId)) + ")",
                LocalDateTime.now(ZoneOffset.UTC), notificationId, userId);
    }
}
