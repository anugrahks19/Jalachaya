package in.jalachaya.backend.problem;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/problems")
public class ProblemController {
    private final ProblemService problems;

    public ProblemController(ProblemService problems) { this.problems = problems; }

    @PostMapping(consumes = "multipart/form-data")
    public Map<String, Object> create(@AuthenticationPrincipal Jwt jwt, @RequestParam long pondId,
            @RequestParam String category, @RequestParam String description,
            @RequestParam(required = false) String landmark,
            @RequestParam(required = false) BigDecimal latitude,
            @RequestParam(required = false) BigDecimal longitude,
            @RequestParam(required = false, name = "images") List<MultipartFile> images) {
        return problems.create(id(jwt), pondId, category, description, landmark, latitude, longitude,
                images == null ? List.of() : images);
    }

    @PostMapping(path = "/{id}/images", consumes = "multipart/form-data")
    public Map<String, Object> addImage(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
            @RequestParam MultipartFile image, @RequestParam(required = false) String caption) {
        return problems.addImage(id(jwt), id, image, caption);
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "false") boolean mine,
            @RequestParam(required = false) Long pondId,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String priority,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "false") boolean overdue,
            @RequestParam(required = false) String search) {
        return problems.list(id(jwt), mine, pondId, category, priority, status, overdue, search);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
        return problems.get(id(jwt), id);
    }

    @PutMapping("/{id}")
    public Map<String, Object> reject(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
            @RequestBody RejectRequest request) {
        if (request == null || !"REJECTED".equals(request.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only rejection is supported here.");
        }
        return problems.reject(id(jwt), id, request.reason());
    }

    public record RejectRequest(String status, String reason) {}
    private long id(Jwt jwt) { return Long.parseLong(jwt.getSubject()); }
}
