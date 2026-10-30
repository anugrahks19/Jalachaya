# Step 1: Build Spring Boot JAR
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app

# Pre-fetch dependencies to cache Docker layer
COPY pom.xml .
RUN mvn dependency:go-offline -B || true

# Copy source code and build production jar
COPY src ./src
RUN mvn clean package -DskipTests

# Step 2: Run application with JRE 17
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Create persistent storage directories
RUN mkdir -p /app/data /app/uploads

# Copy compiled jar
COPY --from=build /app/target/*.jar app.jar

# Render provides $PORT dynamically
ENV PORT=8080
ENV BIND_ADDRESS=0.0.0.0
EXPOSE 8080

# Keep memory usage under 400MB to avoid OOM kills on Render's 512MB free tier
ENTRYPOINT ["sh", "-c", "java -XX:+UseSerialGC -Xmx350m -Xss512k -jar app.jar"]

