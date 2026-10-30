# Step 1: Build Spring Boot JAR
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app
ENV MAVEN_OPTS="-Xmx384m"

# Copy pom and source code, then build production jar
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests -B

# Step 2: Run application with JRE 17
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Create persistent storage directories and sample assets directory
RUN mkdir -p /app/data /app/uploads /assets/samples

# Copy sample images and compiled jar
COPY --from=build /app/src/main/resources/samples/ /assets/samples/
COPY --from=build /app/target/*.jar app.jar

# Render provides $PORT dynamically; provide safe defaults for all required env vars
ENV PORT=8080
ENV BIND_ADDRESS=0.0.0.0
ENV JWT_SECRET=jalachaya-default-jwt-secret-key-at-least-32-bytes-long-2026
ENV ENABLE_JUDGE_DEMO=true
ENV AI_ENABLED=false
ENV FRONTEND_ORIGINS=https://jalachaya.onrender.com,https://*.onrender.com,http://localhost:5500,http://127.0.0.1:5500
EXPOSE 8080

# Keep memory usage under 400MB to avoid OOM kills on Render's 512MB free tier
ENTRYPOINT ["sh", "-c", "java -XX:+UseSerialGC -Xmx350m -Xss512k -jar app.jar"]
