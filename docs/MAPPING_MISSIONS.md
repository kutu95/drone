# Mapping Missions & Orthomosaic Generation

This document describes the mapping mission and orthomosaic generation features.

## Overview

Mapping missions allow you to:
1. Create automated flight paths for mapping areas (e.g., your farm)
2. Generate orthomosaics (stitched aerial maps) from captured photos
3. View and manage orthomosaic projects

## Creating a Mapping Mission

1. Navigate to **Missions** → **New Mapping Mission**
2. **Select Area**: Draw a rectangle on the map to define the area to map
3. **Configure Parameters**:
   - **Altitude**: Flight altitude (10-500m). Lower = higher resolution but more photos
   - **Speed**: Flight speed (1-15 m/s). Recommended: 5 m/s
   - **Front Overlap**: Overlap between consecutive photos (50-95%). Recommended: 75%
   - **Side Overlap**: Overlap between flight lines (50-95%). Recommended: 70%
   - **Pattern**: Parallel lines or zigzag
   - **Direction**: North-South or East-West flight lines
4. Review estimated stats (waypoint count, flight time, GSD)
5. Click **Create Mapping Mission**

## Flying the Mission

1. Export the mission as KMZ (from mission details page)
2. Import into DJI Fly app
3. Fly the mission (the drone will automatically capture photos at each waypoint)
4. Upload the flight log after landing

## Generating Orthomosaics

### Prerequisites

The orthomosaic processing requires OpenDroneMap (ODM). You have two options:

#### Option 1: Local Processing (Recommended for development)

1. Install Docker
2. Install ODM:
   ```bash
   docker pull opendronemap/odm
   ```
3. Process photos manually:
   ```bash
   docker run -it -v $(pwd)/images:/code/images -v $(pwd)/output:/code/output \
     opendronemap/odm --project-path /code
   ```

#### Option 2: API Integration (Future)

Integration with ODM API will be added to automatically process photos after flight log upload.

### Current Workflow

1. **After uploading a flight log with photos**:
   - Photos are automatically matched to the flight log
   - Photos are geotagged with GPS coordinates from the flight log

2. **Process orthomosaic**:
   - Navigate to the flight log details page
   - Click "Process Orthomosaic" (coming soon)
   - Or use the API endpoint: `POST /api/orthomosaics/process`
     ```json
     {
       "flightLogId": "uuid",
       "projectName": "Farm Mapping - March 2024"
     }
     ```

3. **Results**:
   - Orthomosaic GeoTIFF file
   - Map tiles (for web viewing)
   - Digital Elevation Model (DEM)
   - 3D point cloud (optional)

## Viewing Orthomosaics

1. Navigate to **Orthomosaics** page
2. View all your orthomosaic projects
3. Click **View Orthomosaic** to download or view the result

## Technical Details

### Grid Waypoint Generation

The system automatically generates waypoints in a grid pattern based on:
- Photo footprint (calculated from altitude and camera specs)
- Overlap requirements
- Area bounds

**DJI Air 3 Camera Specs:**
- Sensor: 23.5mm × 15.6mm
- Focal Length: 24mm (wide camera)
- Max Resolution: 5280 × 3956 pixels

**Ground Sample Distance (GSD) Calculation:**
```
GSD (cm/pixel) = (Altitude (m) × Sensor Width (mm) × 100) / (Focal Length (mm) × Image Width (px))
```

**Example**: At 70m altitude:
- GSD ≈ 1.0 cm/pixel
- Photo footprint ≈ 69m × 46m
- For 75% front overlap: Photos spaced ~17m apart

### Recommended Settings for 800m × 800m Farm

- **Altitude**: 70-80m (good balance of resolution and coverage)
- **Front Overlap**: 75%
- **Side Overlap**: 70%
- **Expected**: ~500-750 photos, ~15-20 minute flight time

## Database Schema

### Mapping Missions
Stored in `missions` table with `mission_type = 'mapping'`. Mapping-specific data in `metadata` JSONB:
- `mapping_area`: { north, south, east, west }
- `overlap`: { front, side }
- `grid_settings`: { pattern, direction }
- `processing_settings`: { gsd_target, orthophoto_resolution }

### Orthomosaic Projects
Stored in `orthomosaic_projects` table:
- Links to mission and/or flight log
- Stores processing status
- Contains URLs to output files (orthomosaic, tiles, DEM)

## API Endpoints

### Process Orthomosaic
```
POST /api/orthomosaics/process
Body: {
  flightLogId: string,
  projectName: string
}
```

Returns:
```json
{
  "success": true,
  "projectId": "uuid",
  "photoCount": 650,
  "area": { "north": ..., "south": ..., "east": ..., "west": ... }
}
```

## Future Enhancements

- [ ] Automatic ODM integration
- [ ] Real-time processing status updates
- [ ] Interactive orthomosaic viewer in web app
- [ ] Time-series comparisons (multiple flights over time)
- [ ] NDVI analysis (if using multispectral camera)
- [ ] Export to various formats (GeoTIFF, KML, etc.)
- [ ] Measurement tools on orthomosaics

## Troubleshooting

**Issue**: "No photos found in flight log"
- Ensure photos were matched to the flight log using the photo matching feature
- Photos must have GPS coordinates

**Issue**: Processing fails
- Check that photos are valid DNG/JPG files
- Ensure photos have sufficient overlap (at least 60%)
- Verify photos cover the entire area

**Issue**: Poor quality orthomosaic
- Increase overlap (front and side)
- Use lower altitude for higher resolution
- Ensure consistent lighting conditions during flight

