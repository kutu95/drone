# Schema Management Guide - Drone App

This guide covers managing the `drone` schema in your local Supabase database. Using a dedicated schema allows multiple projects to share the same database while maintaining isolation.

## Overview

The Drone app uses the `drone` schema instead of the default `public` schema. This provides:
- **Isolation**: Tables and functions are separated from other projects
- **Resource Efficiency**: Share one database instance across multiple projects
- **Easy Cleanup**: Drop the entire schema to remove the project

## Schema Structure

All application tables and functions are created in the `drone` schema:
- Tables: `missions`, `flight_logs`, `battery_labels`, etc.
- Functions: `update_updated_at_column()`, `get_photo_counts()`
- The `auth` schema remains shared (Supabase authentication)

## Creating the Schema

The schema is automatically created by the first migration (`000_create_drone_schema.sql`). If you need to create it manually:

```bash
# Connect to your local Supabase database
psql "postgresql://postgres:postgres@localhost:54322/postgres"

# Create the schema
CREATE SCHEMA IF NOT EXISTS drone;

# Grant permissions
GRANT USAGE ON SCHEMA drone TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA drone TO postgres, service_role;
```

## Running Migrations

Migrations automatically set the schema context. Run them as usual:

```bash
# Using Supabase CLI (recommended)
cd ~/apps/drone
supabase db reset  # Resets and runs all migrations

# Or run migrations manually
for migration in supabase/migrations/*.sql; do
    psql "postgresql://postgres:postgres@localhost:54322/postgres" < "$migration"
done
```

## Querying the Schema

### Using psql

```bash
# Connect to database
psql "postgresql://postgres:postgres@localhost:54322/postgres"

# Set schema context (includes tryon_schema for multi-app database)
SET search_path TO drone, tryon_schema, public;

# List all tables in drone schema
\dt drone.*

# List all functions in drone schema
\df drone.*

# Query tables (with schema prefix)
SELECT COUNT(*) FROM drone.missions;

# Or set search_path and query without prefix
SET search_path TO drone, tryon_schema, public;
SELECT COUNT(*) FROM missions;
```

### Using Supabase Studio

1. Open Supabase Studio: `http://localhost:54323/`
2. Navigate to **Table Editor**
3. Tables in the `drone` schema will appear with the schema prefix: `drone.missions`, `drone.flight_logs`, etc.
4. You can query and edit tables directly in the UI

## Common Schema Operations

### List All Tables

```sql
SELECT 
  schemaname,
  tablename
FROM pg_tables 
WHERE schemaname = 'drone'
ORDER BY tablename;
```

### List All Functions

```sql
SELECT 
  n.nspname as schema,
  p.proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'drone'
ORDER BY p.proname;
```

### Check Table Row Counts

```sql
SET search_path TO drone, tryon_schema, public;

SELECT 
  'missions' as table_name,
  COUNT(*) as row_count
FROM missions
UNION ALL
SELECT 
  'flight_logs',
  COUNT(*)
FROM flight_logs
UNION ALL
SELECT 
  'battery_labels',
  COUNT(*)
FROM battery_labels;
```

### View Schema Size

```sql
SELECT 
  schemaname,
  pg_size_pretty(SUM(pg_total_relation_size(schemaname||'.'||tablename))) AS total_size
FROM pg_tables
WHERE schemaname = 'drone'
GROUP BY schemaname;
```

## Backup and Restore

### Backup the Schema

```bash
# Backup only the drone schema
pg_dump "postgresql://postgres:postgres@localhost:54322/postgres" \
  --schema=drone \
  --no-owner --no-acl \
  --format=custom \
  --file=/tmp/drone_schema_backup.dump
```

### Restore the Schema

```bash
# Restore the drone schema
pg_restore \
  --schema=drone \
  --clean --if-exists \
  --no-owner --no-acl \
  --dbname="postgresql://postgres:postgres@localhost:54322/postgres" \
  /tmp/drone_schema_backup.dump
```

## Dropping the Schema

⚠️ **Warning**: This will delete all data in the drone schema!

```sql
-- Connect to database
psql "postgresql://postgres:postgres@localhost:54322/postgres"

-- Drop the entire schema (cascade removes all objects)
DROP SCHEMA IF EXISTS drone CASCADE;

-- Recreate if needed
CREATE SCHEMA drone;
GRANT USAGE ON SCHEMA drone TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA drone TO postgres, service_role;
```

## Troubleshooting

### Tables Not Found

If you get "relation does not exist" errors:

1. **Check schema context**:
   ```sql
   SHOW search_path;
   -- Should include 'drone'
   ```

2. **Set schema explicitly**:
   ```sql
   SET search_path TO drone, tryon_schema, public;
   ```

3. **Use schema prefix in queries**:
   ```sql
   SELECT * FROM drone.missions;
   ```

### RPC Functions Not Found

If `get_photo_counts()` function is not found:

1. **Check if function exists**:
   ```sql
   SELECT * FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'drone' AND p.proname = 'get_photo_counts';
   ```

2. **Re-run migration 013**:
   ```bash
   psql "postgresql://postgres:postgres@localhost:54322/postgres" \
     < supabase/migrations/013_photo_count_aggregation.sql
   ```

### Permission Errors

If you get permission errors:

```sql
-- Grant necessary permissions
GRANT USAGE ON SCHEMA drone TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA drone TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA drone TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA drone TO authenticated;
```

## Migration from Public Schema

If you have existing data in the `public` schema and want to migrate to `drone`:

```sql
-- 1. Create the drone schema (if not exists)
CREATE SCHEMA IF NOT EXISTS drone;

-- 2. Move tables to drone schema
ALTER TABLE public.missions SET SCHEMA drone;
ALTER TABLE public.flight_logs SET SCHEMA drone;
-- ... repeat for all tables

-- 3. Move functions
ALTER FUNCTION public.update_updated_at_column() SET SCHEMA drone;
ALTER FUNCTION public.get_photo_counts(UUID[]) SET SCHEMA drone;

-- 4. Update search_path for future sessions
ALTER DATABASE postgres SET search_path TO drone, tryon_schema, public;
```

## Best Practices

1. **Always use schema prefix in migrations**: Explicitly set `SET search_path TO drone, tryon_schema, public;` (includes tryon_schema for multi-app database support)
2. **Test migrations**: Run migrations on a test database first
3. **Backup before major changes**: Always backup the schema before dropping or major alterations
4. **Document custom functions**: Add comments to functions explaining their purpose
5. **Monitor schema size**: Regularly check schema size to ensure it's not growing unexpectedly

## Related Files

- **Migration files**: `supabase/migrations/*.sql`
- **Client config**: `src/lib/supabase.ts` and `src/lib/supabase-server.ts`
- **Migration guide**: `contexts/DATABASE_MIGRATION_GUIDE.md`

---

**Need help?** Check the main migration guide or Supabase documentation for schema management.
