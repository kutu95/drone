# Migrate database from Supabase cloud to local Postgres (schema `drone`)

This guide migrates the **data structure and data** from your Supabase.com project into a **local PostgreSQL server** at `192.168.0.146`, placing everything in a schema named **`drone`** (shared database).

## Prerequisites

- **Source**: Supabase.com project (connection details in `.env.local`).
- **Target**: Local Postgres at `192.168.0.146` (connection details in `.env.production.local`).
- `pg_dump` and `psql` (PostgreSQL client tools) installed on the machine where you run the migration.

**Where to run:** Run the migration from your **local/dev machine** (where you have the full repo, `scripts/migrate-to-local-postgres.sh`, and `.env.local` / `.env.production.local`). That machine must be able to reach both Supabase (internet) and `192.168.0.146` (your network). Do not run it on the server unless you copy the script and set the env vars there (see below).

## 1. Get database connection strings

### Source (Supabase cloud)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. **Settings** → **Database**.
3. Under **Connection string**, choose **URI** and copy either:
   - **Session mode** (port 5432), or  
   - **Transaction mode** (port 6543).  
   Use the **pooler** host: `aws-0-[region].pooler.supabase.com` (do **not** use `db.xxx.supabase.co` — it often fails to resolve). Use your actual **database password** (not the anon key).

Add to **`.env.local`** (do not commit this file):

```bash
# Use the pooler URI from Dashboard (Session or Transaction); avoid db.xxx.supabase.co
SOURCE_DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
```

### Target (local Postgres at 192.168.0.146)

You need a direct Postgres connection to the local server, e.g.:

- If using **Supabase locally** on that host: usually `postgresql://postgres:postgres@192.168.0.146:54322/postgres` (port `54322` is common for Supabase Postgres).
- If using **plain Postgres**: `postgresql://USER:PASSWORD@192.168.0.146:5432/postgres`.

Add to **`.env.production.local`** (do not commit):

```bash
# Direct Postgres URL for migration (local server)
TARGET_DATABASE_URL=postgresql://postgres:postgres@192.168.0.146:54322/postgres
```

(If you prefer not to put URLs in env files, you can pass them when running the script; see step 2.)

**Important:** The target database must have (or will get) an **`auth`** schema with an **`auth.users`** table if your tables reference it (e.g. `owner_id REFERENCES auth.users(id)`). If you use Supabase locally, this already exists. If not, you may need to create a minimal `auth.users` or adjust foreign keys after migration.

## 2. Run the migration script

**Run this on your local/dev machine** (where the Drone repo and env files live), not on the server.

From the project root (e.g. `~/Documents/Drone` or wherever you have the repo):

```bash
# Load URLs from env files (script will read SOURCE_DATABASE_URL and TARGET_DATABASE_URL)
export SOURCE_DATABASE_URL="$(grep -E '^SOURCE_DATABASE_URL=' .env.local | cut -d= -f2-)"
export TARGET_DATABASE_URL="$(grep -E '^TARGET_DATABASE_URL=' .env.production.local | cut -d= -f2-)"

chmod +x scripts/migrate-to-local-postgres.sh
./scripts/migrate-to-local-postgres.sh
```

If you don’t have `.env.local` / `.env.production.local` in that directory, set the URLs explicitly:

```bash
SOURCE_DATABASE_URL='postgresql://postgres.xxx:pass@aws-0-xx.pooler.supabase.com:6543/postgres' \
TARGET_DATABASE_URL='postgresql://postgres:postgres@192.168.0.146:54322/postgres' \
./scripts/migrate-to-local-postgres.sh
```

**If you must run on the server:** Pull the latest code (so `scripts/migrate-to-local-postgres.sh` exists), then create the env vars there (e.g. `export SOURCE_DATABASE_URL=...` and `TARGET_DATABASE_URL=...`) and run the script from the app directory. The server must be able to reach Supabase (outbound internet).

The script will:

1. Dump the **public** schema from the source (Supabase cloud).
2. Transform the dump so all objects go into schema **`drone`** (create schema, replace `public` with `drone` where appropriate).
3. Create schema **`drone`** on the target (if not exists) and restore the transformed dump.

