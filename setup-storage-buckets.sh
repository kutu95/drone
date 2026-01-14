#!/bin/bash
# Setup storage buckets for Drone app on local Supabase

set -e

echo "🗂️  Setting up Storage Buckets for Drone App"
echo "=============================================="
echo ""

# Local connection string
LOCAL_CONN="postgresql://postgres:postgres@localhost:54322/postgres"

# Test local connection
echo "🔍 Testing local Supabase connection..."
if ! pg_isready -d "$LOCAL_CONN" &> /dev/null; then
    echo "❌ Error: Cannot connect to local Supabase"
    echo ""
    echo "Please ensure:"
    echo "1. Supabase is running: supabase status"
    echo "2. Database port is 54322"
    echo "3. Default credentials are postgres:postgres"
    exit 1
fi

echo "✅ Local Supabase connection OK"
echo ""

# Create buckets
echo "📦 Creating storage buckets..."
echo ""

psql "$LOCAL_CONN" <<EOF

-- Create photo-originals bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'photo-originals',
  'photo-originals',
  true,
  52428800  -- 50MB
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Create orthomosaics bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'orthomosaics',
  'orthomosaics',
  true,
  1073741824  -- 1GB
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1073741824;

EOF

echo "✅ Buckets created/updated"
echo ""

# Verify buckets
echo "🔍 Verifying buckets..."
echo ""

psql "$LOCAL_CONN" -c "
SELECT 
  id as bucket_id,
  name,
  public,
  pg_size_pretty(file_size_limit) as size_limit,
  created_at
FROM storage.buckets 
WHERE id IN ('photo-thumbnails', 'photo-originals', 'orthomosaics')
ORDER BY id;
"

echo ""
echo "✅ Storage buckets setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Continue with data migration (see contexts/DATA_MIGRATION_NEXT_STEPS.md)"
echo "2. Verify buckets in Supabase Studio: http://localhost:54323/ (Storage section)"
echo ""
