package in.jalachaya.backend.problem;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OperationsController {
    private final OperationsService operations;

    public OperationsController(OperationsService operations) { this.operations = operations; }

    @PostMapping("/api/escalations")
    public Map<String, Object> escalate(@AuthenticationPrincipal Jwt jwt, @RequestBody EscalationRequest request) {
        return operations.escalate(id(jwt), request.taskId(), request.reason());
    }

    @GetMapping("/api/dashboard/summary")
    public Map<String, Object> summary(@AuthenticationPrincipal Jwt jwt) {
        return operations.summary(id(jwt));
    }

    @GetMapping("/api/dashboard/analytics")
    public Map<String, Object> analytics(@AuthenticationPrincipal Jwt jwt) {
        return operations.analytics(id(jwt));
    }

    public record EscalationRequest(long taskId, String reason) {}
    private long id(Jwt jwt) { return Long.parseLong(jwt.getSubject()); }
}
