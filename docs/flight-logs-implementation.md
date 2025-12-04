# Flight Log Import and Viewing Implementation

## Overview

This document describes the flight log import and viewing functionality that has been implemented for the DJI Air 3 Mission Planner.

## Features

### 1. Database Schema

- **`flight_logs` table**: Stores flight log metadata and statistics
- **`flight_log_data_points` table**: Stores individual telemetry data points from the flight

See `supabase/migrations/002_flight_logs.sql` for the complete schema.

### 2. DJI Log File Parser

Location: `src/lib/dji-log-parser.ts`

- Parses binary `.txt` flight log files from DJI RC2 controller
- Extracts GPS coordinates, altitude, speed, and other telemetry data
- Calculates flight statistics (duration, max altitude, distance, etc.)
- Validates file format and naming convention

**Note**: The parser uses a heuristic approach since DJI's log format is proprietary and not fully documented. The parser can be enhanced with more sophisticated reverse engineering or by using third-party libraries.

### 3. User Interface Components

#### FlightLogUpload Component
- Drag-and-drop file upload
- File validation
- Progress feedback
- Automatic parsing and saving

#### FlightLogViewer Component
- Google Maps integration
- Visualizes flight path as a polyline
- Shows home point, start, and end markers
- Handles GPS coordinate display

### 4. Pages

#### Flight Logs List Page (`/logs`)
- Lists all flight logs for the current user
- Shows key statistics (date, duration, max altitude, distance)
- Upload interface for new logs
- Delete functionality

#### Flight Log Detail Page (`/logs/[id]`)
- Displays comprehensive flight statistics
- Interactive map showing flight path
- Shows all telemetry data
- Navigation controls

### 5. Navigation

Navigation links have been added to:
- Missions page → Flight Logs
- Mission detail page → Flight Logs
- Flight Logs page → Missions
- Flight Log detail page → Missions and Flight Logs

## Usage

### Uploading a Flight Log

1. Navigate to the Flight Logs page (`/logs`)
2. Drag and drop a `.txt` file from your DJI RC2 controller, or click to select a file
3. The file will be parsed and saved automatically
4. View the flight log details by clicking on it in the list

### File Requirements

- File must be named: `DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt`
- File must be at least 100 bytes (minimum header size)
- File must be in the binary format used by DJI RC2 controllers

### Accessing Files from RC2 Controller

1. Connect your DJI RC2 controller to a computer via USB
2. Navigate to: `Internal shared storage > Android > data > dji.go.v5 > files > FlightRecord`
3. Copy the `.txt` files to your computer
4. Upload them through the web interface

## Data Model

### FlightLog Type

```typescript
{
  id: string;
  filename: string;
  flightDate?: string;
  droneModel?: string;
  durationSeconds?: number;
  maxAltitudeM?: number;
  maxDistanceM?: number;
  homeLocation?: { lat: number; lng: number };
  startLocation?: { lat: number; lng: number };
  endLocation?: { lat: number; lng: number };
  totalDistanceM?: number;
  maxSpeedMps?: number;
  batteryStartPercent?: number;
  batteryEndPercent?: number;
  metadata?: Record<string, unknown>;
  dataPoints?: FlightLogDataPoint[];
}
```

### FlightLogDataPoint Type

```typescript
{
  timestampOffsetMs: number;
  lat?: number;
  lng?: number;
  altitudeM?: number;
  speedMps?: number;
  headingDeg?: number;
  gimbalPitchDeg?: number;
  batteryPercent?: number;
  signalStrength?: number;
  satelliteCount?: number;
  isPhoto?: boolean;
  isVideoRecording?: boolean;
  rawData?: Record<string, unknown>;
}
```

## API Functions

All flight log operations are available in `src/lib/supabase.ts`:

- `fetchFlightLogs()` - Get all flight logs for current user
- `fetchFlightLog(id)` - Get a single flight log with data points
- `saveFlightLog(flightLog)` - Save a parsed flight log
- `deleteFlightLog(id)` - Delete a flight log

## Future Enhancements

1. **Improved Parser**: Integrate with more sophisticated DJI log parsing libraries or enhance the current parser with better reverse engineering
2. **Data Filtering**: Allow users to filter and search flight logs
3. **Export Features**: Export flight logs to CSV, KML, or other formats
4. **Comparison Tools**: Compare multiple flight logs
5. **Statistics Dashboard**: Aggregate statistics across all flights
6. **Mission Comparison**: Compare planned missions with actual flight logs
7. **Photo Integration**: Link photos taken during flights with flight log data points

## Technical Notes

- The parser processes files client-side to avoid sending large binary files to the server
- Data points are inserted in batches to avoid hitting database limits
- The map viewer uses Google Maps JavaScript API (same as mission planner)
- All flight log data is protected by Row Level Security (RLS) in Supabase

