package in.jalachaya.backend.problem;

import in.jalachaya.backend.common.DataScope;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/escalations")
public class DeadlineController {
    private final JdbcTemplate jdbc;private final DataScope scope;private final DeadlineMonitor monitor;private final AuthorityMailer mail;
    public DeadlineController(JdbcTemplate jdbc,DataScope scope,DeadlineMonitor monitor,AuthorityMailer mail){this.jdbc=jdbc;this.scope=scope;this.monitor=monitor;this.mail=mail;}
    private void officer(Jwt jwt){if(!"PANCHAYAT_OFFICER".equals(jwt.getClaimAsString("role")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Only officers can manage authority alerts.");}
    @GetMapping("/automatic")
    public Map<String,Object> alerts(@AuthenticationPrincipal Jwt jwt){
        officer(jwt);var items=jdbc.queryForList("SELECT e.*,a.status AS delivery_status,a.recipient,a.attempts,a.last_error,a.sent_at FROM deadline_events e JOIN problems p ON p.id=e.problem_id JOIN authority_deliveries a ON a.event_id=e.id WHERE "+scope.problems("p",scope.currentDemo())+" ORDER BY e.id DESC LIMIT 50");
        var rows=items.stream().map(r->{Map<String,Object> v=new LinkedHashMap<>();v.put("id",r.get("id"));v.put("taskId",r.get("task_id"));v.put("problemId",r.get("problem_id"));v.put("code","JC-"+(1000+((Number)r.get("problem_id")).longValue()));v.put("level",r.get("level"));v.put("destination",r.get("destination"));v.put("message",r.get("message"));v.put("deliveryStatus",r.get("delivery_status"));v.put("recipient",r.get("recipient"));v.put("attempts",r.get("attempts"));v.put("lastError",r.get("last_error"));v.put("createdAt",WorkflowView.instant(r,"created_at"));v.put("sentAt",r.get("sent_at")==null?null:WorkflowView.instant(r,"sent_at"));return v;}).toList();
        Map<String,String> contacts=new LinkedHashMap<>();for(String kind:List.of("PANCHAYAT","HIGHER","INSPECTION")){var values=jdbc.queryForList("SELECT email FROM authority_contacts WHERE is_demo=? AND kind=?",String.class,scope.currentDemo(),kind);contacts.put(kind,values.isEmpty()?"":values.get(0));}
        return Map.of("items",rows,"contacts",contacts,"rules",monitor.rules());
    }
    public record Contacts(@Email @Size(max=254) String panchayatEmail,@Email @Size(max=254) String higherEmail,@Email @Size(max=254) String inspectionEmail){}
    @PostMapping("/settings") @Transactional
    public Map<String,Object> settings(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody Contacts body){
        officer(jwt);save("PANCHAYAT",body.panchayatEmail());save("HIGHER",body.higherEmail());save("INSPECTION",body.inspectionEmail());return alerts(jwt);
    }
    private void save(String kind,String value){String email=value==null?"":value.trim();boolean demo=scope.currentDemo();if(email.isEmpty()){jdbc.update("DELETE FROM authority_contacts WHERE is_demo=? AND kind=?",demo,kind);return;}
        if(jdbc.update("UPDATE authority_contacts SET email=? WHERE is_demo=? AND kind=?",email,demo,kind)==0)jdbc.update("INSERT INTO authority_contacts (is_demo,kind,email) VALUES (?,?,?)",demo,kind,email);
    }
    @PostMapping("/test-email")
    public Map<String,String> test(@AuthenticationPrincipal Jwt jwt){officer(jwt);if(scope.currentDemo())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Demo accounts do not send external emails.");
        var recipients=jdbc.queryForList("SELECT email FROM authority_contacts WHERE is_demo=FALSE AND kind='PANCHAYAT'",String.class);
        if(!mail.ready() || recipients.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Configure the SMTP sender and Panchayat recipient first.");
        try{mail.send(recipients.get(0),"Jalachaya SMTP connection test","This is a test email from your local Jalachaya installation. Automatic deadline alerts will use this configured sender.",0);}
        catch(Exception failure){throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"SMTP test failed. Check the sender app password, TLS settings, and network.");}
        return Map.of("status","SENT","message","The email server accepted the test message. Check the recipient inbox and spam folder.");
    }
}
