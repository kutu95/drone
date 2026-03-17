-- Fix get_photo_counts function with explicit search_path
SET search_path TO drone, tryon_schema, public;

CREATE OR REPLACE FUNCTION drone.get_photo_counts(log_ids UUID[])
RETURNS TABLE(flight_log_id UUID, photo_count BIGINT) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO drone, tryon_schema, public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION drone.get_photo_counts(UUID[]) TO authenticated;
