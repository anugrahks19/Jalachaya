package in.jalachaya.backend.user;

import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class BootstrapAccounts implements CommandLineRunner {
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final String officerEmail;
    private final String officerPassword;
    private final String officerName;
    private final String workerEmail;
    private final String workerPassword;
    private final String workerName;
    private final String workerTeam;

    public BootstrapAccounts(UserRepository users, PasswordEncoder passwords,
            @Value("${app.bootstrap.officer-email}") String officerEmail,
            @Value("${app.bootstrap.officer-password}") String officerPassword,
            @Value("${app.bootstrap.officer-name}") String officerName,
            @Value("${app.bootstrap.worker-email}") String workerEmail,
            @Value("${app.bootstrap.worker-password}") String workerPassword,
            @Value("${app.bootstrap.worker-name}") String workerName,
            @Value("${app.bootstrap.worker-team}") String workerTeam) {
        this.users = users;
        this.passwords = passwords;
        this.officerEmail = officerEmail;
        this.officerPassword = officerPassword;
        this.officerName = officerName;
        this.workerEmail = workerEmail;
        this.workerPassword = workerPassword;
        this.workerName = workerName;
        this.workerTeam = workerTeam;
    }

    @Override
    public void run(String... args) {
        createIfConfigured(officerEmail, officerPassword, officerName, null, Role.PANCHAYAT_OFFICER);
        createIfConfigured(workerEmail, workerPassword, workerName, workerTeam, Role.FIELD_WORKER);
    }

    private void createIfConfigured(String email, String password, String name, String team, Role role) {
        if (email.isBlank() && password.isBlank()) return;
        if (email.isBlank() || password.length() < 12) {
            throw new IllegalStateException("Bootstrap " + role + " requires an email and a password of at least 12 characters.");
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmailIgnoreCase(normalized)) return;
        User user = new User();
        user.setEmail(normalized);
        user.setName(name.trim());
        user.setRole(role);
        user.setPasswordHash(passwords.encode(password));
        user.setTeam(team == null ? null : team.trim());
        users.saveAndFlush(user);
    }
}
