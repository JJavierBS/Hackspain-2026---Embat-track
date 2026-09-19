#!/bin/sh
# DuckDB opens the file read-write even when the app only reads it, so the data directory has to
# exist and be writable before Spring starts.
set -e

DATA_DIR="${XRAY_DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# Demo mode serves a frozen database (SPEC §14). Unpack the one baked into the image only when the
# data directory has none: a bind mount in compose, or a Render disk, keeps whatever is already there.
if [ ! -f "$DATA_DIR/xray.duckdb" ] && [ -f /opt/xray/xray-demo.duckdb.gz ]; then
    echo "unpacking the frozen demo database into $DATA_DIR"
    gzip -dc /opt/xray/xray-demo.duckdb.gz > "$DATA_DIR/xray.duckdb"
fi

# JAVA_OPTS is deliberately unquoted: it carries several flags.
exec java $JAVA_OPTS -jar /app/app.jar "$@"
