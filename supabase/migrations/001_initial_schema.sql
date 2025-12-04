-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (optional, extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Missions table
CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  drone_model TEXT DEFAULT 'DJI Air 3',
  home_lat DOUBLE PRECISION,
  home_lng DOUBLE PRECISION,
  default_altitude_m DOUBLE PRECISION DEFAULT 60,
  default_speed_mps DOUBLE PRECISION DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Mission waypoints table
CREATE TABLE IF NOT EXISTS mission_waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  index INTEGER NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  altitude_m DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  heading_deg DOUBLE PRECISION,
  gimbal_pitch_deg DOUBLE PRECISION,
  action_type TEXT,
  action_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mission_id, index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mission_waypoints_mission_index ON mission_waypoints(mission_id, index);
CREATE INDEX IF NOT EXISTS idx_missions_owner ON missions(owner_id);

-- Row Level Security Policies

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_waypoints ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Missions policies
CREATE POLICY "Users can view own missions" ON missions
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own missions" ON missions
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own missions" ON missions
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own missions" ON missions
  FOR DELETE USING (auth.uid() = owner_id);

-- Mission waypoints policies
CREATE POLICY "Users can view waypoints of own missions" ON mission_waypoints
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM missions
      WHERE missions.id = mission_waypoints.mission_id
      AND missions.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create waypoints in own missions" ON mission_waypoints
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM missions
      WHERE missions.id = mission_waypoints.mission_id
      AND missions.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update waypoints in own missions" ON mission_waypoints
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM missions
      WHERE missions.id = mission_waypoints.mission_id
      AND missions.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete waypoints from own missions" ON mission_waypoints
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM missions
      WHERE missions.id = mission_waypoints.mission_id
      AND missions.owner_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_missions_updated_at BEFORE UPDATE ON missions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mission_waypoints_updated_at BEFORE UPDATE ON mission_waypoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


