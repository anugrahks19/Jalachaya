package in.jalachaya.backend.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class PasswordRecoveryController {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;

    public PasswordRecoveryController(JdbcTemplate jdbc, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.passwords = passwords;
    }

    public record ResetRequest(@NotBlank @Size(max = 100) String token,
                               @NotBlank @Size(min = 12, max = 72) String password) {}

    @PostMapping("/reset-password")
    @Transactional
    public Map<String, String> reset(@Valid @RequestBody ResetRequest request) {
        if (!request.token().matches("[A-Za-z0-9_-]{43}")
                || request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw invalid();
        }
        String hash = hash(request.token());
        List<Long> users = jdbc.query("SELECT user_id FROM password_reset_tokens WHERE token_hash = ?",
                (row, index) -> row.getLong(1), hash);
        if (users.isEmpty()) throw invalid();
        long userId = users.get(0);
        // Every token for an account shares this lock; two simultaneous resets cannot both succeed.
        List<Long> active = jdbc.query("SELECT id FROM app_users WHERE id = ? AND active = TRUE FOR UPDATE",
                (row, index) -> row.getLong(1), userId);
        if (active.isEmpty()) throw invalid();
        List<Long> valid = jdbc.query("SELECT user_id FROM password_reset_tokens "
                        + "WHERE token_hash = ? AND expires_at > ? FOR UPDATE",
                (row, index) -> row.getLong(1), hash, LocalDateTime.now(ZoneOffset.UTC));
        if (valid.isEmpty()) throw invalid();
        jdbc.update("UPDATE app_users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?",
                passwords.encode(request.password()), userId);
        jdbc.update("DELETE FROM password_reset_tokens WHERE user_id = ?", userId);
        return Map.of("message", "Password changed. Log in with your new password.");
    }

    public static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reset link is invalid or expired. Request a new link from the local administrator.");
    }
}