## 3. Verify

On the target:

```bash
psql "$TARGET_DATABASE_URL" -c "SET search_path TO drone; \dt"
```

You should see your tables (e.g. `flight_logs`, `missions`, `mission_waypoints`, …) in schema `drone`. Check row counts:

```bash
psql "$TARGET_DATABASE_URL" -c "SET search_path TO drone; SELECT 'flight_logs', COUNT(*) FROM drone.flight_logs UNION ALL SELECT 'flight_log_data_points', COUNT(*) FROM drone.flight_log_data_points;"
```

## 4. Point the app at the local database

After migration, use the local Postgres for the app:

- **API/base URL**: If you use Supabase API on the same host, keep `NEXT_PUBLIC_SUPABASE_URL` (e.g. `http://192.168.0.146:54321`) in `.env.production.local`.
- **Schema**: Set `NEXT_PUBLIC_SUPABASE_SCHEMA=drone` in `.env.production.local` so the app uses the `drone` schema.

Your `.env.production.local` already uses `NEXT_PUBLIC_SUPABASE_SCHEMA=drone`; ensure the app’s Supabase client is configured to use the local URL and this schema.

## 5. Migrate Storage buckets (e.g. photo-thumbnails)

The database migration does **not** copy Storage buckets; those are separate. The app uses at least:

- **photo-thumbnails** – thumbnail images
- **photo-originals** – original photos (if used)
- **orthomosaics** – orthomosaic outputs (if used)

To copy bucket contents from source Supabase to target (e.g. local), run:

```bash
# From project root – migrates photo-thumbnails by default
npx tsx scripts/migrate-storage-buckets.ts

# Or specify buckets (and optional dry-run)
npx tsx scripts/migrate-storage-buckets.ts photo-thumbnails photo-originals
npx tsx scripts/migrate-storage-buckets.ts photo-thumbnails --dry-run
```

The script reads **source** from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`) and **target** from `.env.production.local`. It lists all objects in each bucket, downloads from source, and uploads to target (creating the bucket on target if needed). Ensure the target project has Storage enabled and that RLS allows the key you use (e.g. a **service role** key for full access).

## Troubleshooting

- **"server version: 17.x; pg_dump version: 14.x … aborting because of server version mismatch"**  
  Supabase uses PostgreSQL 17; your local `pg_dump` must be the same or newer. Install PostgreSQL 17 and point the script at it:
  ```bash
  brew install postgresql@17
  PGBIN=/opt/homebrew/opt/postgresql@17/bin ./scripts/migrate-to-local-postgres.sh
  ```
  (On Intel Macs, use `PGBIN=/usr/local/opt/postgresql@17/bin`.)

- **"could not translate host name db.xxx.supabase.co"**  
  The direct host `db.PROJECT_REF.supabase.co` often doesn’t resolve. Use the **pooler** connection string instead: Supabase Dashboard → Settings → Database → Connection string → **URI** for **Session** or **Transaction** mode. The host should be `aws-0-REGION.pooler.supabase.com` (e.g. `aws-0-ap-southeast-2.pooler.supabase.com`). Port 5432 = Session, 6543 = Transaction.

- **"relation auth.users does not exist"**  
  The target DB has no `auth.users`. Create a minimal `auth` schema and `auth.users` table, or restore/migrate auth from Supabase (e.g. export `auth` schema and restore), or temporarily drop FKs to `auth.users` and re-add after creating the table.

- **Connection refused to Supabase**  
  Use the **Session pooler** (port 5432) or **Transaction pooler** (6543) URI from the dashboard; ensure your IP is allowed (Supabase → Settings → Database → Network).

- **Connection refused to 192.168.0.146**  
  Confirm Postgres is listening on that host/port and that firewall allows it. For Supabase local, the default DB port is often `54322`.

- **Permission denied on schema drone**  
  Ensure the target DB user has `CREATE` on the database and `CREATE` on schema `drone` (or run the script as a superuser once to create the schema).
