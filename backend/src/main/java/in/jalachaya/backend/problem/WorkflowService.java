package in.jalachaya.backend.problem;

import in.jalachaya.backend.user.Role;
import in.jalachaya.backend.user.User;
import in.jalachaya.backend.user.UserRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class WorkflowService {
    private final in.jalachaya.backend.common.DataScope scope;
    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final ProblemImageStore images;
    private final WorkflowView views;
    private final AiJobService aiJobs;

    public WorkflowService(JdbcTemplate jdbc, UserRepository users, ProblemImageStore images, WorkflowView views,
            AiJobService aiJobs, in.jalachaya.backend.common.DataScope scope) {
        this.scope = scope;
        this.jdbc = jdbc;
        this.users = users;
        this.images = images;
        this.views = views;
        this.aiJobs = aiJobs;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> myTasks(long actorId, boolean mine) {
        actor(actorId, Role.FIELD_WORKER);
        if (!mine) throw bad("Use mine=true to list your tasks.");
        return views.workerTasks(actorId);
    }

    @Transactional
    public Map<String, Object> start(long actorId, long taskId, String status) {
        actor(actorId, Role.FIELD_WORKER);
        if (!"IN_PROGRESS".equals(status)) throw bad("Only IN_PROGRESS is allowed.");
        requireScope(actorId, taskId);
        LockedTask locked = lock(taskId);
        ownActive(locked, actorId);
        if (!locked.status().equals("ASSIGNED")) throw conflict("This task has already been started.");
        LocalDateTime now = now();
        jdbc.update("UPDATE tasks SET started_at = ? WHERE id = ?", now, taskId);
        transition(locked.problemId(), "IN_PROGRESS", "Inspection started.", actorId, now);
        return views.task(taskId);
    }

    @Transactional
    public Map<String, Object> note(long actorId, long taskId, String text, MultipartFile image) {
        actor(actorId, Role.FIELD_WORKER);
        requireScope(actorId, taskId);
        LockedTask locked = lock(taskId);
        ownActive(locked, actorId);
        if (!locked.status().equals("ASSIGNED") && !locked.status().equals("IN_PROGRESS")) {
            throw conflict("Notes can only be added while the task is open.");
        }
        String clean = clean(text);
        if (clean.length() < 3 || clean.length() > 1000) throw bad("Note must be 3 to 1000 characters.");
        String path = image == null || image.isEmpty() ? null : storeWithRollback(image);
        jdbc.update("INSERT INTO task_notes (task_id, text, image_path, created_at) VALUES (?, ?, ?, ?)",
                taskId, clean, path, now());
        return views.task(taskId);
    }

    @Transactional
    public Map<String, Object> complete(long actorId, long taskId, MultipartFile before,
            MultipartFile after, String remarks) {
        actor(actorId, Role.FIELD_WORKER);
        requireScope(actorId, taskId);
        LockedTask locked = lock(taskId);
        ownActive(locked, actorId);
        if (!locked.status().equals("IN_PROGRESS")) {
            throw conflict("Start the inspection before submitting completion, or this completion was already submitted.");
        }
        String cleanRemarks = clean(remarks);
        if (cleanRemarks.length() < 10 || cleanRemarks.length() > 1000) {
            throw bad("Remarks must describe the work in 10 to 1000 characters.");
        }
        if (before == null || before.isEmpty() || after == null || after.isEmpty()) {
            throw bad("Before and after photos are required.");
        }
        String beforePath = storeWithRollback(before);
        String afterPath = storeWithRollback(after);
        LocalDateTime now = now();
        jdbc.update("INSERT INTO task_evidence (task_id, before_image_path, after_image_path, remarks, submitted_at) "
                + "VALUES (?, ?, ?, ?, ?)", taskId, beforePath, afterPath, cleanRemarks, now);
        long evidenceId = jdbc.queryForObject("SELECT MAX(id) FROM task_evidence WHERE task_id = ?",
                Long.class, taskId);
        aiJobs.enqueueVerification(locked.problemId(), taskId, evidenceId);
        transition(locked.problemId(), "COMPLETION_CLAIMED", "Work completed and evidence submitted.", actorId, now);
        return views.task(taskId);
    }

    @Transactional
    public long review(long actorId, long taskId, String decision, String comment) {
        actor(actorId, Role.PANCHAYAT_OFFICER);
        requireScope(actorId, taskId);
        LockedTask locked = lock(taskId);
        if (!locked.active() || !locked.status().equals("COMPLETION_CLAIMED")) {
            throw conflict("There is no submitted work to review.");
        }
        if (!"FORWARD".equals(decision) && !"RETURN".equals(decision)) throw bad("Unknown review decision.");
        String cleanComment = clean(comment);
        if (cleanComment.length() > 300) throw bad("Comment must be at most 300 characters.");
        if (decision.equals("RETURN") && cleanComment.length() < 5) {
            throw bad("Explain what the worker needs to redo.");
        }
        LocalDateTime now = now();
        jdbc.update("INSERT INTO task_reviews (task_id, officer_id, decision, comment, created_at) "
                + "VALUES (?, ?, ?, ?, ?)", taskId, actorId, decision, cleanComment, now);
        if (decision.equals("FORWARD")) {
            transition(locked.problemId(), "COMMUNITY_VERIFICATION",
                    "Evidence reviewed. Sent for community verification.", actorId, now);
        } else {
            transition(locked.problemId(), "IN_PROGRESS", "Returned to field worker: " + cleanComment,
                    actorId, now);
        }
        return locked.problemId();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> pending(long actorId) {
        actor(actorId, Role.COMMUNITY_MEMBER);
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT p.*, d.name AS pond_name, t.id AS task_id "
                + "FROM problems p JOIN ponds d ON d.id = p.pond_id JOIN tasks t ON t.problem_id = p.id "
                + "AND t.active = TRUE WHERE p.status = 'COMMUNITY_VERIFICATION' AND " + scope.problems("p", scope.demo(actorId)) + " "
                + "ORDER BY p.created_at DESC, p.id DESC");
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            long taskId = number(row, "task_id");
            List<Map<String, Object>> own = jdbc.queryForList("SELECT decision, comment FROM community_verifications "
                    + "WHERE task_id = ? AND user_id = ?", taskId, actorId);
            Map<String, Object> item = new LinkedHashMap<>();
            long problemId = number(row, "id");
            item.put("problemId", problemId);
            item.put("code", "JC-" + (1000 + problemId));
            item.put("pondName", row.get("pond_name"));
            item.put("category", row.get("category"));
            item.put("description", row.get("description"));
            item.put("landmark", row.get("landmark"));
            item.put("reportedByMe", number(row, "reporter_id") == actorId);
            item.put("taskId", taskId);
            item.put("evidence", views.evidence(taskId));
            item.put("myResponse", own.isEmpty() ? null : Map.of(
                    "decision", own.get(0).get("decision"), "comment", own.get(0).get("comment")));
            result.add(item);
        }
        return result;
    }

    @Transactional
    public Map<String, Object> communityVerify(long actorId, long taskId, String decision,
            String comment, MultipartFile image) {
        actor(actorId, Role.COMMUNITY_MEMBER);
        requireScope(actorId, taskId);
        LockedTask locked = lock(taskId);
        if (!locked.active() || !locked.status().equals("COMMUNITY_VERIFICATION")) {
            throw conflict("This work is no longer waiting for verification.");
        }
        if (locked.workerId() == actorId) throw forbidden("You cannot verify your own work.");
        if (!"CONFIRM".equals(decision) && !"DISPUTE".equals(decision)) throw bad("Unknown decision.");
        String cleanComment = clean(comment);
        if (cleanComment.length() > 500) throw bad("Comment must be at most 500 characters.");
        if (decision.equals("DISPUTE") && cleanComment.length() < 5) {
            throw bad("Explain why the problem is not resolved.");
        }
        if (jdbc.queryForObject("SELECT COUNT(*) FROM community_verifications WHERE task_id = ? AND user_id = ?",
                Integer.class, taskId, actorId) > 0) throw conflict("You have already responded to this verification.");
        String path = null;
        if (image != null && !image.isEmpty()) {
            if (jdbc.queryForObject("SELECT COUNT(*) FROM problem_images WHERE problem_id = ?", Integer.class,
                    locked.problemId()) >= 6) throw conflict("This complaint already has 6 photos.");
            path = storeWithRollback(image);
        }
        LocalDateTime now = now();
        try {
            jdbc.update("INSERT INTO community_verifications (task_id, problem_id, user_id, decision, comment, "
                    + "image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", taskId, locked.problemId(),
                    actorId, decision, cleanComment, path, now);
        } catch (DuplicateKeyException exception) {
            throw conflict("You have already responded to this verification.");
        }
        if (path != null) {
            jdbc.update("INSERT INTO problem_images (problem_id, path, caption, added_by_id, created_at) "
                    + "VALUES (?, ?, ?, ?, ?)", locked.problemId(), path,
                    decision.equals("DISPUTE") ? "Photo from dispute" : "Photo from verification", actorId, now);
        }
        if (decision.equals("DISPUTE")) {
            jdbc.update("UPDATE tasks SET active = FALSE WHERE id = ?", taskId);
            transition(locked.problemId(), "REOPENED", "Disputed by community: " + cleanComment, actorId, now);
        } else {
            transition(locked.problemId(), "VERIFIED", "Confirmed by community"
                    + (cleanComment.isEmpty() ? "." : ": " + cleanComment), actorId, now);
        }
        return Map.of("status", decision.equals("DISPUTE") ? "REOPENED" : "VERIFIED");
    }

    private void requireScope(long actorId, long taskId) {
        var ids = jdbc.queryForList("SELECT problem_id FROM tasks WHERE id = ?", Long.class, taskId);
        if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found.");
        scope.requireProblem(ids.get(0), scope.demo(actorId));
    }

    private LockedTask lock(long taskId) {
        List<Map<String, Object>> before = jdbc.queryForList("SELECT problem_id FROM tasks WHERE id = ?", taskId);
        if (before.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Task not found.");
        long problemId = number(before.get(0), "problem_id");
        Map<String, Object> problem = jdbc.queryForMap("SELECT status FROM problems WHERE id = ? FOR UPDATE", problemId);
        Map<String, Object> task = jdbc.queryForMap("SELECT * FROM tasks WHERE id = ? FOR UPDATE", taskId);
        return new LockedTask(problemId, number(task, "worker_id"), Boolean.TRUE.equals(task.get("active")),
                (String) problem.get("status"));
    }

    private void ownActive(LockedTask task, long actorId) {
        if (task.workerId() != actorId) throw forbidden("This task is assigned to another worker.");
        if (!task.active()) throw conflict("This task is closed.");
    }

    private void transition(long problemId, String status, String note, long actorId, LocalDateTime at) {
        jdbc.update("UPDATE problems SET status = ?, updated_at = ? WHERE id = ?", status, at, problemId);
        jdbc.update("INSERT INTO problem_history (problem_id, status, note, actor_id, created_at) "
                + "VALUES (?, ?, ?, ?, ?)", problemId, status, note, actorId, at);
    }

    private String storeWithRollback(MultipartFile image) {
        String path = images.store(image);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) images.remove(path);
            }
        });
        return path;
    }

    private User actor(long id, Role role) {
        User user = users.findById(id).filter(User::isActive).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue."));
        if (user.getRole() != role) throw forbidden("You do not have permission to do this.");
        return user;
    }

    private static long number(Map<String, Object> row, String key) { return ((Number) row.get(key)).longValue(); }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException forbidden(String message) { return new ResponseStatusException(HttpStatus.FORBIDDEN, message); }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private record LockedTask(long problemId, long workerId, boolean active, String status) {}
}
