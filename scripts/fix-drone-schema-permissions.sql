-- Fix drone schema ownership and permissions
-- Connect as superuser (postgres should work, but we may need to check ownership)

-- Check current schema owner
SELECT nspname as schema_name, nspowner::regrole as owner
FROM pg_namespace 
WHERE nspname = 'drone';

-- Change owner to postgres if needed
ALTER SCHEMA drone OWNER TO postgres;

-- Grant all permissions
GRANT USAGE ON SCHEMA drone TO postgres;
GRANT ALL ON SCHEMA drone TO postgres;
GRANT CREATE ON SCHEMA drone TO postgres;

-- Grant on all existing objects in drone schema
GRANT ALL ON ALL TABLES IN SCHEMA drone TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA drone TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA drone TO postgres;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA drone GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA drone GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA drone GRANT ALL ON FUNCTIONS TO postgres;
