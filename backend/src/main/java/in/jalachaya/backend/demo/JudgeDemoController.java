package in.jalachaya.backend.demo;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
public class JudgeDemoController {
    private final JudgeDemoSeeder demo;
    public JudgeDemoController(JudgeDemoSeeder demo) { this.demo = demo; }
    @GetMapping("/api/public/demo-accounts")
    public Map<String, Object> accounts() { return demo.visibleAccounts(); }
}
