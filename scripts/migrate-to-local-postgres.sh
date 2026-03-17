#!/usr/bin/env bash
#
# Migrate database from Supabase cloud (public schema) to local Postgres (drone schema).
# Requires: SOURCE_DATABASE_URL, TARGET_DATABASE_URL
# Optional: set in .env.local and .env.production.local respectively; script will try to load them.
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Load from env files (allow optional leading space; strip quotes and CR)
load_var() {
  local file="$1" key="$2"
  [ ! -f "$file" ] && return 1
  grep -E "^[[:space:]]*${key}=" "$file" | head -1 | sed 's/^[^=]*=//; s/^["'\'']//; s/["'\'']$//; s/\r$//; s/^[[:space:]]*//; s/[[:space:]]*$//'
}
if [ -z "${SOURCE_DATABASE_URL:-}" ] && [ -f .env.local ]; then
  SOURCE_DATABASE_URL=$(load_var .env.local SOURCE_DATABASE_URL)
fi
if [ -z "${TARGET_DATABASE_URL:-}" ] && [ -f .env.production.local ]; then
  TARGET_DATABASE_URL=$(load_var .env.production.local TARGET_DATABASE_URL)
fi

if [ -z "${SOURCE_DATABASE_URL:-}" ]; then
  echo "ERROR: SOURCE_DATABASE_URL is not set."
  echo "  Add a line to .env.local: SOURCE_DATABASE_URL=postgresql://postgres.REF:PASSWORD@db.REF.supabase.co:5432/postgres"
  echo "  (Get the URI from Supabase Dashboard → Settings → Database → Connection string)"
  echo "  Or pass it when running: SOURCE_DATABASE_URL='...' TARGET_DATABASE_URL='...' $0"
  echo "See docs/MIGRATE_SUPABASE_TO_LOCAL_POSTGRES.md"
  exit 1
fi
if [ -z "${TARGET_DATABASE_URL:-}" ]; then
  echo "ERROR: TARGET_DATABASE_URL is not set. Add it to .env.production.local or pass it when running."
  echo "See docs/MIGRATE_SUPABASE_TO_LOCAL_POSTGRES.md"
  exit 1
fi

DUMP_SQL="$PROJECT_ROOT/.migrate-dump-public.sql"
RESTORE_SQL="$PROJECT_ROOT/.migrate-restore-drone.sql"

# Optional: use a specific Postgres bin dir (e.g. PostgreSQL 17 when server is 17 and system pg_dump is 14)
# Example: PGBIN=/opt/homebrew/opt/postgresql@17/bin ./scripts/migrate-to-local-postgres.sh
if [ -n "${PGBIN:-}" ]; then
  PG_DUMP="$PGBIN/pg_dump"
  PSQL="$PGBIN/psql"
else
  PG_DUMP=pg_dump
  PSQL=psql
fi

echo "=== Supabase (public) → Local Postgres (schema drone) ==="
echo "Source: ${SOURCE_DATABASE_URL%%@*}@***"
echo "Target: ${TARGET_DATABASE_URL%%@*}@***"
echo "Using: $PG_DUMP, $PSQL"
echo ""

# 1. Dump public schema from source (no owner/acl to avoid permission issues)
echo "[1/4] Dumping public schema from source (verbose progress below)..."
"$PG_DUMP" "$SOURCE_DATABASE_URL" \
  --schema=public \
  --no-owner \
  --no-privileges \
  --format=plain \
  --verbose \
  --file="$DUMP_SQL"

if [ ! -s "$DUMP_SQL" ]; then
  echo "ERROR: Dump file is empty. Check SOURCE_DATABASE_URL and network."
  exit 1
fi
echo "  Dump complete. Size: $(ls -lh "$DUMP_SQL" | awk '{print $5}')"

# 2. Transform dump: create drone schema and move all public objects into drone
echo "[2/4] Transforming dump for schema 'drone'..."
{
  echo "-- Migrated from Supabase public schema to local schema 'drone'"
  echo "CREATE SCHEMA IF NOT EXISTS drone;"
  echo "SET search_path TO drone;"
  echo ""
  # Replace all public schema references with drone (tables, sequences, COPY, quoted identifiers)
  # auth.users and other auth.* references are left unchanged
  # Force search_path to drone so no CREATE runs in public
  sed -e 's/"public"/"drone"/g' \
      -e 's/public\./drone./g' \
      -e 's/SET search_path = drone\./SET search_path = drone/g' \
      -e 's/SET search_path = public/SET search_path = drone/g' \
      -e 's/SET search_path = "public"/SET search_path = drone/g' \
      "$DUMP_SQL" | \
  grep -v -E '^SET (transaction_timeout|statement_timeout|idle_in_transaction_session_timeout) ' | \
  grep -v -E '^CREATE SCHEMA (public|"public");'
} > "$RESTORE_SQL"
# Fix double drone.drone if any (search_path line)
sed -i.bak 's/search_path = drone\.drone/search_path = drone/g' "$RESTORE_SQL" 2>/dev/null || true
rm -f "$RESTORE_SQL.bak" 2>/dev/null || true
echo "  Transform complete. Restore file size: $(ls -lh "$RESTORE_SQL" | awk '{print $5}')"

# 3. Create schema on target (idempotent) and restore
echo "[3/4] Creating schema 'drone' on target (if not exists)..."
"$PSQL" "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS drone;" 2>/dev/null || true

echo "[4/4] Restoring data into schema 'drone' (may take several minutes for large DB)..."
START_TS=$(date +%s)
"$PSQL" "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$RESTORE_SQL" &
RESTORE_PID=$!
while kill -0 "$RESTORE_PID" 2>/dev/null; do
  sleep 30
  ELAPSED=$(($(date +%s) - START_TS))
  echo "  ... still restoring (${ELAPSED}s elapsed)"
done
wait "$RESTORE_PID" || exit 1
echo "  Restore complete. Total time: $(($(date +%s) - START_TS))s"

# Verify: no app tables in public, all in drone
echo ""
echo "Verifying schemas..."
PUBLIC_COUNT=$("$PSQL" "$TARGET_DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "?")
DRONE_COUNT=$("$PSQL" "$TARGET_DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'drone' AND table_type = 'BASE TABLE';" 2>/dev/null || echo "?")
echo "  Tables in public: $PUBLIC_COUNT (migration does not write here)"
echo "  Tables in drone:  $DRONE_COUNT"
if [ "${PUBLIC_COUNT:-0}" -gt 0 ] 2>/dev/null; then
  echo "  Note: public has tables (may be pre-existing): $("$PSQL" "$TARGET_DATABASE_URL" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';" 2>/dev/null | tr '\n' ' ')"
fi

# Cleanup
rm -f "$DUMP_SQL" "$RESTORE_SQL"
echo ""
echo "Done. Verify with: $PSQL \"\$TARGET_DATABASE_URL\" -c \"SET search_path TO drone; \\dt\""
