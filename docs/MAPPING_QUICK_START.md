# Quick Start: Mapping Missions & Orthomosaics

## Get Started in 5 Steps

### 1. Run Database Migration

Apply the migration to add mapping support:
```bash
# Using Supabase CLI
supabase migration up

# Or apply via Supabase Dashboard SQL Editor
# Copy contents of: supabase/migrations/014_add_mapping_missions.sql
```

### 2. Create Your First Mapping Mission

1. Go to **Missions** → **New Mapping Mission**
2. Draw a rectangle on the map covering your 800m × 800m farm
3. Set these recommended settings:
   - Altitude: **70-80m**
   - Front Overlap: **75%**
   - Side Overlap: **70%**
   - Pattern: **Parallel Lines**
   - Direction: **North-South** (or East-West based on your preference)
4. Review the estimated stats:
   - ~500-750 waypoints
   - ~15-20 minute flight time
   - ~1.0 cm/pixel GSD
5. Click **Create Mapping Mission**

### 3. Fly the Mission

1. Open the mission details page
2. Click **Export KMZ**
3. Import the KMZ into DJI Fly app (see mission planner guide)
4. Execute the mission - the drone will automatically capture photos at each waypoint
5. Land and upload the flight log file

### 4. Match Photos to Flight Log

1. After uploading the flight log, the system will prompt for photo folder
2. Select the parent folder containing date-based subfolders (e.g., `2024_03_19/`)
3. Photos are automatically matched by timestamp and GPS
4. Thumbnails are generated using dcraw for full-resolution extraction

### 5. Create Orthomosaic Project

1. Open the flight log details page
2. Click **Process Orthomosaic** button (appears if photos are matched)
3. Enter a project name (e.g., "Farm Mapping - March 2024")
4. Project record is created

### 6. Process Orthomosaic (Choose One Method)

#### Method A: Manual Processing with ODM (Recommended for now)

1. **Install Docker** (if not already installed):
   ```bash
   # macOS
   brew install --cask docker
   
   # Or download from https://www.docker.com/products/docker-desktop
   ```

2. **Pull ODM Image**:
   ```bash
   docker pull opendronemap/odm
   ```

3. **Collect Photos**:
   - Find your photos in the date folder (e.g., `2024_03_19/`)
   - Copy all photos to a working directory

4. **Run ODM**:
   ```bash
   docker run -it --rm \
     -v /absolute/path/to/photos:/code/images:ro \
     -v /absolute/path/to/output:/code/output \
     opendronemap/odm \
     --project-path /code \
     --orthophoto-resolution 2.0 \
     --skip-3dmodel
   ```

5. **Upload Results**:
   - Find `odm_orthophoto.tif` in output directory
   - Upload to Supabase Storage (bucket: `orthomosaics`)
   - Update project record with the URL

#### Method B: Automatic Processing (Future)

Once photos are uploaded to Supabase Storage, automatic processing will be available:
1. Photos are automatically processed with ODM
2. Results uploaded back to storage
3. Project status updates automatically

### 7. View Your Orthomosaic

1. Go to **Orthomosaics** page
2. Find your project (status: "completed")
3. Click **View Orthomosaic**
4. See your farm mapped on Google Maps!

## Recommended Settings for 800m × 800m Farm

| Parameter | Value | Notes |
|-----------|-------|-------|
| Altitude | 70-80m | Balance between coverage and resolution |
| Front Overlap | 75% | Ensures good stitching quality |
| Side Overlap | 70% | Prevents gaps between flight lines |
| Pattern | Parallel Lines | Easier for straight coverage |
| Speed | 5 m/s | Consistent speed for even spacing |
| Expected Photos | 500-750 | Depends on exact area and spacing |
| Flight Time | 15-20 min | At 5 m/s with photo capture time |
| GSD | ~1.0 cm/pixel | Excellent detail for farm mapping |

## Troubleshooting

**No photos found?**
- Ensure photos are matched to the flight log using photo matching feature
- Check that photo timestamps fall within the flight duration

**Processing fails?**
- Verify Docker is installed and running
- Check ODM image is pulled: `docker images | grep opendronemap`
- Ensure sufficient disk space (10GB+ recommended)

**Low quality orthomosaic?**
- Increase overlap to 80%/75%
- Use lower altitude (but increases flight time and photo count)
- Ensure consistent lighting during flight

## Next Steps

Once you have your first orthomosaic:
- Compare multiple flights over time
- Use for crop monitoring
- Measure areas and distances
- Export for use in GIS software (QGIS, ArcGIS)

## Support

See detailed documentation:
- `docs/MAPPING_MISSIONS.md` - Full feature documentation
- `docs/ODM_SETUP.md` - ODM installation and usage
- `docs/MAPPING_SYSTEM_SUMMARY.md` - Technical implementation details

