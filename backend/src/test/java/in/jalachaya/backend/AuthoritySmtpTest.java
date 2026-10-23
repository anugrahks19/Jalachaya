package in.jalachaya.backend;

import static org.assertj.core.api.Assertions.assertThat;
import in.jalachaya.backend.problem.AuthorityMailer;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;

class AuthoritySmtpTest {
 @Test void realMailAdapterSendsToLocalSmtpServer() throws Exception {
  try(var server=new ServerSocket(0,1,InetAddress.getLoopbackAddress())) {
   server.setSoTimeout(10000);var executor=Executors.newSingleThreadExecutor();
   try {
    Future<String> captured=executor.submit(()->{
     try(var socket=server.accept();var input=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.UTF_8));var output=new PrintWriter(socket.getOutputStream(),true,StandardCharsets.UTF_8)) {
      socket.setSoTimeout(10000);output.println("220 localhost SMTP test");var text=new StringBuilder();boolean data=false;
      for(String line;(line=input.readLine())!=null;){
       if(data){if(line.equals(".")){data=false;output.println("250 accepted");}else{text.append(line).append('\n');}continue;}
       if(line.startsWith("EHLO")||line.startsWith("HELO"))output.println("250 localhost");
       else if(line.startsWith("MAIL FROM")||line.startsWith("RCPT TO")){text.append(line).append('\n');output.println("250 OK");}
       else if(line.equals("DATA")){data=true;output.println("354 send data");}
       else if(line.equals("QUIT")){output.println("221 bye");break;}
       else output.println("250 OK");
      }return text.toString();
     }
    });
    var mail=new AuthorityMailer("127.0.0.1",server.getLocalPort(),"","","sender@example.test",false);
    assertThat(mail.ready()).isTrue();mail.send("authority@example.test","Jalachaya deadline test","Manual inspection requested",42);
    assertThat(captured.get(10,TimeUnit.SECONDS)).contains("authority@example.test","Jalachaya deadline test","Manual inspection requested","X-Jalachaya-Event: 42");
   }finally{executor.shutdownNow();}
  }
 }
}
