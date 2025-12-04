# DJI Log File Format Research

## Key Findings

### File Structure

DJI flight log files (`.txt` format) have the following structure:

1. **Header**: 100-byte header at the beginning
2. **Records Area**: Contains flight telemetry data
3. **Details Area**: Additional metadata

**Important**: For DJI Fly app (which RC2 uses), the order is:
- Header → **Details Area** → Records Area

For DJI GO app, the order is:
- Header → Records Area → Details Area

### Record Structure

Records in the Records Area are NOT stored as raw binary data. Instead, they follow a structured format:

1. **Record Type Identifier** - Identifies the type of record (e.g., "OSD" for telemetry)
2. **Length** - Length of the payload
3. **Payload** - The actual data (GPS, altitude, etc.)
4. **End-of-record marker**

### XOR Scrambling

**Critical Finding**: The payloads are **XOR-scrambled** using an obfuscation mechanism. This means you cannot directly read GPS coordinates from the binary file - they must be unscrambled first.

### GPS Coordinates Location

GPS coordinates are stored within **OSD (On-Screen Display) record types**. These records contain:
- GPS coordinates (latitude, longitude)
- Altitude
- Speed
- Other telemetry data

### Encryption (Version 13+)

Starting with log version 13, DJI introduced AES encryption for log records. Decrypting these requires:
- API key from DJI
- Keychains obtained from DJI's API
- PBKDF2WithHmacSHA1 algorithm for key derivation

## Existing Tools and Resources

### 1. djilogs.live555.com
- Detailed documentation of the log file format
- Source code for "djiparsetxt" application
- Shows parsing process including XOR unscrambling

### 2. dji-log-parser (GitHub: lvauvillier)
- Comprehensive library and CLI tool
- Supports all log versions including encrypted logs
- Can export to CSV, GeoJSON, KML
- Written in Rust but can be used as reference

### 3. DJI Reverse Engineering Repository (GitHub: fvantienen/dji_rev)
- Tools for reverse engineering DJI products
- Includes log file parsing utilities

### 4. Phantom Help DJI Flight Log Viewer
- Online tool that can decrypt and parse logs
- Supports .txt logs from DJI Fly, DJI GO, DJI Pilot

## Why Our Current Parser Isn't Working

Our current implementation is trying to read GPS coordinates directly from the binary file, but:

1. **We're not handling XOR scrambling** - The data is obfuscated and must be unscrambled first
2. **We're not parsing the record structure** - We need to identify record types, read lengths, and parse payloads
3. **We're reading raw binary** - Instead of structured records with type identifiers

## Recommendations

### Option 1: Use Existing Library
- Use the `dji-log-parser` Rust library if we can call it from Node.js/TypeScript
- Or use it as a reference to implement proper parsing

### Option 2: Implement Full Parser
To properly parse DJI logs, we need to:

1. **Parse the header** (100 bytes) to determine:
   - Log version
   - File structure order (Records before/after Details)
   - Other metadata

2. **Locate Records Area**:
   - Check if Details area comes first (DJI Fly) or Records first (DJI GO)
   - Navigate to the Records Area

3. **Parse Records**:
   - Read record type identifier
   - Read record length
   - Read payload (XOR-scrambled)
   - Unscramble the payload using XOR mechanism
   - Parse the payload according to record type

4. **Extract OSD Records**:
   - Identify OSD record types
   - Parse GPS coordinates, altitude, speed from unscrambled payload

5. **Handle Encryption** (for version 13+):
   - Obtain API key from DJI
   - Retrieve keychains
   - Decrypt records before parsing

### Option 3: Hybrid Approach
- Use an existing tool/library as a preprocessing step
- Convert DJI logs to a standard format (CSV, GeoJSON)
- Import the converted data into our system

## Next Steps

1. **Review djilogs.live555.com documentation** for detailed XOR unscrambling algorithm
2. **Check if we can use dji-log-parser** library (Rust) from our TypeScript/JavaScript codebase
3. **Implement record structure parsing** if we continue with custom implementation
4. **Add XOR unscrambling** to our parser

## References

- [DJI Log File Format Documentation](https://djilogs.live555.com/)
- [dji-log-parser GitHub Repository](https://github.com/lvauvillier/dji-log-parser)
- [DJI Reverse Engineering Repository](https://github.com/fvantienen/dji_rev)
- [Phantom Help DJI Flight Log Viewer](https://www.phantomhelp.com/LogViewer/Upload/)
- [AirData UAV - DJI RC2 Upload Instructions](https://app.airdata.com/wiki/Help/DJI+RC,+RC+2:+Uploads+for+US+Users)

