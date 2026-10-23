package in.jalachaya.backend.pond;

import in.jalachaya.backend.problem.ProblemService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PublicFeedController {
    private final ProblemService problems;

    public PublicFeedController(ProblemService problems) { this.problems = problems; }

    @GetMapping("/api/public/activity")
    public List<Map<String, Object>> activity() { return problems.publicActivity(); }

    @GetMapping("/api/public/highlights")
    public List<Map<String, Object>> highlights() { return problems.publicHighlights(); }
}
