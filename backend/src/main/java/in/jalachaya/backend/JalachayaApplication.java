package in.jalachaya.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class JalachayaApplication {
    public static void main(String[] args) {
        SpringApplication.run(JalachayaApplication.class, args);
    }
}
