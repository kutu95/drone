-- Migration: Add mapping missions and orthomosaic support

-- Add mission_type to missions table
ALTER TABLE missions
ADD COLUMN IF NOT EXISTS mission_type TEXT DEFAULT 'waypoint' CHECK (mission_type IN ('waypoint', 'mapping'));

-- Add mapping-specific fields to missions metadata
-- These will be stored in the metadata JSONB column:
-- - mapping_area: { north, south, east, west }
-- - overlap: { front, side } (percentages)
-- - grid_settings: { pattern, direction } (e.g., 'parallel_lines', 'zigzag')
-- - processing_settings: { gsd_target, orthophoto_resolution }

-- Create orthomosaic_projects table
CREATE TABLE IF NOT EXISTS orthomosaic_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES missions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  flight_log_id UUID REFERENCES flight_logs(id) ON DELETE SET NULL,
  
  -- Area bounds
  area_north DOUBLE PRECISION,
  area_south DOUBLE PRECISION,
  area_east DOUBLE PRECISION,
  area_west DOUBLE PRECISION,
  
  -- Processing metadata
  photo_count INTEGER,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  -- Output files (stored in Supabase Storage)
  orthomosaic_url TEXT, -- Main orthomosaic GeoTIFF
  orthomosaic_tiles_url TEXT, -- Directory for map tiles (TMS/XYZ)
  dem_url TEXT, -- Digital Elevation Model
  point_cloud_url TEXT, -- 3D point cloud
  
  -- Metadata
  metadata JSONB, -- Additional processing info, GSD, dimensions, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orthomosaic_projects_owner ON orthomosaic_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_orthomosaic_projects_mission ON orthomosaic_projects(mission_id);
CREATE INDEX IF NOT EXISTS idx_orthomosaic_projects_status ON orthomosaic_projects(status);
CREATE INDEX IF NOT EXISTS idx_orthomosaic_projects_created ON orthomosaic_projects(created_at DESC);

-- Enable RLS
ALTER TABLE orthomosaic_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orthomosaic_projects
CREATE POLICY "Users can view own orthomosaics" ON orthomosaic_projects
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own orthomosaics" ON orthomosaic_projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own orthomosaics" ON orthomosaic_projects
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own orthomosaics" ON orthomosaic_projects
  FOR DELETE USING (auth.uid() = owner_id);

-- Trigger for updated_at
CREATE TRIGGER update_orthomosaic_projects_updated_at BEFORE UPDATE ON orthomosaic_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

