# DJI RC2 Controller Log File Format (Air 3)

## Overview

The DJI RC2 controller for the Air 3 drone records flight logs in a **proprietary binary format** with a `.txt` extension. Despite the `.txt` file extension, these files are **not plain text** but contain encoded binary flight data.

## File Location

Flight logs are stored on the RC2 controller at:

```
Internal shared storage > Android > data > dji.go.v5 > files > FlightRecord
```

## File Naming Convention

Log files are named using the format:
```
DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt
```

Where:
- `YYYY-MM-DD` = Date of the flight
- `HH-MM-SS` = Time of the flight

Example: `DJIFlightRecord_2024-01-15_[14-30-45].txt`

## File Structure

The binary log files have a three-part structure:

1. **Header Section** (100 bytes)
   - Contains metadata about the flight
   - Stores file-level information

2. **Records Area**
   - Main body containing flight telemetry data
   - Contains time-series flight data (GPS coordinates, altitude, speed, battery status, etc.)

3. **Details Area**
   - Additional flight information
   - Supplementary data related to the flight

### Byte Order

All multi-byte numeric values within the file are stored in **little-endian format**.

## Accessing Log Files

### Connection Method

1. Connect the DJI RC2 controller to a computer via USB cable
2. The controller should appear as an external storage device

### Platform-Specific Access

- **Windows**: Controller should appear as an external drive; navigate directly to the FlightRecord folder
- **macOS**: May require a file transfer application like **OpenMTP** to access the controller's storage
- **Linux**: Typically accessible as a mounted USB device

### Manual Extraction

After connecting, navigate to the FlightRecord directory and copy the `.txt` log files to your computer for analysis.

## Analyzing Log Files

Since these files are binary format, specialized tools are required to parse and interpret the data.

### Available Tools

1. **AirData UAV**
   - Platform: Web-based
   - Supports manual upload of `.txt` flight logs
   - Provides detailed flight analysis
   - URL: https://app.airdata.com

2. **Phantom Help's DJI Flight Log Viewer**
   - Platform: Web-based
   - Can decrypt and view flight data from `.txt` logs
   - URL: https://www.phantomhelp.com/LogViewer/Upload/

3. **DJI Log Parser (djilogs.live555.com)**
   - Platform: Web-based
   - Provides documentation on DJI log file format
   - Offers parsing tools for log files
   - URL: https://djilogs.live555.com

## Important Notes

1. **Proprietary Format**: DJI has not publicly documented the exact format specification of these log files. Third-party tools rely on reverse engineering to interpret the data.

2. **US Users**: DJI has discontinued the flight record sync feature in the DJI Fly app for users in the United States. Manual extraction and upload of flight logs is required for US users.

3. **Format Versions**: The log file format may vary between different DJI drone models and controller versions. The information above specifically relates to the RC2 controller with the Air 3 drone.

4. **Data Content**: Log files typically contain:
   - GPS coordinates and altitude
   - Speed and heading
   - Battery status
   - Gimbal orientation
   - Controller inputs
   - Sensor data
   - Timestamps for all recorded data points

## Potential Integration

For the DJI Air 3 Mission Planner project, log file parsing could enable:
- Post-flight analysis of completed missions
- Verification of mission execution
- Flight path replay visualization
- Performance analytics
- Mission improvement recommendations

## References

- AirData UAV Help Documentation: https://app.airdata.com/wiki/Help/DJI+RC,+RC+2:+Uploads+for+US+Users
- Phantom Help DJI Flight Log Viewer: https://www.phantomhelp.com/LogViewer/Upload/
- DJI Log Parser Documentation: https://djilogs.live555.com

