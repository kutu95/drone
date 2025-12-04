# Photo Tracking in Flight Logs

## Overview

Flight logs now track when photos were taken during flights, including:
- **Exact GPS location** (latitude, longitude, altitude) where each photo was captured
- **Photo filename** (if available in the log file)
- **Timestamp** of when the photo was taken

## Database Schema

Added `photo_filename` column to the `flight_log_data_points` table:
- Column: `photo_filename TEXT` (nullable)
- Index created for faster photo queries

## Implementation Details

### Photo Detection

The parser extracts photo information from DJI flight log frames:
- Checks `frame.camera.isPhoto` boolean flag
- Extracts photo filename from various possible locations:
  - `camera.photoFileName`
  - `camera.fileName`
  - `custom.photoFileName`
  - Other metadata fields

### Data Points with Photos

When a photo is taken, the data point includes:
- `isPhoto: true`
- `photoFilename: string | undefined` (if filename is available in log)
- Exact `lat`, `lng`, `altitudeM` at the moment the photo was taken
- `timestampOffsetMs` indicating when in the flight the photo was taken

### Limitations

**Photo Filenames**: DJI flight logs may not always include the actual photo filename. The filename is typically stored on the SD card, and the flight log may only record that a photo was taken. Our implementation will:
- Extract the filename if it's present in the log file
- Set `photoFilename` to `undefined` if not available
- Always capture the exact GPS location when a photo is taken

## Using Photo Data

To query photos from a flight log:

```typescript
const flightLog = await fetchFlightLog(logId);
const photos = flightLog.dataPoints?.filter(dp => dp.isPhoto === true);

photos.forEach(photo => {
  console.log(`Photo taken at:`, {
    location: { lat: photo.lat, lng: photo.lng },
    altitude: photo.altitudeM,
    filename: photo.photoFilename || 'Unknown',
    timestamp: photo.timestampOffsetMs,
  });
});
```

## Migration

Run the database migration to add the `photo_filename` column:

```sql
-- This is in supabase/migrations/003_add_photo_filename.sql
ALTER TABLE flight_log_data_points 
ADD COLUMN IF NOT EXISTS photo_filename TEXT;
```

## Future Enhancements

- Display photo locations on the flight path map
- Link photos to waypoints if taken during mission execution
- Integrate with image archive to match photos by timestamp/location

