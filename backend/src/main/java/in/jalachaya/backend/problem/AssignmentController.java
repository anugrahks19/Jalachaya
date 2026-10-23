package in.jalachaya.backend.problem;

import java.time.Instant;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tasks")
public class AssignmentController {
    private final ProblemService problems;

    public AssignmentController(ProblemService problems) { this.problems = problems; }

    @PostMapping
    public Map<String, Object> assign(@AuthenticationPrincipal Jwt jwt, @RequestBody AssignmentRequest request) {
        return problems.assign(Long.parseLong(jwt.getSubject()), request.problemId(),
                request.assignedWorkerId(), request.deadline(), request.priority(), request.instructions());
    }

    public record AssignmentRequest(long problemId, long assignedWorkerId, Instant deadline,
                                    String priority, String instructions) {}
}
