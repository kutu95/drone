#!/usr/bin/env bash
# Resume restore from COPY battery_labels onward. Does not re-run already-loaded data.
# Run from project root. Set SOURCE_OWNER_ID and TARGET_OWNER_ID to replace owner_id in remaining data.
#
# Usage:
#   export TARGET_DATABASE_URL='...'   # or script loads from .env.production.local
#   export SOURCE_OWNER_ID='9e69934c-d2e0-4a32-a5a0-873ee7b4ff74'   # from source auth.users
#   export TARGET_OWNER_ID='<your-target-auth-users-uuid>'          # from target auth.users
#   bash scripts/resume-restore-after-battery-labels.sh
#
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
  echo "ERROR: TARGET_DATABASE_URL not set."
  exit 1
fi

if [ ! -s /tmp/restore-drone.sql ]; then
  echo "ERROR: /tmp/restore-drone.sql not found. Rebuild it with the one-off script first (or keep the one from the failed run)."
  exit 1
fi

PSQL="/opt/homebrew/opt/postgresql@17/bin/psql"
TAIL_SQL="/tmp/restore-drone-tail.sql"

# Find first line that starts COPY for battery_labels (handles "COPY drone.battery_labels" or "COPY ... battery_labels")
FIRST_LINE=$(grep -n '^COPY.*battery_labels' /tmp/restore-drone.sql | head -1 | cut -d: -f1)
if [ -z "$FIRST_LINE" ]; then
  echo "ERROR: Could not find 'COPY ... battery_labels' in /tmp/restore-drone.sql"
  exit 1
fi

echo "Found COPY battery_labels at line $FIRST_LINE. Extracting tail..."
tail -n +"$FIRST_LINE" /tmp/restore-drone.sql > "$TAIL_SQL"
echo "Tail size: $(ls -lh "$TAIL_SQL" | awk '{print $5}')"

# Optional: replace source owner_id with target owner_id in the tail (so FKs to auth.users work)
if [ -n "${SOURCE_OWNER_ID:-}" ] && [ -n "${TARGET_OWNER_ID:-}" ]; then
  echo "Replacing owner_id $SOURCE_OWNER_ID -> $TARGET_OWNER_ID in tail..."
  sed -i.bak "s/$SOURCE_OWNER_ID/$TARGET_OWNER_ID/g" "$TAIL_SQL"
  rm -f "$TAIL_SQL.bak"
fi

# Truncate every table that has a COPY in the tail (avoids duplicate key when re-running)
TABLES_IN_TAIL=$(grep -oE '^COPY [^ (]+' "$TAIL_SQL" | sed 's/^COPY //' | tr -d '"' | sed 's/^drone\.//' | sort -u | tr '\n' ',' | sed 's/,$//')
if [ -n "$TABLES_IN_TAIL" ]; then
  echo "Truncating tables that appear in tail (will be re-loaded): $TABLES_IN_TAIL"
  "$PSQL" "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
    SET search_path TO drone;
    ALTER TABLE battery_labels DROP CONSTRAINT IF EXISTS battery_labels_owner_id_fkey;
    TRUNCATE TABLE $TABLES_IN_TAIL CASCADE;
  " 2>/dev/null || true
fi

echo "Running tail of restore (from COPY battery_labels to end)..."
"$PSQL" "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$TAIL_SQL"

echo "Re-adding FK to auth.users (so owner_id must exist in auth.users)..."
"$PSQL" "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
  SET search_path TO drone;
  ALTER TABLE battery_labels
    ADD CONSTRAINT battery_labels_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
" 2>/dev/null || echo "(FK add skipped or already exists)"

echo "Done. If you have more source owner_ids to map, run UPDATEs on already-restored tables, e.g.:"
echo "  $PSQL \"\$TARGET_DATABASE_URL\" -c \"SET search_path TO drone; UPDATE battery_labels SET owner_id = '\$TARGET_OWNER_ID' WHERE owner_id = '\$SOURCE_OWNER_ID';\""
echo "  (and similarly for flight_logs, missions, etc. if needed)"
