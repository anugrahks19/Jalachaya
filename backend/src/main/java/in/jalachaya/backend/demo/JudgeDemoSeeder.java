package in.jalachaya.backend.demo;

import in.jalachaya.backend.pond.PondRequest;
import in.jalachaya.backend.pond.PondService;
import in.jalachaya.backend.problem.ProblemService;
import in.jalachaya.backend.problem.WorkflowService;
import in.jalachaya.backend.user.*;
import java.io.*;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Component
public class JudgeDemoSeeder implements CommandLineRunner {
    public record DemoAccount(String label, String email, String password, Role role) {}
    public static final List<DemoAccount> ACCOUNTS = List.of(
            new DemoAccount("Citizen", "citizen@judges.invalid", "JudgeCitizen123!", Role.COMMUNITY_MEMBER),
            new DemoAccount("Panchayat officer", "officer@judges.invalid", "JudgeOfficer123!", Role.PANCHAYAT_OFFICER),
            new DemoAccount("Field worker", "worker@judges.invalid", "JudgeWorker123!", Role.FIELD_WORKER));
    private final boolean enabled;
    private final Path samples;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final JdbcTemplate jdbc;
    private final PondService ponds;
    private final ProblemService problems;
    private final WorkflowService workflow;

    public JudgeDemoSeeder(@Value("${app.demo.enabled:false}") boolean enabled,
            @Value("${app.demo.samples-dir:../assets/samples}") String samples,
            UserRepository users, PasswordEncoder passwords, JdbcTemplate jdbc,
            PondService ponds, ProblemService problems, WorkflowService workflow) {
        this.enabled = enabled; this.samples = Path.of(samples); this.users = users;
        this.passwords = passwords; this.jdbc = jdbc; this.ponds = ponds;
        this.problems = problems; this.workflow = workflow;
    }

    @Override
    @Transactional
    public void run(String... args) throws IOException {
        if (!enabled) return;
        for (DemoAccount account : ACCOUNTS) {
            if (users.existsByEmailIgnoreCase(account.email())) continue;
            User user = new User(); user.setName("Judges Demo " + account.label());
            user.setEmail(account.email()); user.setPasswordHash(passwords.encode(account.password()));
            user.setRole(account.role()); user.setWard("Demo Ward");
            if (account.role() == Role.FIELD_WORKER) user.setTeam("Judges Demo Field Team");
            users.saveAndFlush(user);
        }
        String marker = "[JUDGES DEMO] Lotus Pond";
        if (jdbc.queryForObject("SELECT COUNT(*) FROM ponds WHERE name = ? AND ward = 'Demo Ward'", Integer.class, marker) > 0) {
            ensureSecondResult();
            return;
        }
        long citizen = user(ACCOUNTS.get(0).email()), officer = user(ACCOUNTS.get(1).email()), worker = user(ACCOUNTS.get(2).email());
        long[] pondIds = new long[3];
        String[] names = {marker, "[JUDGES DEMO] Village Pond", "[JUDGES DEMO] Garden Pond"};
        for (int i = 0; i < names.length; i++) {
            var pond = ponds.create(new PondRequest(names[i], "Demo Ward", "Demonstration village", new BigDecimal("1.2"),
                    new BigDecimal("10.50").add(new BigDecimal("0.01").multiply(BigDecimal.valueOf(i))),
                    new BigDecimal("76.20"), "Fictional pond for judges. Sample photos and records demonstrate the workflow; they are not field observations."));
            pondIds[i] = pond.id();
            ponds.uploadImage(pond.id(), photo("clean-" + (i + 1) + ".jpg"));
        }
        String[] stages = {"SUBMITTED", "ASSIGNED", "IN_PROGRESS", "COMPLETION_CLAIMED", "COMMUNITY_VERIFICATION", "VERIFIED", "REOPENED", "REJECTED"};
        for (int i = 0; i < stages.length; i++) {
            String stage = stages[i];
            Map<String, Object> report = problems.create(citizen, pondIds[i % 3], "PLASTIC_WASTE",
                    "[JUDGES DEMO] Sample complaint demonstrating " + stage.toLowerCase().replace('_', ' ') + ". This is fictional training data for the presentation.",
                    "Demo bank entrance", null, null, List.of(photo("polluted-" + (i % 3 + 1) + ".jpg")));
            long problemId = ((Number) report.get("id")).longValue();
            if (stage.equals("SUBMITTED")) continue;
            if (stage.equals("REJECTED")) { problems.reject(officer, problemId, "[JUDGES DEMO] Duplicate sample complaint."); continue; }
            problems.assign(officer, problemId, worker, Instant.now().plus(7, ChronoUnit.DAYS),
                    i % 2 == 0 ? "HIGH" : "MEDIUM", "[JUDGES DEMO] Inspect and document the sample work.");
            long taskId = jdbc.queryForObject("SELECT id FROM tasks WHERE problem_id = ? AND active = TRUE", Long.class, problemId);
            if (stage.equals("ASSIGNED")) {
                jdbc.update("UPDATE tasks SET deadline = ? WHERE id = ?", java.time.LocalDateTime.now(java.time.ZoneOffset.UTC).minusDays(2), taskId);
                continue;
            }
            workflow.start(worker, taskId, "IN_PROGRESS");
            workflow.note(worker, taskId, "[JUDGES DEMO] Sample inspection note for the presentation.", null);
            if (stage.equals("IN_PROGRESS")) continue;
            workflow.complete(worker, taskId, photo("polluted-" + (i % 3 + 1) + ".jpg"), photo("clean-" + (i % 3 + 1) + ".jpg"),
                    "[JUDGES DEMO] Sample completion evidence; these are different example scenes, not measured cleanup results.");
            if (stage.equals("COMPLETION_CLAIMED")) continue;
            workflow.review(officer, taskId, "FORWARD", "[JUDGES DEMO] Example officer review.");
            if (stage.equals("COMMUNITY_VERIFICATION")) continue;
            workflow.communityVerify(citizen, taskId, stage.equals("REOPENED") ? "DISPUTE" : "CONFIRM",
                    "[JUDGES DEMO] Example community response.", null);
        }
        ensureSecondResult();
    }

