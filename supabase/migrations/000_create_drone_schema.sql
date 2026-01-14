-- Create drone schema for this application
-- This allows multiple projects to share the same Supabase database
-- Each project uses its own schema for isolation

CREATE SCHEMA IF NOT EXISTS drone;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA drone TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA drone TO postgres, service_role;

-- Set search_path for this session (migrations will run in this schema context)
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Note: The auth schema is shared across all projects and remains in public schema
-- References to auth.users will work from any schema
