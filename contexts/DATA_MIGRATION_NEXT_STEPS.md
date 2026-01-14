# Data Migration Next Steps

You've completed the schema migrations. Now you need to migrate the actual data from cloud to local, and move it from `public` schema to `drone` schema.

## Step 1: Export Data from Cloud

**On your server (or locally with SSH tunnel):**

1. Get your cloud connection string:
   - Go to: https://supabase.com/dashboard/project/uiknuzhkrljfbvxjhsxr
   - Settings → Database → Connection String
   - Select **Session Mode** (not Transaction Mode)
   - Copy the connection string

2. Export data only (since schema already exists):

```bash
# Replace YOUR_CONNECTION_STRING with your actual connection string
pg_dump "YOUR_CONNECTION_STRING" \
  --data-only \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/drone_cloud_data.dump
```

## Step 2: Import Data to Local (Public Schema First)

The data will import to `public` schema first, then we'll move it to `drone`:

```bash
# Import to local (will go to public schema initially)
pg_restore \
  --data-only \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/drone_cloud_data.dump
```

## Step 3: Move Tables from Public to Drone Schema

**Connect to local database:**

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres"
```

**Move all tables to drone schema:**

```sql
-- Set search path
SET search_path TO drone, tryon_schema, public;

-- Move all application tables from public to drone schema
ALTER TABLE IF EXISTS public.profiles SET SCHEMA drone;
ALTER TABLE IF EXISTS public.missions SET SCHEMA drone;
ALTER TABLE IF EXISTS public.mission_waypoints SET SCHEMA drone;
ALTER TABLE IF EXISTS public.flight_logs SET SCHEMA drone;
ALTER TABLE IF EXISTS public.flight_log_data_points SET SCHEMA drone;
ALTER TABLE IF EXISTS public.flight_log_warnings_errors SET SCHEMA drone;
ALTER TABLE IF EXISTS public.battery_labels SET SCHEMA drone;
ALTER TABLE IF EXISTS public.fleet_drones SET SCHEMA drone;
ALTER TABLE IF EXISTS public.battery_stats SET SCHEMA drone;
ALTER TABLE IF EXISTS public.orthomosaic_projects SET SCHEMA drone;

-- Move functions if they exist in public
ALTER FUNCTION IF EXISTS public.update_updated_at_column() SET SCHEMA drone;
ALTER FUNCTION IF EXISTS public.get_photo_counts(UUID[]) SET SCHEMA drone;
```

**Verify tables are in drone schema:**

```sql
-- List tables in drone schema
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'drone'
ORDER BY tablename;

-- Check row counts
SELECT 
  'missions' as table_name,
  COUNT(*) as row_count
FROM drone.missions
UNION ALL
SELECT 
  'flight_logs',
  COUNT(*)
FROM drone.flight_logs
UNION ALL
SELECT 
  'battery_labels',
  COUNT(*)
FROM drone.battery_labels;
```

## Step 4: Verify Data Migration

```bash
# Check tables in drone schema
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "\dt drone.*"

# Check row counts
psql "postgresql://postgres:postgres@localhost:54322/postgres" -c "
SET search_path TO drone, tryon_schema, public;
SELECT COUNT(*) FROM missions;
SELECT COUNT(*) FROM flight_logs;
SELECT COUNT(*) FROM battery_labels;
"
```

**Or check in Supabase Studio:**
- Open: `http://192.168.0.146:54323/`
- Navigate to Table Editor
- Look for tables with `drone.` prefix (e.g., `drone.missions`)

## Step 5: Clean Up Public Schema (Optional)

After verifying everything is in `drone` schema, you can optionally remove the tables from `public`:

```sql
-- ⚠️ Only do this after verifying data is in drone schema!
-- Drop tables from public schema if they still exist
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.missions CASCADE;
DROP TABLE IF EXISTS public.mission_waypoints CASCADE;
DROP TABLE IF EXISTS public.flight_logs CASCADE;
DROP TABLE IF EXISTS public.flight_log_data_points CASCADE;
DROP TABLE IF EXISTS public.flight_log_warnings_errors CASCADE;
DROP TABLE IF EXISTS public.battery_labels CASCADE;
DROP TABLE IF EXISTS public.fleet_drones CASCADE;
DROP TABLE IF EXISTS public.battery_stats CASCADE;
DROP TABLE IF EXISTS public.orthomosaic_projects CASCADE;
```

## Alternative: Automated Script

If you prefer, you can use this one-liner to move all tables:

```bash
psql "postgresql://postgres:postgres@localhost:54322/postgres" <<EOF
SET search_path TO drone, tryon_schema, public;
ALTER TABLE IF EXISTS public.profiles SET SCHEMA drone;
ALTER TABLE IF EXISTS public.missions SET SCHEMA drone;
ALTER TABLE IF EXISTS public.mission_waypoints SET SCHEMA drone;
ALTER TABLE IF EXISTS public.flight_logs SET SCHEMA drone;
ALTER TABLE IF EXISTS public.flight_log_data_points SET SCHEMA drone;
ALTER TABLE IF EXISTS public.flight_log_warnings_errors SET SCHEMA drone;
ALTER TABLE IF EXISTS public.battery_labels SET SCHEMA drone;
ALTER TABLE IF EXISTS public.fleet_drones SET SCHEMA drone;
ALTER TABLE IF EXISTS public.battery_stats SET SCHEMA drone;
ALTER TABLE IF EXISTS public.orthomosaic_projects SET SCHEMA drone;
ALTER FUNCTION IF EXISTS public.update_updated_at_column() SET SCHEMA drone;
ALTER FUNCTION IF EXISTS public.get_photo_counts(UUID[]) SET SCHEMA drone;
EOF
```

## Next Steps After Data Migration

Once data is migrated and verified:

1. **Expose Supabase through Cloudflare Tunnel** (if not already done)
   - See `DATABASE_MIGRATION_GUIDE.md` Step 4

2. **Update Environment Variables**
   - Get local Supabase keys: `supabase status`
   - Update `.env.production` with local Supabase URL and keys

3. **Rebuild and Restart App**
   ```bash
   cd ~/apps/drone
   npm run build
   pm2 restart drone
   ```

## Troubleshooting

### Tables Not Found After Import

If tables don't appear in `drone` schema:
- Check if they're in `public` schema: `\dt public.*`
- Move them using the ALTER TABLE commands above

### Foreign Key Errors

If you get foreign key errors when moving tables:
- Move tables in dependency order (missions before waypoints, flight_logs before data_points)
- Or use `CASCADE` option (be careful!)

### Data Count Mismatch

If row counts don't match:
- Verify export completed successfully
- Check for errors during import
- Compare counts between cloud and local

---

**Need help?** See `DATABASE_MIGRATION_GUIDE.md` for complete migration process.
