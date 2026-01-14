# Storage Buckets Setup Guide

The Drone app requires three Supabase Storage buckets to be created. You already have `photo-thumbnails` on your server, but you'll need to create the other two.

## Required Buckets

1. ✅ **photo-thumbnails** - Already exists on your server
2. ❌ **photo-originals** - For storing original photo files
3. ❌ **orthomosaics** - For storing orthomosaic processing results (GeoTIFFs, DEMs, etc.)

## Creating Buckets via Supabase Studio

### Method 1: Using Supabase Studio (Easiest)

1. **Open Supabase Studio:**
   ```bash
   # On your server
   # Studio is typically at: http://localhost:54323/
   # Or if exposed: http://192.168.0.146:54323/
   ```

2. **Navigate to Storage:**
   - Click on **Storage** in the left sidebar
   - Click **New bucket**

3. **Create `photo-originals` bucket:**
   - **Name:** `photo-originals`
   - **Public bucket:** ✅ Check this (or set up RLS policies)
   - **File size limit:** Leave default or set appropriate limit (e.g., 50MB)
   - **Allowed MIME types:** Leave empty (allows all) or specify: `image/jpeg,image/png,image/tiff,image/dng`
   - Click **Create bucket**

4. **Create `orthomosaics` bucket:**
   - **Name:** `orthomosaics`
   - **Public bucket:** ✅ Check this (or set up RLS policies)
   - **File size limit:** Set higher limit (e.g., 500MB or 1GB) for large GeoTIFF files
   - **Allowed MIME types:** Leave empty or specify: `image/tiff,image/geotiff,application/octet-stream`
   - Click **Create bucket**

5. **Verify `photo-thumbnails` bucket:**
   - Check that it exists and is configured correctly
   - **Public bucket:** Should be checked
   - **File size limit:** Can be smaller (e.g., 5MB)

## Creating Buckets via SQL

Alternatively, you can create buckets using SQL:

```sql
-- Connect to local Supabase
psql "postgresql://postgres:postgres@localhost:54322/postgres"

-- Create photo-originals bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photo-originals',
  'photo-originals',
  true,  -- Public bucket
  52428800,  -- 50MB limit (adjust as needed)
  ARRAY['image/jpeg', 'image/png', 'image/tiff', 'image/dng']::text[]
);

-- Create orthomosaics bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'orthomosaics',
  'orthomosaics',
  true,  -- Public bucket
  1073741824,  -- 1GB limit (adjust as needed)
  ARRAY['image/tiff', 'image/geotiff', 'application/octet-stream']::text[]
);

-- Verify buckets were created
SELECT id, name, public, file_size_limit 
FROM storage.buckets 
WHERE id IN ('photo-thumbnails', 'photo-originals', 'orthomosaics');
```

## Setting Up RLS Policies

If you want more control, you can set up Row Level Security (RLS) policies instead of making buckets fully public:

### For photo-thumbnails:

```sql
-- Allow authenticated users to upload thumbnails
CREATE POLICY "Users can upload own thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photo-thumbnails' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read thumbnails
CREATE POLICY "Users can read own thumbnails"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photo-thumbnails' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete own thumbnails
CREATE POLICY "Users can delete own thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photo-thumbnails' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### For photo-originals:

```sql
-- Allow authenticated users to upload original photos
CREATE POLICY "Users can upload own originals"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photo-originals' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read original photos
CREATE POLICY "Users can read own originals"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photo-originals' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete own originals
CREATE POLICY "Users can delete own originals"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photo-originals' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### For orthomosaics:

```sql
-- Allow authenticated users to upload orthomosaics
CREATE POLICY "Users can upload own orthomosaics"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'orthomosaics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read orthomosaics
CREATE POLICY "Users can read own orthomosaics"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'orthomosaics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete own orthomosaics
CREATE POLICY "Users can delete own orthomosaics"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'orthomosaics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

## Verifying Buckets

After creating buckets, verify they exist:

```sql
-- List all buckets
SELECT id, name, public, file_size_limit, created_at
FROM storage.buckets
WHERE id IN ('photo-thumbnails', 'photo-originals', 'orthomosaics')
ORDER BY id;
```

Or check in Supabase Studio:
- Go to **Storage** → You should see all three buckets listed

## Quick Setup Script

Here's a complete script to set up all buckets:

```bash
#!/bin/bash
# Setup storage buckets for Drone app

psql "postgresql://postgres:postgres@localhost:54322/postgres" <<EOF

-- Create photo-originals bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'photo-originals',
  'photo-originals',
  true,
  52428800  -- 50MB
)
ON CONFLICT (id) DO NOTHING;

-- Create orthomosaics bucket (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'orthomosaics',
  'orthomosaics',
  true,
  1073741824  -- 1GB
)
ON CONFLICT (id) DO NOTHING;

-- Verify buckets
SELECT id, name, public, file_size_limit 
FROM storage.buckets 
WHERE id IN ('photo-thumbnails', 'photo-originals', 'orthomosaics')
ORDER BY id;

EOF

echo "✅ Storage buckets setup complete!"
```

Save this as `setup-storage-buckets.sh`, make it executable, and run it:

```bash
chmod +x setup-storage-buckets.sh
./setup-storage-buckets.sh
```

## Bucket Configuration Summary

| Bucket Name | Purpose | Public | Size Limit | MIME Types |
|------------|---------|-------|------------|------------|
| `photo-thumbnails` | Photo thumbnails | ✅ Yes | 5MB | image/jpeg, image/png |
| `photo-originals` | Original photo files | ✅ Yes | 50MB | image/jpeg, image/png, image/tiff, image/dng |
| `orthomosaics` | Orthomosaic results | ✅ Yes | 1GB | image/tiff, image/geotiff |

## Troubleshooting

### Bucket Not Found Errors

If you see "Bucket not found" errors:
1. Verify bucket exists: `SELECT * FROM storage.buckets WHERE id = 'bucket-name';`
2. Check bucket name spelling (case-sensitive)
3. Ensure bucket is public or RLS policies are set correctly

### Upload Permission Errors

If uploads fail:
1. Check if bucket is public, OR
2. Verify RLS policies allow the authenticated user to upload
3. Check file size doesn't exceed bucket limit

### File Access Errors

If files can't be accessed:
1. Verify bucket is public, OR
2. Check RLS policies allow reading
3. Verify the file path matches the expected format

---

**Next Steps:** After creating buckets, continue with the data migration process. See `DATA_MIGRATION_NEXT_STEPS.md` for details.
