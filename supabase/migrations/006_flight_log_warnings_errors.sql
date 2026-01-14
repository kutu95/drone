-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Flight log warnings and errors table
CREATE TABLE IF NOT EXISTS flight_log_warnings_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_log_id UUID NOT NULL REFERENCES flight_logs(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'error')),
  category TEXT NOT NULL, -- e.g., 'battery', 'gimbal', 'signal', 'gps', etc.
  message TEXT NOT NULL,
  timestamp_offset_ms INTEGER, -- When during the flight this occurred
  details JSONB, -- Additional context about the warning/error
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_flight_log_warnings_errors_log_id ON flight_log_warnings_errors(flight_log_id);
CREATE INDEX IF NOT EXISTS idx_flight_log_warnings_errors_severity ON flight_log_warnings_errors(flight_log_id, severity);
CREATE INDEX IF NOT EXISTS idx_flight_log_warnings_errors_category ON flight_log_warnings_errors(flight_log_id, category);

-- Row Level Security Policies
ALTER TABLE flight_log_warnings_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view warnings/errors of own flight logs" ON flight_log_warnings_errors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM flight_logs
      WHERE flight_logs.id = flight_log_warnings_errors.flight_log_id
      AND flight_logs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create warnings/errors in own flight logs" ON flight_log_warnings_errors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM flight_logs
      WHERE flight_logs.id = flight_log_warnings_errors.flight_log_id
      AND flight_logs.owner_id = auth.uid()
    )
  );

