# The build context is the repo root (see docker-compose.yml and render.yaml) so that the frozen
# demo database under data/ can be copied into the image.
# glibc base images: the DuckDB JDBC native library does not load on Alpine (musl).
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build
COPY backend/.mvn/ .mvn/
COPY backend/mvnw backend/pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY backend/src/ src/
RUN ./mvnw -q -B package -DskipTests && cp target/*.jar app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN useradd --system --create-home --uid 10001 xray

COPY --from=build /build/app.jar app.jar
# The API only ever reads results tables, so the image ships the slice scripts/ExportDemoDb.java
# writes (~31 MB gzipped) rather than the full pipeline database (~247 MB). It is expanded at
# startup, not here: that keeps the image small and leaves a mounted volume's own copy untouched.
COPY --chown=xray:xray data/xray-demo.duckdb.gz /opt/xray/xray-demo.duckdb.gz
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Demo mode is the deployed configuration (ARCHITECTURE §10): no ingest, no pipeline, no CSVs.
# MaxRAMPercentage rather than -Xmx so one image fits whatever instance size Render gives it;
# the rest of the container's memory is left to DuckDB's buffer pool.
ENV XRAY_DATA_DIR=/data \
    XRAY_DEMO_MODE=true \
    JAVA_OPTS="-XX:MaxRAMPercentage=55 -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC"

RUN mkdir -p /data && chown xray:xray /data && chmod +x /usr/local/bin/docker-entrypoint.sh

USER xray
# Render injects $PORT and application.yml prefers it; this is the local default.
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
