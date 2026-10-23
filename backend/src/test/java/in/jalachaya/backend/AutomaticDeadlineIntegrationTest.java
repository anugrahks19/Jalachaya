package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import in.jalachaya.backend.problem.*;
import in.jalachaya.backend.user.*;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
 "spring.datasource.url=jdbc:h2:mem:deadlines;MODE=MySQL;DB_CLOSE_DELAY=-1",
 "app.jwt.secret=deadline-test-secret-at-least-32-bytes-long","app.deadlines.enabled=false"})
class AutomaticDeadlineIntegrationTest {
 @Autowired JdbcTemplate jdbc;@Autowired DeadlineMonitor monitor;@Autowired ProblemService problems;
 @Autowired UserRepository users;@Autowired PasswordEncoder passwords;
 @MockBean AuthorityMailer mail;
 private static final LocalDateTime NOW=LocalDateTime.of(2026,1,1,0,0);
 @Test void remindersEscalationDedupConfigurationRecoveryAndStopping() throws Exception {
  var f=fixture(false,NOW.plusHours(2));when(mail.ready()).thenReturn(false);
  monitor.scan(NOW);monitor.scan(NOW);
  assertThat(levels(f)).containsExactly(1);
  assertThat(inbox(f.worker(),f.problem())).isEqualTo(1);
  monitor.deliver(NOW);assertThat(delivery(f,1)).isEqualTo("NEEDS_CONFIGURATION");
  monitor.scan(NOW.plusHours(3));monitor.deliver(NOW.plusHours(3));
  assertThat(levels(f)).containsExactly(1,2);assertThat(delivery(f,1)).isEqualTo("CANCELLED");
  assertThat(delivery(f,2)).isEqualTo("NEEDS_CONFIGURATION");
  assertThat(inbox(f.officer(),f.problem())).isEqualTo(1);
  contact("PANCHAYAT","panchayat@example.test");when(mail.ready()).thenReturn(true);
  monitor.deliver(NOW.plusHours(3).plusMinutes(2));monitor.deliver(NOW.plusHours(3).plusMinutes(3));
  assertThat(delivery(f,2)).isEqualTo("SENT");verify(mail,times(1)).send(eq("panchayat@example.test"),anyString(),anyString(),anyLong());
  monitor.scan(NOW.plusHours(27));monitor.scan(NOW.plusHours(51));monitor.scan(NOW.plusHours(51));
  assertThat(levels(f)).containsExactly(1,2,3,4);
  jdbc.update("UPDATE problems SET status='COMPLETION_CLAIMED' WHERE id=?",f.problem());
  monitor.scan(NOW.plusHours(80));monitor.deliver(NOW.plusHours(80));
  assertThat(delivery(f,3)).isEqualTo("CANCELLED");assertThat(delivery(f,4)).isEqualTo("CANCELLED");
  assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM problem_history WHERE problem_id=? AND system_event=TRUE",Integer.class,f.problem())).isEqualTo(4);
  verify(mail,times(1)).send(anyString(),anyString(),anyString(),anyLong());
 }
 @Test void catchupRetriesDemoIsolationAndVerifiedOnlyRecoveryIndex() throws Exception {
  var real=fixture(false,NOW.minusHours(60));var demo=fixture(true,NOW.minusHours(60));
  contact("PANCHAYAT","authority@example.test");contact("HIGHER","authority@example.test");contact("INSPECTION","authority@example.test");
  when(mail.ready()).thenReturn(true);
  doThrow(new IllegalStateException("Temporary SMTP outage")).doNothing().when(mail).send(anyString(),contains("L3"),anyString(),anyLong());
  monitor.scan(NOW);monitor.scan(NOW);monitor.deliver(NOW);
  assertThat(levels(real)).containsExactly(2,3,4);assertThat(levels(demo)).containsExactly(2,3,4);
  assertThat(delivery(real,3)).isEqualTo("RETRY");assertThat(delivery(real,2)).isEqualTo("SENT");assertThat(delivery(real,4)).isEqualTo("SENT");
  assertThat(delivery(demo,2)).isEqualTo("DEMO_IN_APP");assertThat(delivery(demo,3)).isEqualTo("DEMO_IN_APP");
  monitor.deliver(NOW.plusMinutes(3));assertThat(delivery(real,3)).isEqualTo("SENT");
  verify(mail,times(4)).send(anyString(),anyString(),anyString(),anyLong());
  assertThat(inbox(real.officer(),demo.problem())).isZero();assertThat(inbox(demo.officer(),real.problem())).isZero();
  jdbc.update("UPDATE problems SET priority='LOW' WHERE id=?",real.problem());
  for(int i=0;i<60;i++)jdbc.update("INSERT INTO problems (pond_id,reporter_id,category,priority,status,description,created_at,updated_at) VALUES (?,?,'OTHER','URGENT','VERIFIED','PRI rounding check',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",real.pond(),real.citizen());
  assertThat(problems.pondStats(real.pond()).get("recoveryPercent")).isEqualTo(99);
  jdbc.update("UPDATE problems SET status='VERIFIED' WHERE pond_id=?",real.pond());assertThat(problems.pondStats(real.pond()).get("recoveryPercent")).isEqualTo(100);
  jdbc.update("UPDATE problems SET status='REJECTED' WHERE pond_id=?",real.pond());assertThat(problems.pondStats(real.pond()).get("recoveryPercent")).isNull();
 }
 private void contact(String kind,String email){jdbc.update("DELETE FROM authority_contacts WHERE is_demo=FALSE AND kind=?",kind);jdbc.update("INSERT INTO authority_contacts (is_demo,kind,email) VALUES (FALSE,?,?)",kind,email);}
 private List<Integer> levels(F f){return jdbc.queryForList("SELECT level FROM deadline_events WHERE task_id=? ORDER BY level",Integer.class,f.task());}
 private String delivery(F f,int level){return jdbc.queryForObject("SELECT a.status FROM authority_deliveries a JOIN deadline_events e ON e.id=a.event_id WHERE e.task_id=? AND e.level=?",String.class,f.task(),level);}
 private int inbox(long user,long problem){return jdbc.queryForObject("SELECT COUNT(*) FROM user_notifications WHERE user_id=? AND problem_id=?",Integer.class,user,problem);}
 private long account(Role role,boolean demo){var u=new User();u.setName("Deadline test "+role);u.setEmail(UUID.randomUUID()+"@deadline.test");u.setRole(role);u.setDemo(demo);u.setPasswordHash(passwords.encode("DeadlineTest123!"));return users.saveAndFlush(u).getId();}
 private F fixture(boolean demo,LocalDateTime deadline){long citizen=account(Role.COMMUNITY_MEMBER,demo),officer=account(Role.PANCHAYAT_OFFICER,demo),worker=account(Role.FIELD_WORKER,demo);
  jdbc.update("INSERT INTO ponds (name,ward,latitude,longitude,active,created_at,is_demo) VALUES (?,'Deadline Ward',10,76,TRUE,CURRENT_TIMESTAMP,?)",UUID.randomUUID().toString(),demo);long pond=jdbc.queryForObject("SELECT MAX(id) FROM ponds",Long.class);
  jdbc.update("INSERT INTO problems (pond_id,reporter_id,category,priority,status,description,created_at,updated_at) VALUES (?,?,'OTHER','MEDIUM','ASSIGNED','Deadline integration test',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",pond,citizen);long problem=jdbc.queryForObject("SELECT MAX(id) FROM problems",Long.class);
  jdbc.update("INSERT INTO tasks (problem_id,worker_id,assigned_by_id,priority,deadline,active,created_at) VALUES (?,?,?,'MEDIUM',?,TRUE,CURRENT_TIMESTAMP)",problem,worker,officer,deadline);long task=jdbc.queryForObject("SELECT MAX(id) FROM tasks",Long.class);
  return new F(problem,task,pond,citizen,officer,worker);
 }
 private record F(long problem,long task,long pond,long citizen,long officer,long worker){}
}
