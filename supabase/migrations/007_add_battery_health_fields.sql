-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Add battery health fields to flight_log_data_points table
ALTER TABLE flight_log_data_points
  ADD COLUMN IF NOT EXISTS battery_voltage DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS battery_current DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS battery_temperature DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS battery_min_temperature DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS battery_max_temperature DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS battery_cell_voltages DOUBLE PRECISION[],
  ADD COLUMN IF NOT EXISTS battery_cell_voltage_deviation DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS battery_current_capacity INTEGER,
  ADD COLUMN IF NOT EXISTS battery_full_capacity INTEGER;

-- Add indexes for battery health queries
CREATE INDEX IF NOT EXISTS idx_flight_log_data_points_battery_voltage ON flight_log_data_points(flight_log_id, battery_voltage) WHERE battery_voltage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flight_log_data_points_battery_temperature ON flight_log_data_points(flight_log_id, battery_temperature) WHERE battery_temperature IS NOT NULL;

