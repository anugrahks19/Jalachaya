package in.jalachaya.backend.user;

import in.jalachaya.backend.problem.ProblemService;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private final UserRepository users;
    private final ProblemService problems;

    public UserController(UserRepository users, ProblemService problems) {
        this.users = users;
        this.problems = problems;
    }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        Long id = Long.valueOf(jwt.getSubject());
        User user = users.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue."));
        return new MeResponse(user.getId(), user.getName(), user.getEmail(), user.getPhone(),
                user.getWard(), user.getRole(), user.getCreatedAt().atOffset(ZoneOffset.UTC).toInstant());
    }

    @GetMapping
    public List<WorkerResponse> workers(@RequestParam Role role) {
        if (role != Role.FIELD_WORKER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only field workers can be listed.");
        }
        return users.findByRoleAndActiveTrueOrderByName(role).stream()
                .map(user -> new WorkerResponse(user.getId(), user.getName(), user.getTeam(),
                        user.getPhone(), problems.openTasks(user.getId())))
                .toList();
    }

    public record MeResponse(Long id, String name, String email, String phone, String ward,
                             Role role, Instant createdAt) {}
    public record WorkerResponse(Long id, String name, String team, String phone, int openTasks) {}
}