    private void ensureSecondResult() throws IOException {
        long citizen = user(ACCOUNTS.get(0).email());
        String description = "[JUDGES DEMO] Additional verified result for the presentation. These are example photos and a fictional workflow.";
        if (jdbc.queryForObject("SELECT COUNT(*) FROM problems WHERE reporter_id = ? AND description = ?",
                Integer.class, citizen, description) > 0) return;
        long officer = user(ACCOUNTS.get(1).email()), worker = user(ACCOUNTS.get(2).email());
        long pondId = jdbc.queryForObject("SELECT id FROM ponds WHERE name = '[JUDGES DEMO] Lotus Pond' AND ward = 'Demo Ward'", Long.class);
        var report = problems.create(citizen, pondId, "PLASTIC_WASTE", description, "Demo pond entrance",
                null, null, List.of(photo("polluted-1.jpg")));
        long problemId = ((Number) report.get("id")).longValue();
        problems.assign(officer, problemId, worker, Instant.now().plus(7, ChronoUnit.DAYS), "MEDIUM",
                "[JUDGES DEMO] Demonstrate a second completed result.");
        long taskId = jdbc.queryForObject("SELECT id FROM tasks WHERE problem_id = ? AND active = TRUE", Long.class, problemId);
        workflow.start(worker, taskId, "IN_PROGRESS");
        workflow.complete(worker, taskId, photo("polluted-1.jpg"), photo("clean-1.jpg"),
                "[JUDGES DEMO] Sample completion evidence; these are different example scenes, not measured cleanup results.");
        workflow.review(officer, taskId, "FORWARD", "[JUDGES DEMO] Example officer review.");
        workflow.communityVerify(citizen, taskId, "CONFIRM", "[JUDGES DEMO] Example community response.", null);
    }

    public Map<String, Object> visibleAccounts() {
        if (!enabled) return Map.of("enabled", false, "accounts", List.of());
        var available = ACCOUNTS.stream().filter(account -> users.findByEmailIgnoreCase(account.email())
                .filter(User::isActive).filter(user -> user.getRole() == account.role())
                .filter(user -> passwords.matches(account.password(), user.getPasswordHash())).isPresent()).toList();
        return Map.of("enabled", true, "accounts", available);
    }

    private long user(String email) { return users.findByEmailIgnoreCase(email).orElseThrow().getId(); }
    private MultipartFile photo(String name) throws IOException {
        byte[] data = Files.readAllBytes(samples.resolve(name));
        return new MultipartFile() {
            public String getName() { return "image"; }
            public String getOriginalFilename() { return name; }
            public String getContentType() { return "image/jpeg"; }
            public boolean isEmpty() { return data.length == 0; }
            public long getSize() { return data.length; }
            public byte[] getBytes() { return data.clone(); }
            public InputStream getInputStream() { return new ByteArrayInputStream(data); }
            public void transferTo(File destination) throws IOException { Files.write(destination.toPath(), data); }
        };
    }
}
