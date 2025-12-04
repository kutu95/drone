# Supabase Storage Setup for Photo Thumbnails

This document explains how to set up Supabase Storage for photo thumbnail uploads.

## Create the Storage Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"**
4. Create a bucket named: `photo-thumbnails`
5. Make it **Public** (this allows public read access)

## ⚠️ IMPORTANT: Add Upload Policy

**Even if the bucket is public**, authenticated users still need an INSERT RLS policy to upload files. Public buckets allow public read access, but uploads require specific permissions.

### Quick Fix: Add INSERT Policy via SQL Editor

1. Go to your Supabase dashboard → **SQL Editor**
2. Run this SQL query:

```sql
CREATE POLICY "Users can upload own thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photo-thumbnails' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

This allows authenticated users to upload thumbnails to their own folder (named by their user ID).

### Alternative: Configure via Dashboard UI

1. Go to **Storage** → **Policies** in your Supabase dashboard
2. Select the `photo-thumbnails` bucket
3. Click **"New Policy"**
4. Choose **"For full customization"**
5. Configure:
   - **Policy name:** "Users can upload own thumbnails"
   - **Allowed operation:** INSERT
   - **Target roles:** authenticated
   - **USING expression:** `bucket_id = 'photo-thumbnails'`
   - **WITH CHECK expression:** `bucket_id = 'photo-thumbnails' AND (storage.foldername(name))[1] = auth.uid()::text`

## Optional: Additional Policies

If you want users to only view/delete their own thumbnails (if bucket is private), add:

**Select Policy:**
```sql
CREATE POLICY "Users can view own thumbnails"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photo-thumbnails' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

**Delete Policy:**
```sql
CREATE POLICY "Users can delete own thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photo-thumbnails' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

## Verify Setup

After creating the bucket and adding the INSERT policy, try uploading a photo filename match again. The thumbnail generation should work.

If you still get errors, check the server terminal logs for detailed error messages.
