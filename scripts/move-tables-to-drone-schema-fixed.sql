-- Move all tables from public schema to drone schema
-- First grant permissions, then move tables

-- Grant permissions on drone schema
GRANT USAGE ON SCHEMA drone TO postgres;
GRANT ALL ON SCHEMA drone TO postgres;

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

-- Move functions if they exist (check first)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
    ALTER FUNCTION public.update_updated_at_column() SET SCHEMA drone;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'get_photo_counts' AND pg_get_function_arguments(p.oid) = 'log_ids uuid[]') THEN
    ALTER FUNCTION public.get_photo_counts(UUID[]) SET SCHEMA drone;
  END IF;
END $$;

-- Verify tables are in drone schema
SELECT 
  schemaname,
  tablename
FROM pg_tables 
WHERE schemaname = 'drone'
ORDER BY tablename;
