-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Add thumbnail URL field to flight_log_data_points for storing photo thumbnails
ALTER TABLE flight_log_data_points
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add index for faster thumbnail lookups
CREATE INDEX IF NOT EXISTS idx_flight_log_data_points_thumbnail_url 
ON flight_log_data_points(thumbnail_url) 
WHERE thumbnail_url IS NOT NULL;

