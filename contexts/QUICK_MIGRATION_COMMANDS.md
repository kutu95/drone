# Quick Migration Commands - Copy and Paste on Server

Run these commands directly on your server. Copy and paste them one section at a time.

## Step 1: Verify Supabase is Running

```bash
supabase status
```

If not running:
```bash
supabase start
```

## Step 2: Get Your Cloud Connection String

1. Go to: https://supabase.com/dashboard/project/uiknuzhkrljfbvxjhsxr
2. Settings → Database → Connection String
3. Select **Session Mode** (not Transaction Mode)
4. Copy the connection string

## Step 3: Export from Cloud

Replace `YOUR_CONNECTION_STRING` with the connection string from Step 2:

```bash
pg_dump "YOUR_CONNECTION_STRING" \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/drone_cloud_backup.dump
```

## Step 4: Import to Local Supabase

```bash
pg_restore \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/drone_cloud_backup.dump
```

## Step 5: Verify Migration

```bash
# Check tables
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\dt"

# Check row counts
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SELECT COUNT(*) FROM missions;"
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SELECT COUNT(*) FROM flight_logs;"
```

## Alternative: If Schema Already Exists

If you've already run migrations and just need to import data:

```bash
# Export data only (no schema)
pg_dump "YOUR_CONNECTION_STRING" \
  --data-only \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/drone_cloud_data.dump

# Import data only
pg_restore \
  --data-only \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/drone_cloud_data.dump
```

---

**That's it!** Then check in Supabase Studio: http://192.168.0.146:54323/





