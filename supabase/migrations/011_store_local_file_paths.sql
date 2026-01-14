-- Set schema context for this migration
-- Includes tryon_schema for multi-app database support
SET search_path TO drone, tryon_schema, public;

-- Update original_file_url column to store local file paths instead of Supabase Storage URLs
-- This column will now store the relative file path within the user's selected photo folder
-- Format: filename.ext (just the filename, since folder path is stored in flight log metadata)

-- No schema changes needed, just updating the purpose of the column
-- We'll add a comment to document this change
COMMENT ON COLUMN flight_log_data_points.original_file_url IS 'Local file path (filename only) within the user-selected photo folder. The folder path is stored in flight_logs.metadata.photo_folder_path.';

