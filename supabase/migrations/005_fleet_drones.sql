-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Fleet drones table to track all drones in the system
CREATE TABLE IF NOT EXISTS fleet_drones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  model TEXT,
  name TEXT, -- User-defined readable name
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, serial_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fleet_drones_owner ON fleet_drones(owner_id);
CREATE INDEX IF NOT EXISTS idx_fleet_drones_serial ON fleet_drones(serial_number);

-- Row Level Security Policies
ALTER TABLE fleet_drones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fleet drones" ON fleet_drones
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own fleet drones" ON fleet_drones
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own fleet drones" ON fleet_drones
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own fleet drones" ON fleet_drones
  FOR DELETE USING (auth.uid() = owner_id);

-- Trigger for updated_at
CREATE TRIGGER update_fleet_drones_updated_at BEFORE UPDATE ON fleet_drones
  FOR EACH ROW EXECUTE FUNCTION drone.update_updated_at_column();

