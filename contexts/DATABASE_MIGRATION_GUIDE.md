# Database Migration Guide - Drone App

Complete guide for migrating your Drone app database from Supabase Cloud to local server Supabase.

## Overview

This guide covers:
1. Setting up local Supabase (if not already done)
2. Running migrations to create schema
3. Migrating data from cloud to local
4. Exposing Supabase through Cloudflare Tunnel
5. Updating environment variables

### Important: Schema Configuration

The Drone app uses the `drone` schema instead of the default `public` schema. This allows multiple projects to share the same database while maintaining isolation. All migrations automatically create and use the `drone` schema.

See `contexts/SCHEMA_MANAGEMENT.md` for detailed schema management commands.

## Prerequisites

### On Your Server

- Supabase CLI installed and local instance running
- PostgreSQL client tools installed
- Access to your cloud Supabase connection string

### Required Information

- **Cloud Supabase Connection String** (Session Pooler):
  - Format: `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
  - Find in: Supabase Dashboard → Settings → Database → Connection String → Session Mode
  
- **Current Cloud Supabase URL**: `https://uiknuzhkrljfbvxjhsxr.supabase.co`

## Step 1: Verify Local Supabase is Running

**SSH to your server:**

```bash
ssh <username>@192.168.0.146
```

**Check Supabase status:**

```bash
supabase status
```

If Supabase is not running, start it:

```bash
# Navigate to Supabase directory (if exists)
cd ~/supabase  # or wherever your Supabase is located

# Start Supabase
supabase start
```

**Note:** If Supabase is not installed, see the "Installing Local Supabase" section below.

You should see:
- API URL: `http://127.0.0.1:54321`
- Studio URL: `http://127.0.0.1:54323`
- Database URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Step 2: Run Migrations

Your app has migrations in `supabase/migrations/` that need to be run on the local database.

### Option A: Using Supabase CLI (Recommended)

**On your server, navigate to your app directory:**

```bash
cd ~/apps/drone

# If you haven't initialized Supabase locally for this project:
supabase init

# Link to local Supabase (if needed)
# supabase link --project-ref local

# Run all migrations
supabase db reset

# Or run migrations one by one:
supabase migration up
```

### Option B: Run Migrations Manually

**Connect to local database and run migrations:**

```bash
# Connect to local Supabase database
psql "postgresql://postgres:postgres@localhost:54322/postgres"

# Or if Supabase is on another machine:
# psql "postgresql://postgres:postgres@192.168.0.146:54322/postgres"
```

**Run each migration file in order:**

```sql
-- Run migration files one by one
\i /path/to/001_initial_schema.sql
\i /path/to/002_flight_logs.sql
-- ... etc
```

**Or from command line:**

```bash
# Run all migrations in order
cd ~/apps/drone
for migration in supabase/migrations/*.sql; do
    echo "Running $migration..."
    psql "postgresql://postgres:postgres@localhost:54322/postgres" < "$migration"
done
```

### Migration Files Order

Your migrations should be run in this order:

0. `000_create_drone_schema.sql` - Creates the drone schema (runs automatically first)
1. `001_initial_schema.sql` - Base schema (missions, waypoints, profiles)
2. `002_flight_logs.sql` - Flight logs tables
3. `003_add_photo_filename.sql` - Photo filename support
4. `004_battery_labels.sql` - Battery labels
5. `005_fleet_drones.sql` - Fleet drones
6. `006_flight_log_warnings_errors.sql` - Warnings/errors
7. `007_add_battery_health_fields.sql` - Battery health
8. `008_battery_stats_cache.sql` - Battery stats cache
9. `009_add_photo_thumbnails.sql` - Photo thumbnails
10. `010_add_original_file_url.sql` - Original file URLs
11. `011_store_local_file_paths.sql` - Local file paths
12. `013_photo_count_aggregation.sql` - Photo count aggregation
13. `014_add_mapping_missions.sql` - Mapping missions

## Step 3: Migrate Data from Cloud

Now that your schema is set up, migrate the actual data.

### Get Cloud Connection String

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/uiknuzhkrljfbvxjhsxr
2. Settings → Database → Connection String
3. Select **Session Mode** (not Transaction Mode)
4. Copy the connection string

### Export from Cloud

**On your server (or locally with SSH tunnel):**

```bash
# Export database (replace with your actual connection string)
pg_dump "postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/cloud_backup.dump
```

**Note:** You can also export just data (without schema) since we've already created the schema:

```bash
# Export data only (after schema is created)
pg_dump "postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  --data-only \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/cloud_data_only.dump
```

### Import to Local Supabase

**Import the data:**

```bash
# Import data only (recommended if schema already exists)
pg_restore \
  --data-only \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/cloud_data_only.dump

# Or import full database (will recreate schema)
pg_restore \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/cloud_backup.dump
```

### Verify Import

```bash
# Check tables were created
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\dt"

# Check row counts
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "
SELECT 
  schemaname,
  tablename,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_schema = schemaname AND table_name = tablename) AS column_count
FROM pg_tables 
WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'auth')
ORDER BY tablename;
"

# Check data in specific tables
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SELECT COUNT(*) FROM missions;"
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SELECT COUNT(*) FROM flight_logs;"
```

**Or check in Supabase Studio:**

Open: `http://192.168.0.146:54323/` and verify tables and data are present.

## Step 4: Expose Supabase Through Cloudflare Tunnel

To access Supabase from your app over HTTPS, expose it through Cloudflare Tunnel.

### Step 1: Create DNS Record

**On your server:**

```bash
# Choose a subdomain (e.g., supabase.landlife.au or supabase-drone.landlife.au)
SUPABASE_DOMAIN="supabase.landlife.au"
TUNNEL_NAME="farm-cashbook"  # Your existing tunnel

# Create DNS record
cloudflared tunnel route dns $TUNNEL_NAME "$SUPABASE_DOMAIN"
```

