package in.jalachaya.backend.problem;

import in.jalachaya.backend.user.Role;
import in.jalachaya.backend.user.User;
import in.jalachaya.backend.user.UserRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OperationsService {
    private static final List<String> CATEGORIES = List.of("PLASTIC_WASTE", "SEWAGE_DISCHARGE",
            "ALGAE_WEED", "DEAD_FISH", "FOUL_SMELL", "BANK_DUMPING", "STAGNANT_WATER", "OTHER");
    private static final List<String> STATUSES = List.of("SUBMITTED", "ASSIGNED", "IN_PROGRESS",
            "COMPLETION_CLAIMED", "COMMUNITY_VERIFICATION", "VERIFIED", "REOPENED", "REJECTED");
    private static final Map<Integer, String> DESTINATIONS = Map.of(1, "Ward member",
            2, "Panchayat President", 3, "Block Development Officer");

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final ProblemService problems;

    public OperationsService(JdbcTemplate jdbc, UserRepository users, ProblemService problems) {
        this.jdbc = jdbc;
        this.users = users;
        this.problems = problems;
    }

    @Transactional
    public Map<String, Object> escalate(long actorId, long taskId, String reason) {
        officer(actorId);
        List<Map<String, Object>> ids = jdbc.queryForList("SELECT problem_id FROM tasks WHERE id = ?", taskId);
        if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found.");
        long problemId = ((Number) ids.get(0).get("problem_id")).longValue();
        // Lock in the same order as the field-work workflow to serialize status and escalation changes.
        Map<String, Object> problem = jdbc.queryForMap("SELECT status FROM problems WHERE id = ? FOR UPDATE", problemId);
        Map<String, Object> task = jdbc.queryForMap("SELECT active, deadline FROM tasks WHERE id = ? FOR UPDATE", taskId);
        String status = (String) problem.get("status");
        if (!Boolean.TRUE.equals(task.get("active")) || !Set.of("ASSIGNED", "IN_PROGRESS").contains(status)
                || !WorkflowView.instant(task, "deadline").isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only overdue tasks can be escalated.");
        }
        int level = jdbc.queryForObject("SELECT COUNT(*) FROM task_escalations WHERE task_id = ?",
                Integer.class, taskId) + 1;
        if (level > 3) throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This task is already at the highest escalation level.");
        String cleanReason = reason == null ? "" : reason.trim();
        if (cleanReason.length() < 5 || cleanReason.length() > 300) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give a reason of 5 to 300 characters.");
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        jdbc.update("INSERT INTO task_escalations (task_id, level, escalated_to, reason, officer_id, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?)", taskId, level, DESTINATIONS.get(level), cleanReason, actorId, now);
        jdbc.update("INSERT INTO problem_history (problem_id, status, note, actor_id, created_at) "
                        + "VALUES (?, ?, ?, ?, ?)", problemId, status,
                "Escalated to level " + level + " (" + DESTINATIONS.get(level) + "): " + cleanReason,
                actorId, now);
        jdbc.update("UPDATE problems SET updated_at = ? WHERE id = ?", now, problemId);
        return problems.get(actorId, problemId);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> summary(long actorId) {
        officer(actorId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalPonds", count("SELECT COUNT(*) FROM ponds WHERE active = TRUE"));
        result.put("activeProblems", count("SELECT COUNT(*) FROM problems WHERE status NOT IN ('VERIFIED', 'REJECTED')"));
        result.put("newComplaints", count("SELECT COUNT(*) FROM problems WHERE status IN ('SUBMITTED', 'REOPENED')"));
        result.put("inProgress", count("SELECT COUNT(*) FROM problems WHERE status IN ('ASSIGNED', 'IN_PROGRESS')"));
        result.put("overdue", jdbc.queryForObject("SELECT COUNT(*) FROM problems p JOIN tasks t ON t.problem_id = p.id "
                + "WHERE t.active = TRUE AND p.status IN ('ASSIGNED', 'IN_PROGRESS') AND t.deadline < ?",
                Integer.class, LocalDateTime.now(ZoneOffset.UTC)));
        result.put("awaitingReview", count("SELECT COUNT(*) FROM problems WHERE status = 'COMPLETION_CLAIMED'"));
        result.put("awaitingVerification", count("SELECT COUNT(*) FROM problems WHERE status = 'COMMUNITY_VERIFICATION'"));
        result.put("verified", count("SELECT COUNT(*) FROM problems WHERE status = 'VERIFIED'"));
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> analytics(long actorId) {
        officer(actorId);
        Map<String, Integer> byCategory = new LinkedHashMap<>();
        CATEGORIES.forEach(category -> byCategory.put(category, 0));
        jdbc.queryForList("SELECT category, COUNT(*) AS total FROM problems WHERE status <> 'REJECTED' "
                + "GROUP BY category").forEach(row -> byCategory.put((String) row.get("category"),
                ((Number) row.get("total")).intValue()));
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        STATUSES.forEach(status -> byStatus.put(status, 0));
        jdbc.queryForList("SELECT status, COUNT(*) AS total FROM problems GROUP BY status")
                .forEach(row -> byStatus.put((String) row.get("status"),
                        ((Number) row.get("total")).intValue()));
        List<Map<String, Object>> ponds = jdbc.queryForList("SELECT id, name FROM ponds WHERE active = TRUE "
                + "ORDER BY name, id").stream().map(pond -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", pond.get("id"));
            item.put("name", pond.get("name"));
            item.putAll(problems.pondStats(((Number) pond.get("id")).longValue()));
            return item;
        }).toList();
        return Map.of("byCategory", byCategory, "byStatus", byStatus, "ponds", ponds);
    }

    private int count(String query) { return jdbc.queryForObject(query, Integer.class); }

    private User officer(long actorId) {
        User actor = users.findById(actorId).filter(User::isActive).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue."));
        if (actor.getRole() != Role.PANCHAYAT_OFFICER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only officers can view operations.");
        }
        return actor;
    }
}
