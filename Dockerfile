# Build Stage
FROM gradle:8.5-jdk17 AS build
WORKDIR /home/gradle/project

# Copy the backend source code
COPY --chown=gradle:gradle backend/ .

# Build the fat JAR
RUN gradle buildFatJar --no-daemon

# Runtime Stage
FROM eclipse-temurin:17-jre
WORKDIR /app

# Copy the built fat JAR from the build stage
# The default output for Ktor's buildFatJar is in build/libs/
COPY --from=build /home/gradle/project/build/libs/*-all.jar app.jar

# Copy the frontend static files
COPY frontend/ ./frontend/

# Set the port (Render provides this, but we'll default to 8080)
ENV PORT=8080
EXPOSE 8080

# Run the application
CMD ["java", "-jar", "app.jar"]
