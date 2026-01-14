-- Move all tables from public schema to drone schema
-- Run this after migrations have created tables in public schema

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

-- Verify tables are in drone schema
SELECT 
  schemaname,
  tablename
FROM pg_tables 
WHERE schemaname = 'drone'
ORDER BY tablename;
