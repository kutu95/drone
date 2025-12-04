-- Add photo_filename column to flight_log_data_points table
ALTER TABLE flight_log_data_points 
ADD COLUMN IF NOT EXISTS photo_filename TEXT;

-- Add index for faster photo queries
CREATE INDEX IF NOT EXISTS idx_flight_log_data_points_photo 
ON flight_log_data_points(flight_log_id, is_photo) 
WHERE is_photo = true;

