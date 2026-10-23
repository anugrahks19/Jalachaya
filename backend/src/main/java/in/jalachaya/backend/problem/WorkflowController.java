package in.jalachaya.backend.problem;

import java.util.List;
import java.util.Map;
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

@RestController
public class WorkflowController {
    private final WorkflowService workflow;
    private final ProblemService problems;

    public WorkflowController(WorkflowService workflow, ProblemService problems) {
        this.workflow = workflow;
        this.problems = problems;
    }

    @GetMapping("/api/tasks")
    public List<Map<String, Object>> myTasks(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "false") boolean mine) {
        return workflow.myTasks(id(jwt), mine);
    }

    @PutMapping("/api/tasks/{id}")
    public Map<String, Object> start(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
            @RequestBody StatusRequest request) {
        return workflow.start(id(jwt), id, request.status());
    }

    @PostMapping(path = "/api/tasks/{id}/notes", consumes = "multipart/form-data")
    public Map<String, Object> note(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
            @RequestParam String text, @RequestParam(required = false) MultipartFile image) {
        return workflow.note(id(jwt), id, text, image);
    }

    @PostMapping(path = "/api/tasks/{id}/complete", consumes = "multipart/form-data")
    public Map<String, Object> complete(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
            @RequestParam MultipartFile beforeImage, @RequestParam MultipartFile afterImage,
            @RequestParam String remarks) {
        return workflow.complete(id(jwt), id, beforeImage, afterImage, remarks);
    }

    @PostMapping("/api/verifications")
    public Map<String, Object> review(@AuthenticationPrincipal Jwt jwt, @RequestBody ReviewRequest request) {
        long problemId = workflow.review(id(jwt), request.taskId(), request.decision(), request.comment());
        return problems.get(id(jwt), problemId);
    }

    @GetMapping("/api/community-verifications/pending")
    public List<Map<String, Object>> pending(@AuthenticationPrincipal Jwt jwt) {
        return workflow.pending(id(jwt));
    }

    @PostMapping(path = "/api/community-verifications", consumes = "multipart/form-data")
    public Map<String, Object> communityVerify(@AuthenticationPrincipal Jwt jwt, @RequestParam long taskId,
            @RequestParam String decision, @RequestParam(required = false) String comment,
            @RequestParam(required = false) MultipartFile image) {
        return workflow.communityVerify(id(jwt), taskId, decision, comment, image);
    }

    public record StatusRequest(String status) {}
    public record ReviewRequest(long taskId, String decision, String comment) {}
    private long id(Jwt jwt) { return Long.parseLong(jwt.getSubject()); }
}
