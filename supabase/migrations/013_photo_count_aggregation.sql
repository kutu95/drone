-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Create a function to efficiently count photos per flight log
-- This uses GROUP BY aggregation which is much faster than multiple COUNT queries
CREATE OR REPLACE FUNCTION drone.get_photo_counts(log_ids UUID[])
RETURNS TABLE(flight_log_id UUID, photo_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dp.flight_log_id,
    COUNT(*)::BIGINT as photo_count
  FROM drone.flight_log_data_points dp
  WHERE dp.flight_log_id = ANY(log_ids)
    AND dp.is_photo = true
  GROUP BY dp.flight_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION drone.get_photo_counts(UUID[]) TO authenticated;

