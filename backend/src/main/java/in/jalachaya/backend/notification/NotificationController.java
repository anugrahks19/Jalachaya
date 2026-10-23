package in.jalachaya.backend.notification;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService notifications;
    public NotificationController(NotificationService notifications) { this.notifications = notifications; }
    @GetMapping
    public Map<String, Object> inbox(@AuthenticationPrincipal Jwt jwt) {
        return notifications.inbox(Long.parseLong(jwt.getSubject()));
    }
    @PostMapping("/{id}/read")
    public Map<String, Boolean> read(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        notifications.read(Long.parseLong(jwt.getSubject()), id);
        return Map.of("success", true);
    }
}
