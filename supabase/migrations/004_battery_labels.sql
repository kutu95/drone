-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Battery labels table - allows users to assign custom labels to batteries
CREATE TABLE IF NOT EXISTS battery_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  battery_serial_number TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, battery_serial_number)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_battery_labels_owner ON battery_labels(owner_id);
CREATE INDEX IF NOT EXISTS idx_battery_labels_serial ON battery_labels(owner_id, battery_serial_number);

-- Enable RLS
ALTER TABLE battery_labels ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own battery labels" ON battery_labels
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own battery labels" ON battery_labels
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own battery labels" ON battery_labels
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own battery labels" ON battery_labels
  FOR DELETE USING (auth.uid() = owner_id);

-- Trigger for updated_at
CREATE TRIGGER update_battery_labels_updated_at BEFORE UPDATE ON battery_labels
  FOR EACH ROW EXECUTE FUNCTION drone.update_updated_at_column();

