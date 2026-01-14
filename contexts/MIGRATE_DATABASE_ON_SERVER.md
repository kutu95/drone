# Quick Database Migration - Run on Server

The migration script isn't on the server yet. Here are your options:

## Option 1: Transfer Script from Local Machine

**On your Mac (in a new terminal):**

```bash
scp /Users/bowskill/Documents/Drone/migrate-database.sh john@192.168.0.146:~/apps/drone/
```

Then on server:
```bash
cd ~/apps/drone
chmod +x migrate-database.sh
./migrate-database.sh
```

## Option 2: Create Script Directly on Server

**SSH to server and create the script:**

```bash
cd ~/apps/drone
nano migrate-database.sh
```

Then paste the script content (see below) and save.

## Option 3: Run Commands Manually (Fastest)

Just run these commands directly on your server:

```bash
cd ~/apps/drone

# Step 1: Get your cloud connection string
# Go to: https://supabase.com/dashboard/project/uiknuzhkrljfbvxjhsxr
# Settings → Database → Connection String → Session Mode
# Copy the connection string

# Step 2: Export from cloud (replace with your connection string)
pg_dump "postgresql://postgres.YOUR_REF:YOUR_PASSWORD@aws-0-YOUR_REGION.pooler.supabase.com:5432/postgres" \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/cloud_backup.dump

# Step 3: Import to local Supabase
pg_restore \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/cloud_backup.dump

# Step 4: Verify
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\dt"
```

## Option 4: Run Migrations First, Then Data

If you want to run migrations first (recommended if schema doesn't exist):

```bash
cd ~/apps/drone

# Run all migrations
for migration in supabase/migrations/*.sql; do
    echo "Running $migration..."
    psql "postgresql://postgres:postgres@localhost:54322/postgres" < "$migration"
done

# Then migrate data only (use --data-only flag)
pg_dump "YOUR_CLOUD_CONNECTION_STRING" \
  --data-only \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/cloud_data.dump

pg_restore \
  --data-only \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/cloud_data.dump
```

## Quick Check

First, verify Supabase is running:
```bash
supabase status
```

If not running:
```bash
supabase start
```

Then choose one of the options above!





