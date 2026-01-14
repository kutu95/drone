-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Flight logs table
CREATE TABLE IF NOT EXISTS flight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  flight_date TIMESTAMPTZ,
  drone_model TEXT,
  duration_seconds DOUBLE PRECISION,
  max_altitude_m DOUBLE PRECISION,
  max_distance_m DOUBLE PRECISION,
  home_lat DOUBLE PRECISION,
  home_lng DOUBLE PRECISION,
  start_lat DOUBLE PRECISION,
  start_lng DOUBLE PRECISION,
  end_lat DOUBLE PRECISION,
  end_lng DOUBLE PRECISION,
  total_distance_m DOUBLE PRECISION,
  max_speed_mps DOUBLE PRECISION,
  battery_start_percent DOUBLE PRECISION,
  battery_end_percent DOUBLE PRECISION,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flight log data points table (telemetry records)
CREATE TABLE IF NOT EXISTS flight_log_data_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_log_id UUID NOT NULL REFERENCES flight_logs(id) ON DELETE CASCADE,
  timestamp_offset_ms INTEGER NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  altitude_m DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  heading_deg DOUBLE PRECISION,
  gimbal_pitch_deg DOUBLE PRECISION,
  battery_percent DOUBLE PRECISION,
  signal_strength INTEGER,
  satellite_count INTEGER,
  is_photo BOOLEAN DEFAULT false,
  is_video_recording BOOLEAN DEFAULT false,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_flight_logs_owner ON flight_logs(owner_id);
CREATE INDEX IF NOT EXISTS idx_flight_logs_flight_date ON flight_logs(flight_date DESC);
CREATE INDEX IF NOT EXISTS idx_flight_log_data_points_log_id ON flight_log_data_points(flight_log_id);
CREATE INDEX IF NOT EXISTS idx_flight_log_data_points_timestamp ON flight_log_data_points(flight_log_id, timestamp_offset_ms);

-- Row Level Security Policies

-- Enable RLS
ALTER TABLE flight_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_log_data_points ENABLE ROW LEVEL SECURITY;

-- Flight logs policies
CREATE POLICY "Users can view own flight logs" ON flight_logs
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own flight logs" ON flight_logs
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own flight logs" ON flight_logs
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own flight logs" ON flight_logs
  FOR DELETE USING (auth.uid() = owner_id);

-- Flight log data points policies
CREATE POLICY "Users can view data points of own flight logs" ON flight_log_data_points
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM flight_logs
      WHERE flight_logs.id = flight_log_data_points.flight_log_id
      AND flight_logs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create data points in own flight logs" ON flight_log_data_points
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM flight_logs
      WHERE flight_logs.id = flight_log_data_points.flight_log_id
      AND flight_logs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update data points in own flight logs" ON flight_log_data_points
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM flight_logs
      WHERE flight_logs.id = flight_log_data_points.flight_log_id
      AND flight_logs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete data points from own flight logs" ON flight_log_data_points
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM flight_logs
      WHERE flight_logs.id = flight_log_data_points.flight_log_id
      AND flight_logs.owner_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_flight_logs_updated_at BEFORE UPDATE ON flight_logs
  FOR EACH ROW EXECUTE FUNCTION drone.update_updated_at_column();

