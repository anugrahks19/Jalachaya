package in.jalachaya.backend.problem;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;

@Component
public class AuthorityMailer {
    private final JavaMailSenderImpl sender = new JavaMailSenderImpl();
    private final String from;
    private final String host;
    public AuthorityMailer(@Value("${app.alerts.mail-host:}") String host,
            @Value("${app.alerts.mail-port:587}") int port,
            @Value("${app.alerts.mail-username:}") String username,
            @Value("${app.alerts.mail-password:}") String password,
            @Value("${app.alerts.mail-from:}") String from,
            @Value("${app.alerts.mail-starttls:true}") boolean tls) {
        this.host=host; this.from=from;
        sender.setHost(host);sender.setPort(port);sender.setUsername(username);sender.setPassword(password);
        var props=sender.getJavaMailProperties();
        props.setProperty("mail.smtp.ssl.checkserveridentity","true");
        props.setProperty("mail.smtp.auth",Boolean.toString(!username.isBlank()));
        props.setProperty("mail.smtp.starttls.enable",Boolean.toString(tls));
        props.setProperty("mail.smtp.starttls.required",Boolean.toString(tls));
        props.setProperty("mail.smtp.connectiontimeout","5000");props.setProperty("mail.smtp.timeout","5000");props.setProperty("mail.smtp.writetimeout","5000");
    }
    public boolean ready() { return !host.isBlank() && !from.isBlank(); }
    public void send(String recipient,String subject,String text,long eventId) throws Exception {
        var mail=sender.createMimeMessage();var helper=new MimeMessageHelper(mail,"UTF-8");
        helper.setFrom(from);helper.setTo(recipient);helper.setSubject(subject);helper.setText(text,false);
        mail.setHeader("X-Jalachaya-Event",Long.toString(eventId));
        sender.send(mail);
    }
}
