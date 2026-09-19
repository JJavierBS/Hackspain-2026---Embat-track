#!/bin/sh
# DuckDB opens the file read-write even when the app only reads it, so the data directory has to
# exist and be writable before Spring starts.
#
# The script starts as root: a Render disk (render.yaml) mounts at /data owned by root, and the image
# directory under it is hidden. It gives the directory to the xray user, then runs Java as that user.
set -e

DATA_DIR="${XRAY_DATA_DIR:-/data}"
SHIPPED=/opt/xray/xray-demo.duckdb.gz
MARKER="$DATA_DIR/.shipped-db.sha256"

mkdir -p "$DATA_DIR"

# Demo mode serves a frozen database (SPEC §14). The data directory keeps its database, its run copy
# and the Algorithm page edits across restarts. A new image that ships a different database replaces
# them all: the shipped database was exported with the shipped config, so an old edit does not apply.
if [ -f "$SHIPPED" ]; then
    shipped_sum=$(sha256sum "$SHIPPED" | cut -d' ' -f1)
    stored_sum=$(cat "$MARKER" 2>/dev/null || true)
    if [ ! -f "$DATA_DIR/xray.duckdb" ] || [ "$shipped_sum" != "$stored_sum" ]; then
        echo "unpacking the frozen demo database into $DATA_DIR"
        rm -rf "$DATA_DIR/xray.duckdb" "$DATA_DIR/xray.duckdb.wal" "$DATA_DIR/xray.duckdb.tmp" \
               "$DATA_DIR/xray.run.duckdb" "$DATA_DIR/xray.run.duckdb.wal" "$DATA_DIR/scoring-overrides.yml"
        gzip -dc "$SHIPPED" > "$DATA_DIR/xray.duckdb.part"
        mv "$DATA_DIR/xray.duckdb.part" "$DATA_DIR/xray.duckdb"
        echo "$shipped_sum" > "$MARKER"
    fi
fi

if [ "$(id -u)" = "0" ]; then
    chown -R xray:xray "$DATA_DIR"
    # JAVA_OPTS is deliberately unquoted: it carries several flags.
    exec setpriv --reuid=xray --regid=xray --init-groups java $JAVA_OPTS -jar /app/app.jar "$@"
fi

exec java $JAVA_OPTS -jar /app/app.jar "$@"
