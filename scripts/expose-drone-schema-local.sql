-- Run this on your LOCAL Supabase Postgres (192.168.0.146) so the REST API can access schema drone.
-- Connect: psql "$TARGET_DATABASE_URL" -f scripts/expose-drone-schema-local.sql
-- Then restart the Supabase API/PostgREST container or service on the server.

-- Ensure API roles can use the drone schema
GRANT USAGE ON SCHEMA drone TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA drone TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA drone TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA drone TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA drone GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA drone GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Tell PostgREST to expose the drone schema (if your setup uses role config)
-- Uncomment and run if 403 persists after grants and config.toml:
-- ALTER ROLE authenticator SET pgrst.db_schemas = 'public, drone';
