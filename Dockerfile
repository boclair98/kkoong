FROM maven:3.9.11-eclipse-temurin-21-alpine AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S game && adduser -S game -G game
WORKDIR /app
COPY --from=build /workspace/target/three-letter-boom-0.0.1-SNAPSHOT.jar app.jar
USER game
EXPOSE 8080
ENTRYPOINT ["java","-XX:MaxRAMPercentage=72","-XX:+UseSerialGC","-Djava.security.egd=file:/dev/urandom","-jar","/app/app.jar"]
