# Supabase Storage Setup for Orthomosaics

## Create Storage Bucket

1. **Go to Supabase Dashboard** → **Storage**
2. **Create New Bucket**:
   - Name: `orthomosaics`
   - Public: ✅ Yes (for easy viewing, or configure RLS for authenticated access)
   - File size limit: 500MB (or higher if needed for large orthomosaics)
   - Allowed MIME types: `image/tiff`, `image/tif` (optional, for restrictions)

## Storage Structure

Orthomosaics are stored in the following structure:
```
orthomosaics/
  {user_id}/
    {project_id}/
      orthomosaic.tif       # Main orthomosaic GeoTIFF
      dem.tif               # Digital Elevation Model (optional)
      tiles/                # Map tiles directory (future)
```

## RLS Policies (if bucket is private)

If you want to keep the bucket private, add these RLS policies:

```sql
-- Users can view their own orthomosaics
CREATE POLICY "Users can view own orthomosaics"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'orthomosaics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can upload their own orthomosaics
CREATE POLICY "Users can upload own orthomosaics"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'orthomosaics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own orthomosaics
CREATE POLICY "Users can delete own orthomosaics"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'orthomosaics' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

## Uploading Orthomosaics Manually

If processing manually with ODM, you can upload results:

1. **Via Supabase Dashboard**:
   - Go to Storage → `orthomosaics` bucket
   - Create folder: `{your_user_id}/{project_id}/`
   - Upload `orthomosaic.tif` and `dem.tif`

2. **Via API** (from your app):
   ```typescript
   const { data, error } = await supabase.storage
     .from('orthomosaics')
     .upload(`${userId}/${projectId}/orthomosaic.tif`, fileBuffer, {
       contentType: 'image/tiff',
     });
   ```

3. **Update Project Record**:
   - Get public URL: `supabase.storage.from('orthomosaics').getPublicUrl(...)`
   - Update orthomosaic project with the URL

## File Size Considerations

- **GeoTIFF files** can be large (100MB - 1GB+ for high-resolution orthomosaics)
- Consider compression when possible
- For web viewing, consider generating map tiles instead of single large GeoTIFF
- Supabase Storage has file size limits (check your plan)

## Future: Automatic Tile Generation

For better web performance, convert GeoTIFF to map tiles:
- Use `gdal2tiles` or similar tool
- Generate TMS or XYZ tile structure
- Store tiles in `tiles/` subdirectory
- Viewer can load tiles progressively instead of entire GeoTIFF