### Step 2: Update Tunnel Configuration

**Edit tunnel config:**

```bash
nano ~/.cloudflared/config.yml
```

**Add at the TOP of the ingress list** (order matters!):

```yaml
ingress:
  # NEW - Supabase for Drone app
  - hostname: supabase.landlife.au
    service: http://localhost:54321
  # ... existing rules below ...
  - hostname: drone.landlife.au
    service: http://localhost:3002
  # ... rest of config ...
```

### Step 3: Restart Tunnel

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

### Step 4: Test Supabase Over HTTPS

Wait 1-2 minutes for DNS, then:

```bash
curl -I https://supabase.landlife.au/health
# Or
curl -I https://supabase.landlife.au/rest/v1/
```

## Step 5: Get Local Supabase Keys

**Get your local Supabase API keys:**

```bash
supabase status
```

This will show:
- API URL
- Anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY)
- Service role key (SUPABASE_SERVICE_ROLE_KEY)

**Or check in Supabase Studio:**

1. Open: `http://192.168.0.146:54323/`
2. Go to Settings → API
3. Copy the keys

**Default local keys (if not customized):**
- Anon key: Usually starts with `eyJ...` (JWT token)
- Service role key: Usually starts with `eyJ...` (JWT token)

## Step 6: Update Environment Variables

### On Server (Production)

**Update `.env.production`:**

```bash
cd ~/apps/drone
nano .env.production
```

**Update Supabase URLs:**

```bash
# Use HTTPS tunnel URL for production
NEXT_PUBLIC_SUPABASE_URL=https://supabase.landlife.au

# Or use HTTP if accessing directly on server (not recommended)
# NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321

# Add your local Supabase keys
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-key>
```

**Get keys from:**
- `supabase status` command
- Supabase Studio → Settings → API

### On Local Machine (Development)

**Update `.env.local` (for local development):**

```bash
# Option 1: SSH tunnel to server Supabase
# First create tunnel:
# ssh -L 54321:localhost:54321 <username>@192.168.0.146
# Then use:
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321

# Option 2: Direct connection (if Supabase is accessible on network)
NEXT_PUBLIC_SUPABASE_URL=http://192.168.0.146:54321

# Option 3: Use HTTPS tunnel URL
NEXT_PUBLIC_SUPABASE_URL=https://supabase.landlife.au
```

## Step 7: Rebuild and Restart App

**On server:**

```bash
cd ~/apps/drone

# Rebuild app with new environment variables
npm run build

# Restart with PM2
pm2 restart drone

# Check logs
pm2 logs drone
```

## Step 8: Test the Migration

1. **Check app is running:**
   ```bash
   pm2 status
   curl -I https://drone.landlife.au/
   ```

2. **Test in browser:**
   - Open your app URL
   - Try logging in
   - Check that missions load
   - Verify flight logs are visible
   - Test creating a new mission

3. **Compare data:**
   - Verify row counts match between cloud and local
   - Check that all features work

## Installing Local Supabase (If Not Already Done)

If Supabase is not installed on your server:

```bash
# Install Supabase CLI
curl -fsSL https://release.supabase.com/linux/latest | sudo dpkg -i -

# Initialize Supabase in a directory
mkdir -p ~/supabase
cd ~/supabase
supabase init

# Start Supabase
supabase start
```

See your deployment-docs for more details:
- `/Users/bowskill/deployment-docs/QUICK_START_LOCAL_SUPABASE.md`

## Quick Reference

### Connection Strings

**Cloud (get from Supabase Dashboard):**
```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

**Local Supabase:**
```
postgresql://postgres:postgres@localhost:54322/postgres
```

### Export/Import Commands

```bash
# Export
pg_dump "<cloud-connection-string>" \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/backup.dump

# Import
pg_restore \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/backup.dump
```

### Useful Commands

```bash
# Check Supabase status
supabase status

# List tables
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\dt"

# Run migration file
psql "postgresql://postgres:postgres@localhost:54322/postgres" < migration.sql

# Check row count
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "SELECT COUNT(*) FROM missions;"
```

## Troubleshooting

### Migration Errors

**Error: "relation already exists"**
- Tables were already created
- Use `--clean` flag or drop and recreate

**Error: "permission denied"**
- Use `--no-owner --no-acl` flags
- Some warnings about system tables are expected

### Connection Issues

**Can't connect to local Supabase:**
- Check Supabase is running: `supabase status`
- Verify port: `54322` for database, `54321` for API
- Check firewall settings

**Can't connect to cloud:**
- Use Session Pooler connection string (IPv4 compatible)
- Check DNS resolution
- Try from different network

### Data Not Showing

- Verify migrations ran successfully
- Check data was imported (row counts)
- Verify environment variables are correct
- Check app logs: `pm2 logs drone`

## Next Steps

After migration:

1. ✅ Test all app features
2. ✅ Set up automated backups
3. ✅ Update any other services using the database
4. ✅ Monitor for issues
5. ✅ Document any custom configurations

## Additional Resources

- **Schema Management**: `contexts/SCHEMA_MANAGEMENT.md` - Commands for managing the drone schema
- **Full Migration Guide**: `/Users/bowskill/deployment-docs/DATABASE_MIGRATION_GUIDE.md`
- **Quick Migration**: `/Users/bowskill/deployment-docs/QUICK_DATABASE_MIGRATION.md`
- **Local Supabase Setup**: `/Users/bowskill/deployment-docs/QUICK_START_LOCAL_SUPABASE.md`

---

**Need help?** Refer to the detailed guides in your deployment-docs repository.





