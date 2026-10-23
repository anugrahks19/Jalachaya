package in.jalachaya.backend.problem;

import java.sql.Statement;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Service
public class DeadlineMonitor {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final AuthorityMailer mail;
    private final boolean enabled;
    private final int reminderHours,higherHours,inspectionHours;
    public DeadlineMonitor(JdbcTemplate jdbc,PlatformTransactionManager manager,AuthorityMailer mail,
            @Value("${app.deadlines.enabled:true}") boolean enabled,
            @Value("${app.deadlines.reminder-hours:24}") int reminder,
            @Value("${app.deadlines.higher-hours:24}") int higher,
            @Value("${app.deadlines.inspection-hours:48}") int inspection) {
        if(reminder<0 || higher<0 || inspection<=higher) throw new IllegalArgumentException("Deadline intervals must be nonnegative and inspection later than higher escalation.");
        this.jdbc=jdbc;this.tx=new TransactionTemplate(manager);this.mail=mail;this.enabled=enabled;
        reminderHours=reminder;higherHours=higher;inspectionHours=inspection;
    }
    public Map<String,Object> rules() {return Map.of("enabled",enabled,"reminderHours",reminderHours,"higherHours",higherHours,"inspectionHours",inspectionHours,"smtpReady",mail.ready());}
    @Scheduled(fixedDelayString="${app.deadlines.poll-ms:60000}",initialDelayString="${app.deadlines.initial-delay-ms:15000}")
    public void tick() {if(enabled){scan(LocalDateTime.now(ZoneOffset.UTC));deliver(LocalDateTime.now(ZoneOffset.UTC));}}
    public void scan(LocalDateTime now) {
        var ids=jdbc.queryForList("SELECT t.id FROM tasks t JOIN problems p ON p.id=t.problem_id WHERE t.active=TRUE AND p.status IN ('ASSIGNED','IN_PROGRESS') ORDER BY t.id",Long.class);
        for(long id:ids)tx.executeWithoutResult(ignored->process(id,now));
        jdbc.update("UPDATE authority_deliveries SET status='CANCELLED',last_error='Task is no longer active field work' WHERE status IN ('PENDING','RETRY','NEEDS_CONFIGURATION') AND event_id IN (SELECT e.id FROM deadline_events e JOIN tasks t ON t.id=e.task_id JOIN problems p ON p.id=e.problem_id WHERE t.active=FALSE OR p.status NOT IN ('ASSIGNED','IN_PROGRESS'))");
    }
    private void process(long taskId,LocalDateTime now) {
        var before=jdbc.queryForList("SELECT problem_id FROM tasks WHERE id=?",Long.class,taskId);if(before.isEmpty())return;
        long problemId=before.get(0);
        var p=jdbc.queryForMap("SELECT status FROM problems WHERE id=? FOR UPDATE",problemId);
        var t=jdbc.queryForMap("SELECT * FROM tasks WHERE id=? FOR UPDATE",taskId);
        if(!Boolean.TRUE.equals(t.get("active")) || !Set.of("ASSIGNED","IN_PROGRESS").contains(p.get("status")))return;
        var pond=jdbc.queryForMap("SELECT d.name,d.is_demo FROM ponds d JOIN problems p ON p.pond_id=d.id WHERE p.id=?",problemId);
        LocalDateTime deadline=WorkflowView.instant(t,"deadline").atOffset(ZoneOffset.UTC).toLocalDateTime();
        if(now.isBefore(deadline) && !now.isBefore(deadline.minusHours(reminderHours)))event(t,p,pond,problemId,1,deadline,now);
        if(!now.isBefore(deadline))event(t,p,pond,problemId,2,deadline,now);
        if(!now.isBefore(deadline.plusHours(higherHours)))event(t,p,pond,problemId,3,deadline,now);
        if(!now.isBefore(deadline.plusHours(inspectionHours)))event(t,p,pond,problemId,4,deadline,now);
    }
    private void event(Map<String,Object> task,Map<String,Object> problem,Map<String,Object> pond,long problemId,int level,LocalDateTime deadline,LocalDateTime now) {
        long taskId=((Number)task.get("id")).longValue();
        if(jdbc.queryForObject("SELECT COUNT(*) FROM deadline_events WHERE task_id=? AND level=?",Integer.class,taskId,level)>0)return;
        String destination=switch(level){case 1->"Field team reminder";case 2->"Panchayat office";case 3->"Higher authority";default->"Manual inspection required";};
        String message="JC-"+(1000+problemId)+" at "+pond.get("name")+": L"+level+" - "+destination+". Deadline: "+deadline+" UTC.";
        long history=insert("INSERT INTO problem_history (problem_id,status,note,actor_id,created_at,notifications_scanned,system_event) VALUES (?,?,?,?,?,TRUE,TRUE)",problemId,problem.get("status"),"Automatic deadline alert: "+message,task.get("assigned_by_id"),now);
        long event=insert("INSERT INTO deadline_events (task_id,problem_id,history_id,level,destination,message,deadline_at,created_at) VALUES (?,?,?,?,?,?,?,?)",taskId,problemId,history,level,destination,message,deadline,now);
        boolean demo=Boolean.TRUE.equals(pond.get("is_demo"));
        var recipients=jdbc.queryForList("SELECT id FROM app_users WHERE active=TRUE AND is_demo=? AND "+(level==1?"id=?":"role='PANCHAYAT_OFFICER'"),Long.class,level==1?new Object[]{demo,task.get("worker_id")}:new Object[]{demo});
        for(long recipient:recipients)jdbc.update("INSERT INTO user_notifications (user_id,history_id,message,problem_id,created_at) VALUES (?,?,?,?,?)",recipient,history,message,problemId,now);
        jdbc.update("INSERT INTO authority_deliveries (event_id,status,next_attempt_at) VALUES (?,?,?)",event,demo?"DEMO_IN_APP":"PENDING",now);
    }
    public void deliver(LocalDateTime now) {
        var ids=jdbc.queryForList("SELECT id FROM authority_deliveries WHERE status IN ('PENDING','RETRY','NEEDS_CONFIGURATION','PROCESSING') AND next_attempt_at<=? ORDER BY id LIMIT 30",Long.class,now);
        for(long id:ids){
            Map<String,Object> row=tx.execute(ignored->{
                var rows=jdbc.queryForList("SELECT a.*,e.level,e.message,e.problem_id,e.task_id,e.deadline_at FROM authority_deliveries a JOIN deadline_events e ON e.id=a.event_id WHERE a.id=? FOR UPDATE",id);if(rows.isEmpty())return null;
                var r=rows.get(0);if(!Set.of("PENDING","RETRY","NEEDS_CONFIGURATION","PROCESSING").contains(r.get("status")))return null;
                if(WorkflowView.instant(r,"next_attempt_at").isAfter(now.toInstant(ZoneOffset.UTC)))return null;
                var t=jdbc.queryForMap("SELECT t.active,t.worker_id,p.status,d.is_demo FROM tasks t JOIN problems p ON p.id=t.problem_id JOIN ponds d ON d.id=p.pond_id WHERE t.id=?",r.get("task_id"));
                if(Boolean.TRUE.equals(t.get("is_demo"))){jdbc.update("UPDATE authority_deliveries SET status='DEMO_IN_APP' WHERE id=?",id);return null;}
                if(!Boolean.TRUE.equals(t.get("active")) || !Set.of("ASSIGNED","IN_PROGRESS").contains(t.get("status"))){jdbc.update("UPDATE authority_deliveries SET status='CANCELLED' WHERE id=?",id);return null;}
                int level=((Number)r.get("level")).intValue();
                if(level==1 && !now.isBefore(WorkflowView.instant(r,"deadline_at").atOffset(ZoneOffset.UTC).toLocalDateTime())){
                    jdbc.update("UPDATE authority_deliveries SET status='CANCELLED',last_error='Reminder window expired' WHERE id=?",id);return null;
                }
                String kind=level==2?"PANCHAYAT":level==3?"HIGHER":"INSPECTION";
                var email=level==1?jdbc.queryForList("SELECT email FROM app_users WHERE id=?",String.class,t.get("worker_id")):jdbc.queryForList("SELECT email FROM authority_contacts WHERE is_demo=FALSE AND kind=?",String.class,kind);
                String recipient=email.isEmpty()?null:email.get(0);
                if(!mail.ready() || recipient==null || recipient.isBlank() || recipient.endsWith(".invalid") || recipient.endsWith(".local")){
                    jdbc.update("UPDATE authority_deliveries SET status='NEEDS_CONFIGURATION',recipient=?,last_error='Configure SMTP sender and a valid recipient',next_attempt_at=? WHERE id=?",recipient,now.plusMinutes(1),id);return null;
                }
                jdbc.update("UPDATE authority_deliveries SET status='PROCESSING',recipient=?,attempts=attempts+1,next_attempt_at=?,last_error=NULL WHERE id=?",recipient,now.plusMinutes(5),id);
                r.put("recipient",recipient);return r;
            });
            if(row==null)continue;
            try{mail.send((String)row.get("recipient"),"Jalachaya L"+row.get("level")+" deadline alert",row.get("message")+"\n\nThis is an automatic workflow deadline alert. Open the local officer portal to review task "+row.get("task_id")+".",((Number)row.get("event_id")).longValue());
                jdbc.update("UPDATE authority_deliveries SET status='SENT',sent_at=?,last_error=NULL WHERE id=?",now,id);
            }catch(Exception failure){int attempts=((Number)row.get("attempts")).intValue()+1;
                jdbc.update("UPDATE authority_deliveries SET status='RETRY',next_attempt_at=?,last_error='SMTP delivery failed; check local mail configuration and network' WHERE id=?",now.plusMinutes(Math.min(60,1L<<Math.min(attempts,6))),id);
            }
        }
    }
    private long insert(String sql,Object...args){var key=new GeneratedKeyHolder();jdbc.update(c->{var ps=c.prepareStatement(sql,Statement.RETURN_GENERATED_KEYS);for(int i=0;i<args.length;i++)ps.setObject(i+1,args[i]);return ps;},key);return key.getKey().longValue();}
}
