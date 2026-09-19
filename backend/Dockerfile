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
# (~49 MB gzipped), not the full pipeline database (~450 MB). It is expanded at startup, not here:
# that keeps the image small and leaves a mounted volume's own copy untouched.
COPY --chown=xray:xray demo/xray-demo.duckdb.gz /opt/xray/xray-demo.duckdb.gz
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# No CSVs in the image, so S00..S25 skip. The slice carries what S30 onwards reads. XRAY_DEMO_MODE is
# not set here (the app default is false): render.yaml and docker-compose.yml set it to "true", so the
# deployed app serves the precomputed data and the pipeline never runs.
# MaxRAMPercentage rather than -Xmx so one image fits whatever instance size Render gives it.
# Measured in a 512 MB / 0.5 CPU container, like the starter plan, over three pipeline runs in a row:
# live heap 175-233 MB (the panels), non-heap ~85 MB, the rest is DuckDB and thread stacks. With
# DuckDB at 96 MB and 2 threads and a 55% heap, the container passed 512 MB in S50 and was OOM killed.
# These values finish three runs with no kill, but anonymous memory still reaches ~470 MB.
# - DuckDB: its default is 80% of the RAM it sees. At 64 MB it spills to /data sooner.
# - TieredStopAtLevel=1 and a 48 MB code cache: C1 only, less JIT memory. The pipeline is SQL-bound.
# - Xss512k: every Tomcat and pipeline thread reserves a smaller stack.
# MALLOC_ARENA_MAX stops glibc from giving each pipeline thread its own native memory pool.
# ExitOnOutOfMemoryError: a heap OutOfMemoryError can kill any thread, Tomcat's poller included, which
# leaves a process that answers nothing. Exiting lets Render restart it, with the database on its disk.
ENV XRAY_DATA_DIR=/data \
    XRAY_DUCKDB_MEMORY_LIMIT=64MB \
    XRAY_DUCKDB_THREADS=1 \
    MALLOC_ARENA_MAX=2 \
    JAVA_OPTS="-XX:MaxRAMPercentage=50 -XX:MaxMetaspaceSize=128m -XX:ReservedCodeCacheSize=48m -XX:TieredStopAtLevel=1 -Xss512k -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError"

RUN mkdir -p /data && chown xray:xray /data && chmod +x /usr/local/bin/docker-entrypoint.sh

# No USER line: the entrypoint starts as root, gives /data to xray (a Render disk mounts owned by
# root), then runs Java as xray.
# Render injects $PORT and application.yml prefers it; this is the local default.
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
