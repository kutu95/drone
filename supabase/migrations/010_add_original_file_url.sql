-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Add original_file_url column to flight_log_data_points for storing original photo files
ALTER TABLE flight_log_data_points
ADD COLUMN IF NOT EXISTS original_file_url TEXT;

-- Add index for faster original file lookups
CREATE INDEX IF NOT EXISTS idx_flight_log_data_points_original_file_url 
ON flight_log_data_points(original_file_url) 
WHERE original_file_url IS NOT NULL;

