package in.jalachaya.backend.problem;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class AiJobService {
    private static final Logger log = LoggerFactory.getLogger(AiJobService.class);
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final HttpClient http;
    private final boolean enabled;
    private final String serviceUrl;
    private final String backendUrl;
    private final Duration timeout;

    public AiJobService(JdbcTemplate jdbc, ObjectMapper json,
            @Value("${app.ai.enabled}") boolean enabled,
            @Value("${app.ai.service-url}") String serviceUrl,
            @Value("${app.ai.backend-url}") String backendUrl,
            @Value("${app.ai.timeout-ms}") long timeoutMs) {
        this.jdbc = jdbc;
        this.json = json;
        this.enabled = enabled;
        this.serviceUrl = stripSlash(serviceUrl);
        this.backendUrl = stripSlash(backendUrl);
        this.timeout = Duration.ofMillis(Math.max(500, timeoutMs));
        this.http = HttpClient.newBuilder().connectTimeout(this.timeout).build();
    }

    public void enqueueClassification(long problemId) {
        enqueue("CLASSIFY:" + problemId, "CLASSIFY", problemId, null, null);
    }

    public void enqueueVerification(long problemId, long taskId, long evidenceId) {
        enqueue("VERIFY:" + evidenceId, "VERIFY_COMPLETION", problemId, taskId, evidenceId);
    }

    private void enqueue(String key, String kind, long problemId, Long taskId, Long evidenceId) {
        LocalDateTime now = now();
        jdbc.update("INSERT INTO ai_jobs (operation_key, kind, problem_id, task_id, evidence_id, status, "
                        + "attempts, next_attempt_at, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)",
                key, kind, problemId, taskId, evidenceId, now, now, now);
    }

    public Map<String, Object> classification(long problemId) {
        return job("SELECT * FROM ai_jobs WHERE operation_key = ?", "CLASSIFY:" + problemId);
    }

    public Map<String, Object> verification(long evidenceId) {
        return job("SELECT * FROM ai_jobs WHERE operation_key = ?", "VERIFY:" + evidenceId);
    }

    private Map<String, Object> job(String sql, String key) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, key);
        if (rows.isEmpty()) return null;
        Map<String, Object> row = rows.get(0);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", row.get("status"));
        result.put("attempts", row.get("attempts"));
        result.put("modelVersion", row.get("model_version"));
        result.put("confidence", row.get("confidence"));
        result.put("result", parse((String) row.get("result_json")));
        result.put("warnings", parse((String) row.get("warnings_json")));
        result.put("lastError", row.get("last_error"));
        return result;
    }

    private JsonNode parse(String value) {
        if (value == null) return null;
        try { return json.readTree(value); }
        catch (Exception exception) { throw new IllegalStateException("Stored AI result is invalid JSON.", exception); }
    }

    @Scheduled(fixedDelayString = "${app.ai.poll-ms}", initialDelayString = "${app.ai.poll-ms}")
    public void scheduledProcessDue() {
        if (!enabled) return;
        processDue();
    }

    public void processDue() {
        LocalDateTime now = now();
        LocalDateTime stale = now.minusMinutes(10);
        List<Long> ids = jdbc.queryForList("SELECT id FROM ai_jobs WHERE "
                + "(status = 'PENDING' AND next_attempt_at <= ?) "
                + "OR (status = 'PROCESSING' AND updated_at < ?) ORDER BY id LIMIT 10",
                Long.class, now, stale);
        for (long id : ids) {
            try { process(id); }
            catch (Exception exception) { log.warn("AI job {} could not be processed", id, exception); }
        }
    }

    private void process(long id) {
        LocalDateTime now = now();
        LocalDateTime stale = now.minusMinutes(10);
        int claimed = jdbc.update("UPDATE ai_jobs SET status = 'PROCESSING', attempts = attempts + 1, "
                        + "updated_at = ? WHERE id = ? AND ((status = 'PENDING' AND next_attempt_at <= ?) "
                        + "OR (status = 'PROCESSING' AND updated_at < ?))", now, id, now, stale);
        if (claimed == 0) return;
        Map<String, Object> job = jdbc.queryForMap("SELECT * FROM ai_jobs WHERE id = ?", id);
        try {
            String kind = (String) job.get("kind");
            Map<String, Object> payload = kind.equals("CLASSIFY") ? classifyPayload(job) : verifyPayload(job);
            String endpoint = kind.equals("CLASSIFY") ? "/ai/classify" : "/ai/verify-completion";
            JsonNode response = call(endpoint, payload);
            validate(job, payload, response);
            jdbc.update("UPDATE ai_jobs SET status = 'SUCCEEDED', model_version = ?, confidence = ?, "
                            + "result_json = ?, warnings_json = ?, last_error = NULL, updated_at = ? WHERE id = ?",
                    response.path("modelVersion").asText(), response.path("confidence").asDouble(),
                    response.path("result").toString(), response.path("warnings").toString(), now(), id);
        } catch (Exception exception) {
            int attempts = ((Number) job.get("attempts")).intValue();
            long delaySeconds = Math.min(300, 1L << Math.min(attempts, 8));
            jdbc.update("UPDATE ai_jobs SET status = 'PENDING', next_attempt_at = ?, last_error = ?, "
                            + "updated_at = ? WHERE id = ?", now().plusSeconds(delaySeconds),
                    "AI service unavailable or returned an invalid response.", now(), id);
            log.warn("AI job {} attempt {} failed: {}", id, attempts, exception.toString());
        }
    }

    private Map<String, Object> classifyPayload(Map<String, Object> job) {
        long problemId = number(job, "problem_id");
        Map<String, Object> problem = jdbc.queryForMap("SELECT category, description FROM problems WHERE id = ?",
                problemId);
        List<String> imageUrls = jdbc.queryForList("SELECT path FROM problem_images WHERE problem_id = ? "
                + "ORDER BY id", String.class, problemId).stream().map(this::imageUrl).toList();
        return Map.of("requestId", job.get("operation_key"), "problemId", problemId,
                "reportedCategory", problem.get("category"),
                "description", problem.get("description"), "imageUrls", imageUrls);
    }

    private Map<String, Object> verifyPayload(Map<String, Object> job) {
        long taskId = number(job, "task_id");
        long evidenceId = number(job, "evidence_id");
        Map<String, Object> evidence = jdbc.queryForMap("SELECT before_image_path, after_image_path "
                + "FROM task_evidence WHERE id = ? AND task_id = ?", evidenceId, taskId);
        String category = jdbc.queryForObject("SELECT category FROM problems WHERE id = ?", String.class,
                number(job, "problem_id"));
        String taskType = category.equals("PLASTIC_WASTE") ? "PLASTIC_REMOVAL" : category;
        return Map.of("requestId", job.get("operation_key"), "evidenceId", evidenceId,
                "taskId", taskId, "taskType", taskType,
                "beforeImage", imageUrl((String) evidence.get("before_image_path")),
                "afterImage", imageUrl((String) evidence.get("after_image_path")));
    }

    private JsonNode call(String endpoint, Map<String, Object> payload) throws Exception {
        URI uri = URI.create(serviceUrl + endpoint);
        if (!List.of("http", "https").contains(uri.getScheme())) {
            throw new IllegalArgumentException("AI_SERVICE_URL must use HTTP or HTTPS.");
        }
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(timeout)
                .header("Content-Type", "application/json")
                .version(HttpClient.Version.HTTP_1_1)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("AI service returned HTTP " + response.statusCode());
        }
        return json.readTree(response.body());
    }

    private void validate(Map<String, Object> job, Map<String, Object> payload, JsonNode response) {
        if (response == null || !response.path("success").asBoolean(false)
                || response.path("modelVersion").asText().isBlank()
                || !response.path("result").isObject()
                || !response.path("warnings").isArray()
                || !response.path("confidence").isNumber()
                || response.path("confidence").asDouble() < 0
                || response.path("confidence").asDouble() > 1) {
            throw new IllegalArgumentException("AI response is incomplete.");
        }
        if (((String) job.get("kind")).equals("CLASSIFY")) {
            if (response.path("problemId").asLong(-1) != number(job, "problem_id")) {
                throw new IllegalArgumentException("AI response has a different problem ID.");
            }
        } else if (response.path("taskId").asLong(-1) != number(job, "task_id")
                || !response.path("taskType").asText().equals(payload.get("taskType"))) {
            throw new IllegalArgumentException("AI response has a different task ID or type.");
        }
    }

    private String imageUrl(String path) { return backendUrl + path; }
    private static String stripSlash(String value) { return value.replaceAll("/+$", ""); }
    private static long number(Map<String, Object> row, String key) { return ((Number) row.get(key)).longValue(); }
    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
}
