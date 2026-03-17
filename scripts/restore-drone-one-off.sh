#!/usr/bin/env bash
# One-off: rebuild restore file and restore into schema drone on TARGET.
# Uses TARGET_DATABASE_URL from .env.production.local and /tmp/test-public.sql.
# Run from project root: bash scripts/restore-drone-one-off.sh
set -e
cd "$(dirname "$0")/.."

load_var() {
  local file="$1" key="$2"
  [ ! -f "$file" ] && return 1
  grep -E "^[[:space:]]*${key}=" "$file" | head -1 | sed 's/^[^=]*=//; s/^["'\'']//; s/["'\'']$//; s/\r$//; s/^[[:space:]]*//; s/[[:space:]]*$//'
}

if [ -z "${TARGET_DATABASE_URL:-}" ] && [ -f .env.production.local ]; then
  TARGET_DATABASE_URL=$(load_var .env.production.local TARGET_DATABASE_URL)
fi
if [ -z "${TARGET_DATABASE_URL:-}" ]; then
  echo "ERROR: TARGET_DATABASE_URL not set. Add to .env.production.local or export it."
  exit 1
fi

if [ ! -s /tmp/test-public.sql ]; then
  echo "ERROR: /tmp/test-public.sql not found or empty. Run pg_dump first."
  exit 1
fi

PSQL="/opt/homebrew/opt/postgresql@17/bin/psql"
RESTORE_SQL="/tmp/restore-drone.sql"

echo "Rebuilding restore file..."
{
  echo "CREATE SCHEMA IF NOT EXISTS drone;"
  echo "SET search_path TO drone;"
  echo ""
  sed -e 's/"public"/"drone"/g' -e 's/public\./drone./g' \
      -e 's/SET search_path = drone\./SET search_path = drone/g' \
      -e 's/SET search_path = public/SET search_path = drone/g' \
      -e 's/SET search_path = "public"/SET search_path = drone/g' \
      -e 's/REFERENCES "drone"."users"(id)/REFERENCES auth.users(id)/g' \
      -e 's/REFERENCES drone\.users(id)/REFERENCES auth.users(id)/g' /tmp/test-public.sql | \
  grep -v -E '^SET (transaction_timeout|statement_timeout|idle_in_transaction_session_timeout) ' | \
  grep -v -E '^CREATE SCHEMA (public|"public");' | \
  grep -v 'battery_labels_owner_id_fkey'
} > "$RESTORE_SQL"
echo "Done. Restore file size: $(ls -lh "$RESTORE_SQL" | awk '{print $5}')"

echo "Dropping schema drone..."
"$PSQL" "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS drone CASCADE;"
echo "Creating schema drone..."
"$PSQL" "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA drone;"
echo "Restoring (this may take several minutes)..."
"$PSQL" "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$RESTORE_SQL"
echo "Done. Verify with: $PSQL \"\$TARGET_DATABASE_URL\" -c \"SET search_path TO drone; \\dt\""
