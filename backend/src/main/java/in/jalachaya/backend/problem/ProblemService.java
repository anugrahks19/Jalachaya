package in.jalachaya.backend.problem;

import in.jalachaya.backend.pond.Pond;
import in.jalachaya.backend.pond.PondRepository;
import in.jalachaya.backend.user.Role;
import in.jalachaya.backend.user.User;
import in.jalachaya.backend.user.UserRepository;
import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProblemService {
    private static final Set<String> CATEGORIES = Set.of("PLASTIC_WASTE", "SEWAGE_DISCHARGE",
            "ALGAE_WEED", "DEAD_FISH", "FOUL_SMELL", "BANK_DUMPING", "STAGNANT_WATER", "OTHER");
    private static final Set<String> PRIORITIES = Set.of("LOW", "MEDIUM", "HIGH", "URGENT");
    private static final Set<String> STATUSES = Set.of("SUBMITTED", "ASSIGNED", "IN_PROGRESS",
            "COMPLETION_CLAIMED", "COMMUNITY_VERIFICATION", "VERIFIED", "REOPENED", "REJECTED");
    private final in.jalachaya.backend.common.DataScope scope;
    public boolean currentDemo() { return scope.currentDemo(); }
    private final JdbcTemplate jdbc;
    private final PondRepository ponds;
    private final UserRepository users;
    private final ProblemImageStore images;
    private final WorkflowView workflowViews;
    private final AiJobService aiJobs;

    public ProblemService(JdbcTemplate jdbc, PondRepository ponds, UserRepository users,
            ProblemImageStore images, WorkflowView workflowViews, AiJobService aiJobs, in.jalachaya.backend.common.DataScope scope) {
        this.scope = scope;
        this.jdbc = jdbc;
        this.ponds = ponds;
        this.users = users;
        this.images = images;
        this.workflowViews = workflowViews;
        this.aiJobs = aiJobs;
    }

    /** A citizen can name an unregistered pond; its record and complaint commit together. */
    @Transactional
    public Map<String, Object> report(long actorId, Long pondId, String pondName, String pondWard,
            String category, String description, String landmark, BigDecimal latitude, BigDecimal longitude,
            List<MultipartFile> photos) {
        User reporter = actor(actorId, Role.COMMUNITY_MEMBER);
        if (pondId == null) {
            String name = clean(pondName), ward = clean(pondWard);
            if (name.length() < 3 || name.length() > 150 || ward.isEmpty() || ward.length() > 100)
                throw bad("Enter a pond name (3 to 150 characters) and ward or locality (up to 100 characters).");
            validateCoordinates(latitude, longitude);
            Pond pond = ponds.findByNameIgnoreCaseAndWardIgnoreCaseAndDemo(name, ward, reporter.isDemo()).orElse(null);
            if (pond == null) {
                pond = new Pond(); pond.setName(name); pond.setWard(ward); pond.setDemo(reporter.isDemo());
                pond.setLatitude(latitude); pond.setLongitude(longitude);
                pond.setDescription("Location reported by a citizen. Pond details can be reviewed by the Panchayat.");
                pond = ponds.saveAndFlush(pond);
            }
            pondId = pond.getId();
        }
        return create(actorId, pondId, category, description, landmark, latitude, longitude, photos);
    }

    @Transactional
    public Map<String, Object> create(long actorId, long pondId, String category, String description,
            String landmark, BigDecimal latitude, BigDecimal longitude, List<MultipartFile> photos) {
        User actor = actor(actorId, Role.COMMUNITY_MEMBER);
        scope.requirePond(pondId, actor.isDemo());
        Pond pond = ponds.findById(pondId).filter(Pond::isActive).orElseThrow(() ->
                bad("This pond is not available for reporting."));
        if (category == null || !CATEGORIES.contains(category)) throw bad("Please select a problem category.");
        String cleanDescription = clean(description);
        if (cleanDescription.length() < 15 || cleanDescription.length() > 2000) {
            throw bad("Description must be 15 to 2000 characters.");
        }
        String cleanLandmark = clean(landmark);
        if (cleanLandmark.length() > 255) throw bad("Landmark is too long.");
        if (photos.size() > 3) throw bad("A report can contain at most 3 photos.");
        BigDecimal lat = latitude == null ? pond.getLatitude() : latitude;
        BigDecimal lng = longitude == null ? pond.getLongitude() : longitude;
        validateCoordinates(lat, lng);
        LocalDateTime now = now();
        long id = insert("INSERT INTO problems (pond_id, reporter_id, category, priority, status, "
                        + "description, landmark, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, ?, 'MEDIUM', 'SUBMITTED', ?, ?, ?, ?, ?, ?)",
                pondId, actorId, category, cleanDescription, cleanLandmark, lat, lng, now, now);
        int index = 0;
        for (MultipartFile photo : photos) {
            String path = storeWithRollback(photo);
            jdbc.update("INSERT INTO problem_images (problem_id, path, caption, added_by_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?)", id, path, "Reported photo " + (++index), actorId, now);
        }
        history(id, "SUBMITTED", "Complaint submitted" + (index == 0 ? "." : " with " + index + " photo(s)."), actorId, now);
        aiJobs.enqueueClassification(id);
        return view(id, actor);
    }

    @Transactional
    public Map<String, Object> addImage(long actorId, long id, MultipartFile image, String caption) {
        User actor = actor(actorId, Role.COMMUNITY_MEMBER);
        scope.requireProblem(id, actor.isDemo());
        Map<String, Object> problem = lockedProblem(id);
        if (number(problem, "reporter_id") != actorId) throw forbidden("You can only add photos to your own complaints.");
        String status = string(problem, "status");
        if (status.equals("VERIFIED") || status.equals("REJECTED")) throw conflict("This complaint is closed.");
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM problem_images WHERE problem_id = ?", Integer.class, id);
        if (count != null && count >= 6) throw conflict("This complaint already has 6 photos.");
        String cleanCaption = clean(caption);
        if (cleanCaption.length() > 80) throw bad("Caption must be at most 80 characters.");
        if (cleanCaption.isEmpty()) cleanCaption = "Added later";
        LocalDateTime now = now();
        String path = storeWithRollback(image);
        jdbc.update("INSERT INTO problem_images (problem_id, path, caption, added_by_id, created_at) "
                + "VALUES (?, ?, ?, ?, ?)", id, path, cleanCaption, actorId, now);
        history(id, status, "Citizen added a photo: " + cleanCaption + ".", actorId, now);
        aiJobs.enqueueClassification(id);
        jdbc.update("UPDATE problems SET updated_at = ? WHERE id = ?", now, id);
        return view(id, actor);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(long actorId, boolean mine, Long pondId, String category,
            String priority, String status, boolean overdue, String search) {
        User actor = user(actorId);
        if (mine && actor.getRole() != Role.COMMUNITY_MEMBER) throw forbidden("Only citizens can list their complaints.");
        if (!mine && actor.getRole() != Role.PANCHAYAT_OFFICER) throw forbidden("Only officers can list all complaints.");
        if (category != null && !CATEGORIES.contains(category)) throw bad("Invalid category.");
        if (priority != null && !PRIORITIES.contains(priority)) throw bad("Invalid priority.");
        if (status != null && !STATUSES.contains(status)) throw bad("Invalid status.");
        String sql = mine ? "SELECT id FROM problems WHERE reporter_id = ? AND " + scope.problems("", actor.isDemo()) + " ORDER BY created_at DESC, id DESC"
                : "SELECT id FROM problems WHERE " + scope.problems("", actor.isDemo()) + " ORDER BY created_at DESC, id DESC";
        List<Long> ids = mine ? jdbc.queryForList(sql, Long.class, actorId) : jdbc.queryForList(sql, Long.class);
        String term = clean(search).toLowerCase();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Long id : ids) {
            Map<String, Object> p = view(id, actor);
            if (pondId != null && !pondId.equals(p.get("pondId"))) continue;
            if (category != null && !category.equals(p.get("category"))) continue;
            if (priority != null && !priority.equals(p.get("priority"))) continue;
            if (status != null && !status.equals(p.get("status"))) continue;
            if (overdue && !Boolean.TRUE.equals(p.get("overdue"))) continue;
            if (!term.isEmpty()) {
                String haystack = (p.get("code") + " " + p.get("description") + " " + p.get("landmark")
                        + " " + p.get("pondName") + " " + p.getOrDefault("reporterName", "")).toLowerCase();
                if (!haystack.contains(term)) continue;
            }
            result.add(p);
        }
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(long actorId, long id) {
        User actor = user(actorId);
        scope.requireProblem(id, actor.isDemo());
        Map<String, Object> problem = rawProblem(id);
        boolean allowed = actor.getRole() == Role.PANCHAYAT_OFFICER
                || (actor.getRole() == Role.COMMUNITY_MEMBER && number(problem, "reporter_id") == actorId)
                || (actor.getRole() == Role.FIELD_WORKER && jdbc.queryForObject(
                        "SELECT COUNT(*) FROM tasks WHERE problem_id = ? AND worker_id = ?", Integer.class, id, actorId) > 0);
        if (!allowed) throw forbidden("You do not have permission to view this complaint.");
        return view(id, actor);
    }

    @Transactional
    public Map<String, Object> reject(long actorId, long id, String reason) {
        User actor = actor(actorId, Role.PANCHAYAT_OFFICER);
        scope.requireProblem(id, actor.isDemo());
        Map<String, Object> problem = lockedProblem(id);
        String status = string(problem, "status");
        if (!status.equals("SUBMITTED") && !status.equals("REOPENED")) {
            throw conflict("Only new or reopened complaints can be rejected.");
        }
        String cleanReason = clean(reason);
        if (cleanReason.length() < 5 || cleanReason.length() > 300) throw bad("Give a reason of 5 to 300 characters.");
        LocalDateTime now = now();
        jdbc.update("UPDATE problems SET status = 'REJECTED', rejection_reason = ?, updated_at = ? WHERE id = ?",
                cleanReason, now, id);
        history(id, "REJECTED", "Rejected: " + cleanReason, actorId, now);
        return view(id, actor);
    }

    @Transactional
    public Map<String, Object> assign(long actorId, long problemId, long workerId, Instant deadline,
            String priority, String instructions) {
        User officer = actor(actorId, Role.PANCHAYAT_OFFICER);
        scope.requireProblem(problemId, officer.isDemo());
        Map<String, Object> problem = lockedProblem(problemId);
        String status = string(problem, "status");
        if (!status.equals("SUBMITTED") && !status.equals("REOPENED")) {
            throw conflict("This complaint has already been assigned.");
        }
        User worker = users.findById(workerId).filter(u -> u.isActive() && u.getRole() == Role.FIELD_WORKER && u.isDemo() == officer.isDemo())
                .orElseThrow(() -> bad("Please select a field worker."));
        if (deadline == null || !deadline.isAfter(Instant.now())) throw bad("Deadline must be a future date and time.");
        if (priority == null || !PRIORITIES.contains(priority)) throw bad("Please select a priority.");
        String cleanInstructions = clean(instructions);
        if (cleanInstructions.length() > 400) throw bad("Instructions must be at most 400 characters.");
        LocalDateTime now = now();
        jdbc.update("UPDATE tasks SET active = FALSE WHERE problem_id = ?", problemId);
        insert("INSERT INTO tasks (problem_id, worker_id, assigned_by_id, priority, deadline, instructions, "
                        + "active, created_at) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)",
                problemId, workerId, actorId, priority, LocalDateTime.ofInstant(deadline, ZoneOffset.UTC),
                cleanInstructions, now);
        jdbc.update("UPDATE problems SET priority = ?, status = 'ASSIGNED', updated_at = ?, rejection_reason = NULL WHERE id = ?",
                priority, now, problemId);
        history(problemId, "ASSIGNED", "Assigned to " + worker.getName() + " (" + worker.getTeam()
                + "). Deadline: " + deadline + ".", actorId, now);
        return view(problemId, officer);
    }

    @Transactional(readOnly = true)
    public boolean hasOpenProblems(long pondId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM problems WHERE pond_id = ? "
                + "AND status NOT IN ('VERIFIED', 'REJECTED')", Integer.class, pondId) > 0;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> pondStats(long pondId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalComplaints", jdbc.queryForObject("SELECT COUNT(*) FROM problems WHERE pond_id = ? "
                + "AND status <> 'REJECTED'", Integer.class, pondId));
        result.put("activeComplaints", jdbc.queryForObject("SELECT COUNT(*) FROM problems WHERE pond_id = ? "
                + "AND status NOT IN ('VERIFIED', 'REJECTED')", Integer.class, pondId));
        result.put("resolvedComplaints", jdbc.queryForObject("SELECT COUNT(*) FROM problems WHERE pond_id = ? "
                + "AND status = 'VERIFIED'", Integer.class, pondId));
        List<Map<String, Object>> weights = jdbc.queryForList("SELECT priority, status FROM problems "
                + "WHERE pond_id = ? AND status <> 'REJECTED'", pondId);
        if (weights.isEmpty()) {
            result.put("recoveryPercent", null);
        } else {
            double weightedCompletion = 0;
            int totalWeight = 0;
            for (Map<String, Object> row : weights) {
                int weight = switch (string(row, "priority")) {
                    case "LOW" -> 1;
                    case "HIGH" -> 3;
                    case "URGENT" -> 4;
                    default -> 2;
                };
                double completion = switch (string(row, "status")) {
                    case "REOPENED" -> 0.1;
                    case "ASSIGNED" -> 0.2;
                    case "IN_PROGRESS" -> 0.4;
                    case "COMPLETION_CLAIMED" -> 0.6;
                    case "COMMUNITY_VERIFICATION" -> 0.8;
                    case "VERIFIED" -> 1.0;
                    default -> 0.0;
                };
                weightedCompletion += weight * completion;
                totalWeight += weight;
            }
            boolean allVerified = weights.stream().allMatch(row -> "VERIFIED".equals(row.get("status")));
            result.put("recoveryPercent", Math.min(allVerified ? 100 : 99, (int) Math.round(weightedCompletion / totalWeight * 100)));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> pondTimeline(long pondId) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT id, category, status, created_at, updated_at "
                + "FROM problems WHERE pond_id = ? AND status <> 'REJECTED' ORDER BY created_at DESC, id DESC", pondId);
        return rows.stream().map(row -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("code", code(number(row, "id")));
            item.put("category", row.get("category"));
            item.put("status", row.get("status"));
            item.put("createdAt", instant(row, "created_at"));
            item.put("updatedAt", instant(row, "updated_at"));
            return item;
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> publicActivity() {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT h.id, h.problem_id, h.status, h.note, h.created_at, "
                + "p.pond_id, d.name AS pond_name FROM problem_history h JOIN problems p ON p.id = h.problem_id "
                + "JOIN ponds d ON d.id = p.pond_id WHERE h.system_event = FALSE AND p.status <> 'REJECTED' AND " + scope.problems("p", scope.currentDemo()) + " ORDER BY h.created_at DESC, h.id DESC");
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String status = string(row, "status");
            String note = string(row, "note");
            String publicText = note.startsWith("Citizen added a photo") ? "New photo added"
                    : note.startsWith("Returned to field worker") || note.startsWith("Escalated") ? null
                    : switch (status) {
                case "SUBMITTED" -> "New complaint reported";
                case "ASSIGNED" -> "Field worker assigned";
                case "IN_PROGRESS" -> "Inspection started";
                case "COMPLETION_CLAIMED" -> "Clean-up work submitted";
                case "COMMUNITY_VERIFICATION" -> "Sent to residents for verification";
                case "VERIFIED" -> "Verified as resolved by residents";
                case "REOPENED" -> "Reopened after a resident disputed the work";
                default -> null;
            };
            if (publicText == null) continue;
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("id", number(row, "problem_id") + "-" + number(row, "id"));
            event.put("code", code(number(row, "problem_id")));
            event.put("pondName", row.get("pond_name"));
            event.put("status", status);
            event.put("text", publicText);
            event.put("at", instant(row, "created_at"));
            result.add(event);
            if (result.size() == 6) break;
        }
        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> publicHighlights() {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT p.id, p.category, p.updated_at, d.name AS pond_name, "
                + "e.before_image_path, e.after_image_path, e.remarks FROM problems p "
                + "JOIN ponds d ON d.id = p.pond_id JOIN tasks t ON t.problem_id = p.id AND t.active = TRUE "
                + "JOIN task_evidence e ON e.task_id = t.id "
                + "WHERE p.status = 'VERIFIED' AND " + scope.problems("p", scope.currentDemo()) + " AND e.id = "
                + "(SELECT MAX(e2.id) FROM task_evidence e2 WHERE e2.task_id = t.id) "
                + "ORDER BY p.updated_at DESC, p.id DESC LIMIT 2");
        return rows.stream().map(row -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("code", code(number(row, "id")));
            item.put("pondName", row.get("pond_name"));
            item.put("category", row.get("category"));
            item.put("verifiedAt", instant(row, "updated_at"));
            item.put("beforeImageUrl", row.get("before_image_path"));
            item.put("afterImageUrl", row.get("after_image_path"));
            item.put("remarks", row.get("remarks"));
            return item;
        }).toList();
    }

    @Transactional(readOnly = true)
    public int openTasks(long workerId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM tasks t JOIN problems p ON p.id = t.problem_id "
                + "WHERE t.worker_id = ? AND t.active = TRUE AND " + scope.problems("p", scope.demo(workerId)) + " AND p.status IN ('ASSIGNED', 'IN_PROGRESS')",
                Integer.class, workerId);
    }

    private Map<String, Object> view(long id, User viewer) {
        Map<String, Object> row = rawProblem(id);
        Pond pond = ponds.findById(number(row, "pond_id")).orElseThrow();
        User reporter = users.findById(number(row, "reporter_id")).orElseThrow();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("code", code(id));
        out.put("pondId", pond.getId());
        out.put("pondName", pond.getName());
        out.put("reporterId", reporter.getId());
        if (viewer.getRole() != Role.COMMUNITY_MEMBER) out.put("reporterName", reporter.getName());
        if (viewer.getRole() == Role.PANCHAYAT_OFFICER) out.put("reporterPhone", reporter.getPhone());
        out.put("category", row.get("category"));
        out.put("priority", row.get("priority"));
        out.put("status", row.get("status"));
        out.put("description", row.get("description"));
        out.put("landmark", row.get("landmark"));
        out.put("latitude", row.get("latitude"));
        out.put("longitude", row.get("longitude"));
        out.put("rejectionReason", row.get("rejection_reason"));
        if (viewer.getRole() == Role.PANCHAYAT_OFFICER) {
            out.put("aiClassification", aiJobs.classification(id));
        }
        out.put("createdAt", instant(row, "created_at"));
        out.put("updatedAt", instant(row, "updated_at"));
        List<Map<String, Object>> photoRows = jdbc.queryForList("SELECT i.path, i.caption, i.created_at, i.added_by_id, "
                + "u.name, u.role FROM problem_images i JOIN app_users u ON u.id = i.added_by_id "
                + "WHERE i.problem_id = ? ORDER BY i.id", id);
        out.put("images", photoRows.stream().map(photo -> {
            Map<String, Object> image = new LinkedHashMap<>();
            image.put("url", photo.get("path"));
            image.put("caption", photo.get("caption"));
            image.put("addedBy", viewer.getRole() == Role.COMMUNITY_MEMBER
                    ? number(photo, "added_by_id") == viewer.getId() ? "You" : "Community member"
                    : photo.get("name"));
            image.put("role", photo.get("role"));
            image.put("at", instant(photo, "created_at"));
            return image;
        }).toList());
        List<Map<String, Object>> historyRows = jdbc.queryForList("SELECT h.status, h.note, h.created_at, "
                + "CASE WHEN h.system_event THEN 'Automatic deadline monitor' ELSE u.name END AS name, CASE WHEN h.system_event THEN 'SYSTEM' ELSE u.role END AS role FROM problem_history h JOIN app_users u ON u.id = h.actor_id "
                + "WHERE h.problem_id = ? ORDER BY h.id", id);
        out.put("history", historyRows.stream().map(item -> {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("status", item.get("status"));
            String note = string(item, "note");
            if (viewer.getRole() == Role.COMMUNITY_MEMBER && !"SYSTEM".equals(item.get("role")) && string(item, "status").equals("ASSIGNED")) {
                note = "Field worker assigned.";
            } else if (viewer.getRole() == Role.COMMUNITY_MEMBER && note.startsWith("Returned to field worker")) {
                note = "Work returned to field team.";
            } else if (viewer.getRole() == Role.COMMUNITY_MEMBER && note.startsWith("Escalated to level")) {
                note = "Field task escalated.";
            }
            event.put("note", note);
            String by = string(item, "name");
            if (viewer.getRole() == Role.COMMUNITY_MEMBER) {
                String role = string(item, "role");
                by = role.equals("SYSTEM") ? "Automatic deadline monitor" : role.equals("FIELD_WORKER") ? "Field team" : role.equals("PANCHAYAT_OFFICER")
                        ? "Panchayat office" : by.equals(viewer.getName()) ? "You" : "Community member";
            }
            event.put("by", by);
            if (viewer.getRole() != Role.COMMUNITY_MEMBER) event.put("role", item.get("role"));
            event.put("at", instant(item, "created_at"));
            return event;
        }).toList());
        List<Map<String, Object>> taskRows = viewer.getRole() == Role.FIELD_WORKER
                ? jdbc.queryForList("SELECT t.* FROM tasks t WHERE t.problem_id = ? AND t.active = TRUE "
                        + "AND t.worker_id = ? ORDER BY t.id DESC", id, viewer.getId())
                : jdbc.queryForList("SELECT t.* FROM tasks t WHERE t.problem_id = ? AND t.active = TRUE "
                        + "ORDER BY t.id DESC", id);
        Map<String, Object> task = taskRows.isEmpty() ? null : taskRows.get(0);
        out.put("overdue", task != null && Set.of("ASSIGNED", "IN_PROGRESS").contains(string(row, "status"))
                && instant(task, "deadline").isBefore(Instant.now()));
        if (task == null) out.put("task", null);
        else if (viewer.getRole() == Role.COMMUNITY_MEMBER) {
            Map<String, Object> publicTask = new LinkedHashMap<>();
            publicTask.put("id", number(task, "id"));
            publicTask.put("deadline", instant(task, "deadline"));
            publicTask.put("evidence", Set.of("COMMUNITY_VERIFICATION", "VERIFIED")
                    .contains(string(row, "status")) ? workflowViews.evidence(number(task, "id")) : null);
            out.put("task", publicTask);
        } else {
            out.put("task", workflowViews.task(number(task, "id")));
        }
        if (viewer.getRole() == Role.PANCHAYAT_OFFICER) {
            out.put("previousTaskCount", jdbc.queryForObject(
                    "SELECT COUNT(*) FROM tasks WHERE problem_id = ? AND active = FALSE", Integer.class, id));
            out.put("communityVerifications", workflowViews.communityVerifications(id));
        }
        return out;
    }

    private Map<String, Object> rawProblem(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM problems WHERE id = ?", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Complaint not found.");
        return rows.get(0);
    }

    private Map<String, Object> lockedProblem(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM problems WHERE id = ? FOR UPDATE", id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Complaint not found.");
        return rows.get(0);
    }

    private long insert(String sql, Object... args) {
        GeneratedKeyHolder key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, new String[]{"id"});
            for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]);
            return statement;
        }, key);
        if (key.getKey() == null) throw new IllegalStateException("Database did not return a new ID.");
        return key.getKey().longValue();
    }

    private void history(long problemId, String status, String note, long actorId, LocalDateTime at) {
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
        User actor = user(id);
        if (actor.getRole() != role) throw forbidden("You do not have permission to do this.");
        return actor;
    }

    private User user(long id) {
        return users.findById(id).filter(User::isActive).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue."));
    }

    private long number(Map<String, Object> row, String key) { return ((Number) row.get(key)).longValue(); }
    private String string(Map<String, Object> row, String key) { return (String) row.get(key); }
    private Instant instant(Map<String, Object> row, String key) {
        Object value = row.get(key);
        if (value instanceof Timestamp timestamp) return timestamp.toLocalDateTime().toInstant(ZoneOffset.UTC);
        if (value instanceof LocalDateTime dateTime) return dateTime.toInstant(ZoneOffset.UTC);
        throw new IllegalStateException("Unexpected database timestamp: " + key);
    }
    private LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    private String code(long id) { return "JC-" + (1000 + id); }
    private String clean(String value) { return value == null ? "" : value.trim(); }
    private void validateCoordinates(BigDecimal lat, BigDecimal lng) {
        if (lat == null && lng == null) return;
        if (lat == null || lng == null) throw bad("Provide both latitude and longitude, or leave both blank.");
        if (lat.compareTo(BigDecimal.valueOf(-90)) < 0 || lat.compareTo(BigDecimal.valueOf(90)) > 0
                || lng.compareTo(BigDecimal.valueOf(-180)) < 0 || lng.compareTo(BigDecimal.valueOf(180)) > 0) {
            throw bad("Invalid coordinates.");
        }
    }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException forbidden(String message) { return new ResponseStatusException(HttpStatus.FORBIDDEN, message); }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
