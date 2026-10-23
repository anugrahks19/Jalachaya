package in.jalachaya.backend.problem;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class WorkflowView {
    private final in.jalachaya.backend.common.DataScope scope;
    private final JdbcTemplate jdbc;
    private final AiJobService aiJobs;

    public WorkflowView(JdbcTemplate jdbc, AiJobService aiJobs, in.jalachaya.backend.common.DataScope scope) {
        this.scope = scope;
        this.jdbc = jdbc;
        this.aiJobs = aiJobs;
    }

    public Map<String, Object> task(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT t.*, u.name AS worker_name, u.team AS worker_team "
                + "FROM tasks t JOIN app_users u ON u.id = t.worker_id WHERE t.id = ?", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found.");
        Map<String, Object> row = rows.get(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", number(row, "id"));
        result.put("problemId", number(row, "problem_id"));
        result.put("workerId", number(row, "worker_id"));
        result.put("workerName", row.get("worker_name"));
        result.put("workerTeam", row.get("worker_team"));
        result.put("priority", row.get("priority"));
        result.put("deadline", instant(row, "deadline"));
        result.put("instructions", row.get("instructions"));
        result.put("active", row.get("active"));
        result.put("createdAt", instant(row, "created_at"));
        result.put("startedAt", optionalInstant(row, "started_at"));
        List<Map<String, Object>> notes = jdbc.queryForList("SELECT text, image_path, created_at "
                + "FROM task_notes WHERE task_id = ? ORDER BY id", id);
        result.put("notes", notes.stream().map(note -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("text", note.get("text"));
            item.put("imageUrl", note.get("image_path"));
            item.put("at", instant(note, "created_at"));
            return item;
        }).toList());
        result.put("evidence", evidence(id));
        Long evidenceId = jdbc.queryForObject("SELECT MAX(id) FROM task_evidence WHERE task_id = ?",
                Long.class, id);
        result.put("aiVerification", evidenceId == null ? null : aiJobs.verification(evidenceId));
        List<Map<String, Object>> reviews = jdbc.queryForList("SELECT decision, comment, created_at "
                + "FROM task_reviews WHERE task_id = ? ORDER BY id DESC LIMIT 1", id);
        if (reviews.isEmpty()) result.put("review", null);
        else {
            Map<String, Object> review = new LinkedHashMap<>();
            review.put("decision", reviews.get(0).get("decision"));
            review.put("comment", reviews.get(0).get("comment"));
            review.put("at", instant(reviews.get(0), "created_at"));
            result.put("review", review);
        }
        List<Map<String, Object>> escalations = jdbc.queryForList("SELECT e.level, e.escalated_to, "
                + "e.reason, e.created_at, u.name FROM task_escalations e "
                + "JOIN app_users u ON u.id = e.officer_id WHERE e.task_id = ? ORDER BY e.level", id);
        result.put("escalationLevel", escalations.isEmpty() ? 0
                : ((Number) escalations.get(escalations.size() - 1).get("level")).intValue());
        result.put("deadlineStage", jdbc.queryForObject("SELECT COALESCE(MAX(level),0) FROM deadline_events WHERE task_id=?",Integer.class,id));
        result.put("deadlineAlerts",jdbc.queryForList("SELECT e.level,e.destination,e.message,a.status AS delivery_status FROM deadline_events e JOIN authority_deliveries a ON a.event_id=e.id WHERE e.task_id=? ORDER BY e.level",id));
        result.put("escalations", escalations.stream().map(escalation -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("level", escalation.get("level"));
            item.put("escalatedTo", escalation.get("escalated_to"));
            item.put("reason", escalation.get("reason"));
            item.put("by", escalation.get("name"));
            item.put("at", instant(escalation, "created_at"));
            return item;
        }).toList());
        return result;
    }

    public Map<String, Object> evidence(long taskId) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT before_image_path, after_image_path, "
                + "remarks, submitted_at FROM task_evidence WHERE task_id = ? ORDER BY id DESC LIMIT 1", taskId);
        if (rows.isEmpty()) return null;
        Map<String, Object> row = rows.get(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("beforeImageUrl", row.get("before_image_path"));
        result.put("afterImageUrl", row.get("after_image_path"));
        result.put("remarks", row.get("remarks"));
        result.put("submittedAt", instant(row, "submitted_at"));
        return result;
    }

    public List<Map<String, Object>> communityVerifications(long problemId) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT v.decision, v.comment, v.image_path, "
                + "v.created_at, u.name FROM community_verifications v JOIN app_users u ON u.id = v.user_id "
                + "WHERE v.problem_id = ? ORDER BY v.id", problemId);
        return rows.stream().map(row -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("decision", row.get("decision"));
            item.put("comment", row.get("comment"));
            item.put("imageUrl", row.get("image_path"));
            item.put("userName", row.get("name"));
            item.put("createdAt", instant(row, "created_at"));
            return item;
        }).toList();
    }

    public List<Map<String, Object>> workerTasks(long workerId) {
        List<Long> ids = jdbc.queryForList("SELECT t.id FROM tasks t JOIN problems p ON p.id = t.problem_id WHERE t.worker_id = ? AND " + scope.problems("p", scope.demo(workerId)) + " "
                + "ORDER BY active DESC, deadline ASC, id DESC", Long.class, workerId);
        return ids.stream().map(id -> workerTask(id)).toList();
    }

    public Map<String, Object> workerTask(long taskId) {
        Map<String, Object> task = task(taskId);
        long problemId = ((Number) task.get("problemId")).longValue();
        Map<String, Object> p = jdbc.queryForMap("SELECT p.*, d.name AS pond_name FROM problems p "
                + "JOIN ponds d ON d.id = p.pond_id WHERE p.id = ?", problemId);
        List<Map<String, Object>> images = jdbc.queryForList("SELECT path, caption, created_at "
                + "FROM problem_images WHERE problem_id = ? ORDER BY id", problemId);
        Map<String, Object> problem = new LinkedHashMap<>();
        problem.put("id", problemId);
        problem.put("code", "JC-" + (1000 + problemId));
        problem.put("category", p.get("category"));
        problem.put("description", p.get("description"));
        problem.put("landmark", p.get("landmark"));
        problem.put("latitude", p.get("latitude"));
        problem.put("longitude", p.get("longitude"));
        problem.put("images", images.stream().map(image -> Map.of(
                "url", image.get("path"), "caption", image.get("caption"),
                "at", instant(image, "created_at"))).toList());
        problem.put("status", p.get("status"));
        problem.put("createdAt", instant(p, "created_at"));
        task.put("problem", problem);
        task.put("pondName", p.get("pond_name"));
        String status = (String) p.get("status");
        boolean active = Boolean.TRUE.equals(task.get("active"));
        task.put("stage", active ? status : "CLOSED");
        task.put("overdue", active && (status.equals("ASSIGNED") || status.equals("IN_PROGRESS"))
                && ((Instant) task.get("deadline")).isBefore(Instant.now()));
        return task;
    }

    static long number(Map<String, Object> row, String key) { return ((Number) row.get(key)).longValue(); }
    static Instant instant(Map<String, Object> row, String key) {
        Object value = row.get(key);
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime().toInstant(ZoneOffset.UTC);
        if (value instanceof LocalDateTime dateTime) return dateTime.toInstant(ZoneOffset.UTC);
        throw new IllegalStateException("Unexpected database timestamp: " + key);
    }
    static Instant optionalInstant(Map<String, Object> row, String key) {
        return row.get(key) == null ? null : instant(row, key);
    }
}
