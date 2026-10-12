FROM maven:3.9.11-eclipse-temurin-17-alpine AS build
WORKDIR /workspace
COPY pom.xml .
COPY src ./src
RUN mvn -B -ntp -DskipTests package

FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S game && adduser -S game -G game
WORKDIR /app
COPY --from=build /workspace/target/three-letter-boom-0.0.1-SNAPSHOT.jar app.jar
USER game
EXPOSE 8080
ENTRYPOINT ["java","-XX:MaxRAMPercentage=72","-XX:+UseSerialGC","-Djava.security.egd=file:/dev/urandom","-jar","/app/app.jar"]
