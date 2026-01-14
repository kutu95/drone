-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Create battery_stats table to cache aggregated battery statistics
-- This dramatically speeds up the battery monitoring page by avoiding recalculation
CREATE TABLE IF NOT EXISTS battery_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battery_serial_number TEXT NOT NULL,
  
  -- Flight statistics
  flight_count INTEGER NOT NULL DEFAULT 0,
  total_flight_time_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  
  -- Battery usage statistics
  total_battery_usage_percent DOUBLE PRECISION,
  battery_usage_samples INTEGER DEFAULT 0,
  total_battery_start_percent DOUBLE PRECISION,
  battery_start_samples INTEGER DEFAULT 0,
  total_battery_end_percent DOUBLE PRECISION,
  battery_end_samples INTEGER DEFAULT 0,
  
  -- Battery health aggregates (from sampled data points)
  avg_voltage DOUBLE PRECISION,
  min_voltage DOUBLE PRECISION,
  max_voltage DOUBLE PRECISION,
  avg_temperature DOUBLE PRECISION,
  min_temperature DOUBLE PRECISION,
  max_temperature DOUBLE PRECISION,
  avg_cell_deviation DOUBLE PRECISION,
  max_cell_deviation DOUBLE PRECISION,
  full_capacity INTEGER, -- Should be constant per battery
  
  -- Timestamps
  first_flight_date DATE,
  last_flight_date DATE,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one record per battery per owner
  UNIQUE(owner_id, battery_serial_number)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_battery_stats_owner ON battery_stats(owner_id);
CREATE INDEX IF NOT EXISTS idx_battery_stats_serial ON battery_stats(battery_serial_number);
CREATE INDEX IF NOT EXISTS idx_battery_stats_last_calculated ON battery_stats(last_calculated_at);

-- Enable RLS
ALTER TABLE battery_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own battery stats" ON battery_stats
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can update own battery stats" ON battery_stats
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own battery stats" ON battery_stats
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can delete own battery stats" ON battery_stats
  FOR DELETE USING (auth.uid() = owner_id);

