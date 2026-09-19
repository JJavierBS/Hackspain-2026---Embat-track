# Build context is this directory (docker-compose.yml and render.yaml both point at backend/), so
# demo/xray-demo.duckdb.gz lives here rather than under data/: nothing outside the context is reachable.
# glibc base images: the DuckDB JDBC native library does not load on Alpine (musl).
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY src/ src/
RUN ./mvnw -q -B package -DskipTests && cp target/*.jar app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN useradd --system --create-home --uid 10001 xray

COPY --from=build /build/app.jar app.jar
# The image ships the slice scripts/ExportDemoDb.java writes: the results tables plus the S30 inputs
# (~46 MB gzipped), not the full pipeline database (~450 MB). It is expanded at startup, not here:
# that keeps the image small and leaves a mounted volume's own copy untouched.
COPY --chown=xray:xray demo/xray-demo.duckdb.gz /opt/xray/xray-demo.duckdb.gz
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# No CSVs in the image, so S00..S25 skip. The slice carries what S30 onwards reads, so an edit on the
# Algorithm page, or POST /api/pipeline/run, recalculates in place. XRAY_DEMO_MODE is not set here (the
# app default is false). Set XRAY_DEMO_MODE=true on the service to lock both.
# MaxRAMPercentage rather than -Xmx so one image fits whatever instance size Render gives it.
# On the 512 MB starter plan a pipeline run needs ~280 MB of heap (S60/S65 write in batches), so
# DuckDB is capped: its default is 80% of the RAM it sees, which leaves no room for the JVM. Measured
# on 512 MB / 0.5 CPU: JVM ~420 MB committed (heap ~280), DuckDB ~60 MB. It spills to /data past 96 MB.
# MALLOC_ARENA_MAX stops glibc from giving each pipeline thread its own native memory pool.
# ExitOnOutOfMemoryError: a heap OutOfMemoryError can kill any thread, Tomcat's poller included, which
# leaves a process that answers nothing. Exiting lets Render restart it (from the shipped database).
ENV XRAY_DATA_DIR=/data \
    XRAY_DUCKDB_MEMORY_LIMIT=96MB \
    XRAY_DUCKDB_THREADS=2 \
    MALLOC_ARENA_MAX=2 \
    JAVA_OPTS="-XX:MaxRAMPercentage=55 -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError"

RUN mkdir -p /data && chown xray:xray /data && chmod +x /usr/local/bin/docker-entrypoint.sh

USER xray
# Render injects $PORT and application.yml prefers it; this is the local default.
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
