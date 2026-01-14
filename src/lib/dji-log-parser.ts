import { FlightLog, FlightLogDataPoint } from './types';

/**
 * DJI Flight Log Parser
 * 
 * Parses binary .txt flight log files from DJI RC2 controller (Air 3).
 * Format: 100-byte header + Records area + Details area
 * All multi-byte values are little-endian.
 * 
 * ⚠️ IMPORTANT LIMITATIONS:
 * 
 * DJI log files use XOR-scrambled records with a structured format:
 * - Records have type identifiers, length, and scrambled payloads
 * - GPS coordinates are in OSD (On-Screen Display) record types
 * - Data must be unscrambled before parsing
 * 
 * This parser uses a heuristic approach to find GPS coordinates, which may
 * produce inaccurate results. For accurate parsing, you need to:
 * 1. Parse the record structure (type, length, payload)
 * 2. Unscramble payloads using XOR mechanism
 * 3. Extract OSD records and parse GPS coordinates from them
 * 
 * See docs/dji-log-format-research.md for detailed findings and references
 * to existing parsers and documentation.
 */

interface ParsedLogHeader {
  version?: number;
  flightDate?: Date;
  droneModel?: string;
  [key: string]: unknown;
}

interface ParsedLogResult {
  flightLog: Partial<FlightLog>;
  dataPoints: FlightLogDataPoint[];
}

/**
 * Read a little-endian 32-bit unsigned integer from a DataView
 */
function readUint32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/**
 * Read a little-endian 16-bit unsigned integer from a DataView
 */
function readUint16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

/**
 * Read a little-endian 64-bit float (double) from a DataView
 */
function readFloat64LE(view: DataView, offset: number): number {
  return view.getFloat64(offset, true);
}

/**
 * Read a little-endian 32-bit float from a DataView
 */
function readFloat32LE(view: DataView, offset: number): number {
  return view.getFloat32(offset, true);
}

/**
 * Parse the 100-byte header section
 */
function parseHeader(buffer: ArrayBuffer): ParsedLogHeader {
  const view = new DataView(buffer, 0, Math.min(100, buffer.byteLength));
  const header: ParsedLogHeader = {};

  // The exact header structure is not fully documented, but we can attempt
  // to extract what we know. This is a simplified version.
  
  // Try to read potential version or magic number at offset 0
  if (buffer.byteLength >= 4) {
    const magic = readUint32LE(view, 0);
    if (magic > 0 && magic < 0xFFFF) {
      header.version = magic;
    }
  }

  return header;
}

/**
 * Read a little-endian 32-bit signed integer from a DataView
 */
function readInt32LE(view: DataView, offset: number): number {
  return view.getInt32(offset, true);
}

/**
 * Attempt to extract GPS coordinates from a buffer section
 * GPS coordinates might be stored in various formats:
 * - Float64 (8 bytes) in degrees
 * - Int32 (4 bytes) in microdegrees (multiply by 1e-7)
 * - Float32 (4 bytes) in degrees
 */
function tryExtractGPS(view: DataView, offset: number): { lat?: number; lng?: number } | null {
  if (offset + 16 > view.byteLength) return null;

  // Try different formats and return the first valid one
  
  // Format 1: Float64 doubles (8 bytes each) - standard format
  try {
    const lat1 = readFloat64LE(view, offset);
    const lng1 = readFloat64LE(view, offset + 8);
    if (lat1 >= -90 && lat1 <= 90 && lng1 >= -180 && lng1 <= 180 && 
        Math.abs(lat1) > 0.01 && Math.abs(lng1) > 0.01) {
      return { lat: lat1, lng: lng1 };
    }
  } catch {
    // Invalid
  }

  // Format 2: Try swapped lat/lng ONLY if Format 1 didn't work
  // This is a fallback - don't prefer it

  // Format 3: Int32 in microdegrees (multiply by 1e-7)
  if (offset + 8 <= view.byteLength) {
    try {
      const latInt = readInt32LE(view, offset);
      const lngInt = readInt32LE(view, offset + 4);
      const lat3 = latInt * 1e-7;
      const lng3 = lngInt * 1e-7;
      if (lat3 >= -90 && lat3 <= 90 && lng3 >= -180 && lng3 <= 180 &&
          Math.abs(lat3) > 0.01 && Math.abs(lng3) > 0.01) {
        return { lat: lat3, lng: lng3 };
      }
    } catch {
      // Invalid
    }
  }

  // Format 4: Try swapped Int32 microdegrees - only as last resort
  // (Keep this commented out for now - prefer non-swapped formats)

  // Format 5: Float32 (4 bytes each)
  if (offset + 8 <= view.byteLength) {
    try {
      const lat5 = readFloat32LE(view, offset);
      const lng5 = readFloat32LE(view, offset + 4);
      if (lat5 >= -90 && lat5 <= 90 && lng5 >= -180 && lng5 <= 180 &&
          Math.abs(lat5) > 0.01 && Math.abs(lng5) > 0.01) {
        return { lat: lat5, lng: lng5 };
      }
    } catch {
      // Invalid
    }
  }

  return null;
}

/**
 * Calculate distance between two GPS coordinates in meters
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if coordinates might be swapped (lng in lat position, lat in lng position)
 * Only swap if there's VERY strong evidence - most coordinates are out of valid range
 */
function tryFixSwappedCoordinates(candidates: FlightLogDataPoint[]): FlightLogDataPoint[] {
  if (candidates.length < 20) {
    // Not enough data to make a decision, don't swap
    return candidates;
  }
  
  // Check how many coordinates are in "normal" ranges
  let normalCount = 0;
  let swappedCount = 0;
  let totalChecked = 0;
  
  for (const point of candidates) {
    if (!point.lat || !point.lng) continue;
    totalChecked++;
    
    // Normal: lat should be between -90 and 90, lng between -180 and 180
    const latNormal = Math.abs(point.lat) <= 90;
    const lngNormal = Math.abs(point.lng) <= 180;
    
    // Swapped: if swapped, "lat" (actually lng) would be > 90 but <= 180
    const clearlySwapped = Math.abs(point.lat) > 90 && Math.abs(point.lat) <= 180 && Math.abs(point.lng) <= 90;
    
    if (latNormal && lngNormal) {
      normalCount++;
    } else if (clearlySwapped) {
      swappedCount++;
    }
  }
  
  // Only swap if a MAJORITY of coordinates are clearly swapped (very conservative)
  // Need at least 70% to be clearly swapped before we swap
  if (totalChecked > 0 && swappedCount > normalCount * 2 && swappedCount / totalChecked > 0.7) {
    // Try swapping and see if it produces better results
    const swapped = candidates.map(point => ({
      ...point,
      lat: point.lng,
      lng: point.lat,
    }));
    
    // Check if swapped version has more valid coordinates
    let swappedValid = 0;
    for (const point of swapped) {
      if (point.lat && point.lng && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180) {
        swappedValid++;
      }
    }
    
    // Only return swapped if it produces significantly more valid coordinates
    if (swappedValid > normalCount * 1.5) {
      return swapped;
    }
  }
  
  return candidates;
}

/**
 * Filter and validate GPS coordinates to remove false positives
 */
function filterValidGPSPoints(candidates: FlightLogDataPoint[]): FlightLogDataPoint[] {
  if (candidates.length === 0) return [];

  // Check if coordinates might be swapped and fix them
  // But only do this if we're very confident they're swapped
  const maybeFixed = tryFixSwappedCoordinates(candidates);
  
  // If swapping resulted in fewer valid coordinates, don't use it
  const originalValid = candidates.filter(p => p.lat && p.lng && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180).length;
  const swappedValid = maybeFixed.filter(p => p.lat && p.lng && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180).length;
  
  // Only use swapped version if it's clearly better (at least 50% more valid)
  const useSwapped = swappedValid > originalValid * 1.5 && swappedValid > originalValid + 20;
  
  const dataToUse = useSwapped ? maybeFixed : candidates;

  // Sort by timestamp
  const sorted = [...dataToUse].sort((a, b) => a.timestampOffsetMs - b.timestampOffsetMs);
  const valid: FlightLogDataPoint[] = [];
  
  // Remove duplicate coordinates (same lat/lng)
  const seen = new Set<string>();
  
  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    
    if (!point.lat || !point.lng) continue;

    // Validate coordinates are in reasonable ranges
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) {
      continue; // Invalid coordinate
    }

    // Create a key for this coordinate (rounded to avoid floating point precision issues)
    const key = `${Math.round(point.lat * 1000000)}_${Math.round(point.lng * 1000000)}`;
    if (seen.has(key)) continue; // Skip duplicates
    seen.add(key);

    // First point is always valid (if in valid range)
    if (valid.length === 0) {
      valid.push(point);
      continue;
    }

    // Check distance from previous valid point
    const lastValid = valid[valid.length - 1];
    if (!lastValid.lat || !lastValid.lng) continue;

    const distance = calculateDistance(
      lastValid.lat,
      lastValid.lng,
      point.lat,
      point.lng
    );

    // Filter out points that are too far away (unrealistic jumps)
    // A drone can move at most ~100 m/s, so with 10 Hz sampling, max jump is ~10m
    // Allow some tolerance for GPS noise, but filter extreme jumps
    const timeDiff = (point.timestampOffsetMs - lastValid.timestampOffsetMs) / 1000; // seconds
    const maxSpeed = 50; // m/s (more realistic for consumer drones)
    const maxDistance = maxSpeed * timeDiff + 20; // Add 20m tolerance for GPS accuracy

    // Only accept points that form a reasonable sequence
    if (distance <= maxDistance && distance < 10000 && timeDiff > 0 && timeDiff < 60) {
      valid.push(point);
    }
  }

  // If we filtered out too many points, try a more relaxed filter
  // But preserve what we have if it's working
  if (valid.length < Math.max(10, sorted.length * 0.1) && sorted.length > 50) {
    // Too aggressive filtering - try more relaxed
    const relaxed: FlightLogDataPoint[] = [];
    seen.clear();
    
    for (let i = 0; i < sorted.length; i++) {
      const point = sorted[i];
      if (!point.lat || !point.lng) continue;
      
      // Skip invalid ranges
      if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) continue;
      
      const key = `${Math.round(point.lat * 1000000)}_${Math.round(point.lng * 1000000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      if (relaxed.length === 0) {
        relaxed.push(point);
        continue;
      }
      
      const last = relaxed[relaxed.length - 1];
      if (!last.lat || !last.lng) continue;
      
      const dist = calculateDistance(last.lat, last.lng, point.lat, point.lng);
      // More relaxed: allow up to 5000m jumps (still filter extreme outliers over 100km)
      if (dist < 5000 && dist < 100000) {
        relaxed.push(point);
      }
    }
    
    // Only use relaxed if it gives us significantly more points
    return relaxed.length > valid.length * 1.5 ? relaxed : valid;
  }

  return valid;
}

/**
 * Parse the records area to extract telemetry data points
 * This is a simplified parser - the actual format is complex and not fully documented
 */
function parseRecordsArea(buffer: ArrayBuffer, startOffset: number = 100): FlightLogDataPoint[] {
  const candidates: FlightLogDataPoint[] = [];
  const view = new DataView(buffer);

  if (buffer.byteLength <= startOffset) {
    return [];
  }

  // Use larger step size to avoid finding overlapping patterns
  // DJI typically records at 10 Hz (100ms intervals), so records should be spaced out
  // Start with larger steps and adjust based on findings
  let stepSize = 64; // bytes - start larger to find record boundaries
  let offset = startOffset;
  let timestampOffset = 0;
  let consecutiveValid = 0;
  
  // Track which format worked best by checking if coordinates form a reasonable sequence
  const formatScores = new Map<string, number>();

  // Try to find GPS coordinate patterns in the data
  while (offset + 32 < buffer.byteLength && candidates.length < 5000) {
    // Try extracting GPS - try different offsets to find record structure
    let gps: { lat?: number; lng?: number } | null = null;
    let bestOffset = 0;
    
    // Try base offset first (most likely)
    gps = tryExtractGPS(view, offset);
    
    // If that didn't work, try a few alternative offsets
    if (!gps && offset + 48 < buffer.byteLength) {
      for (const offsetDelta of [8, 16, 24]) {
        const candidate = tryExtractGPS(view, offset + offsetDelta);
        if (candidate) {
          gps = candidate;
          bestOffset = offsetDelta;
          break;
        }
      }
    }
    
    if (gps && gps.lat && gps.lng) {
      // Additional validation: check if coordinates are reasonable
      // Most drone flights are within reasonable bounds
      // Exclude coordinates that are in ocean or clearly wrong regions
      
      // Try to read potential altitude nearby (try multiple offsets)
      let altitudeM: number | undefined;
      
      // Try different offsets where altitude might be stored
      for (const altOffset of [16, 24, 32, 40]) {
        if (offset + altOffset + 4 <= buffer.byteLength) {
          try {
            // Try as float32
            const alt32 = readFloat32LE(view, offset + altOffset);
            // Try as int32 (altitude might be in centimeters)
            const altInt = view.getInt32(offset + altOffset, true);
            
            // Check if float32 makes sense as meters
            if (alt32 >= -100 && alt32 <= 1000 && Math.abs(alt32) < 1e10) {
              altitudeM = alt32;
              break;
            }
            
            // Check if int32 makes sense as centimeters (convert to meters)
            if (altInt >= -10000 && altInt <= 1000000) {
              altitudeM = altInt / 100; // Convert cm to m
              break;
            }
          } catch {
            // Ignore read errors
          }
        }
      }

      // Additional validation: check if coordinates are in reasonable ranges
      // Filter out coordinates that are clearly invalid (like 0,0 or extreme values)
      const lat = gps.lat!;
      const lng = gps.lng!;
      
      // Reject coordinates that are too close to 0,0 (often indicates invalid data)
      if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) {
        offset += stepSize;
        continue;
      }
      
      // Reject coordinates in obviously wrong locations (like middle of ocean far from land)
      // But be careful - we want to accept valid coordinates even if they're in unusual places
      // So only reject if they're in the middle of nowhere AND have no nearby neighbors
      
      candidates.push({
        timestampOffsetMs: timestampOffset,
        lat: gps.lat,
        lng: gps.lng,
        altitudeM,
      });

      consecutiveValid++;
      timestampOffset += 100; // Assume ~100ms between samples (10 Hz)
      
      // If we found several consecutive points, increase step size slightly
      if (consecutiveValid > 10) {
        offset += stepSize;
      } else {
        offset += stepSize;
      }
    } else {
      consecutiveValid = 0;
      offset += stepSize;
    }
  }

  // Filter to remove false positives
  let validPoints = filterValidGPSPoints(candidates);
  
  // Only do outlier removal if we have enough points (otherwise it's too aggressive)
  if (validPoints.length > 50) {
    // Remove obvious outliers: if a point is way too far from both previous and next points, remove it
    const filtered: FlightLogDataPoint[] = [];
    for (let i = 0; i < validPoints.length; i++) {
      const point = validPoints[i];
      if (!point.lat || !point.lng) {
        filtered.push(point); // Keep points without GPS if they have other data
        continue;
      }

      // Always keep first and last points
      if (i === 0 || i === validPoints.length - 1) {
        filtered.push(point);
        continue;
      }

      // Check distance to previous and next points
      const prev = validPoints[i - 1];
      const next = validPoints[i + 1];
      
      if (!prev.lat || !prev.lng || !next.lat || !next.lng) {
        filtered.push(point); // Keep if neighbors don't have GPS
        continue;
      }

      const distToPrev = calculateDistance(prev.lat, prev.lng, point.lat, point.lng);
      const distToNext = calculateDistance(point.lat, point.lng, next.lat, next.lng);
      const distPrevNext = calculateDistance(prev.lat, prev.lng, next.lat, next.lng);

      // Only remove if this point creates a MASSIVE unrealistic detour
      // Be very conservative - only remove obvious errors
      if (distToPrev > 50000 || distToNext > 50000) {
        // This is clearly wrong (50km+ jumps) - skip it
        continue;
      }
      
      // If the detour is less than 10x the direct distance, keep it (very permissive)
      if (distToPrev + distToNext < distPrevNext * 10) {
        filtered.push(point);
      } else if (distToPrev < 5000 && distToNext < 5000) {
        // Keep if reasonably close to neighbors (within 5km)
        filtered.push(point);
      } else {
        // Might be an outlier but keep it anyway to preserve data
        filtered.push(point);
      }
    }
    
    // Only use filtered version if we didn't lose too many points
    if (filtered.length > validPoints.length * 0.7) {
      validPoints = filtered;
    }
  }

  return validPoints;
}

/**
 * Calculate statistics from data points
 */
function calculateStatistics(dataPoints: FlightLogDataPoint[]): Partial<FlightLog> {
  if (dataPoints.length === 0) {
    return {};
  }

  let maxAltitudeM = -Infinity;
  let maxSpeedMps = -Infinity;
  let totalDistanceM = 0;
  let maxDistanceM = 0;
  let homeLat: number | undefined;
  let homeLng: number | undefined;
  let startLat: number | undefined;
  let startLng: number | undefined;
  let endLat: number | undefined;
  let endLng: number | undefined;
  let minBattery = Infinity;
  let maxBattery = -Infinity;

  for (let i = 0; i < dataPoints.length; i++) {
    const point = dataPoints[i];

    // Set home position from first valid GPS point
    if (i === 0 && point.lat && point.lng) {
      homeLat = point.lat;
      homeLng = point.lng;
      startLat = point.lat;
      startLng = point.lng;
    }

    // Track end position
    if (i === dataPoints.length - 1 && point.lat && point.lng) {
      endLat = point.lat;
      endLng = point.lng;
    }

    // Max altitude - filter out unrealistic values
    if (point.altitudeM !== undefined) {
      // Filter out altitudes that are clearly wrong
      // Typical drone flights are between -100m (below launch) and 500m above launch
      // But allow up to 1000m for very high altitude flights
      if (point.altitudeM >= -500 && point.altitudeM <= 2000 && Math.abs(point.altitudeM) < 1e6) {
        if (point.altitudeM > maxAltitudeM) {
          maxAltitudeM = point.altitudeM;
        }
      }
    }

    // Max speed
    if (point.speedMps !== undefined && point.speedMps > maxSpeedMps) {
      maxSpeedMps = point.speedMps;
    }

    // Battery
    if (point.batteryPercent !== undefined) {
      if (point.batteryPercent < minBattery) minBattery = point.batteryPercent;
      if (point.batteryPercent > maxBattery) maxBattery = point.batteryPercent;
    }

    // Distance from home
    if (point.lat && point.lng && homeLat && homeLng) {
      const distance = haversineDistance(homeLat, homeLng, point.lat, point.lng);
      if (distance > maxDistanceM) {
        maxDistanceM = distance;
      }
    }

    // Cumulative distance
    if (i > 0 && point.lat && point.lng && dataPoints[i - 1].lat && dataPoints[i - 1].lng) {
      totalDistanceM += haversineDistance(
        dataPoints[i - 1].lat!,
        dataPoints[i - 1].lng!,
        point.lat,
        point.lng
      );
    }
  }

  const durationSeconds = dataPoints.length > 0 
    ? dataPoints[dataPoints.length - 1].timestampOffsetMs / 1000 
    : undefined;

  // Calculate relative altitude (altitude above home point)
  // If home point is known, we can calculate relative altitude
  let maxRelativeAltitudeM = -Infinity;
  if (homeLat && homeLng && dataPoints.length > 0) {
    // Calculate home altitude as average of first few points (assuming they're at launch)
    const homeAltitudeSamples = dataPoints.slice(0, Math.min(10, dataPoints.length))
      .filter(p => p.altitudeM !== undefined && p.altitudeM >= -100 && p.altitudeM <= 1000)
      .map(p => p.altitudeM!);
    
    if (homeAltitudeSamples.length > 0) {
      const homeAltitudeM = homeAltitudeSamples.reduce((sum, alt) => sum + alt, 0) / homeAltitudeSamples.length;
      
      // Calculate max relative altitude
      for (const point of dataPoints) {
        if (point.altitudeM !== undefined && point.altitudeM >= -500 && point.altitudeM <= 2000) {
          const relativeAlt = point.altitudeM - homeAltitudeM;
          if (relativeAlt > maxRelativeAltitudeM) {
            maxRelativeAltitudeM = relativeAlt;
          }
        }
      }
    }
  }

  return {
    durationSeconds,
    // Use relative altitude if calculated, otherwise use absolute
    maxAltitudeM: maxRelativeAltitudeM !== -Infinity 
      ? maxRelativeAltitudeM 
      : (maxAltitudeM !== -Infinity && maxAltitudeM >= -100 && maxAltitudeM <= 2000 ? maxAltitudeM : undefined),
    maxSpeedMps: maxSpeedMps !== -Infinity && maxSpeedMps >= 0 && maxSpeedMps <= 100 ? maxSpeedMps : undefined,
    maxDistanceM: maxDistanceM > 0 && maxDistanceM < 100000 ? maxDistanceM : undefined,
    totalDistanceM: totalDistanceM > 0 && totalDistanceM < 1000000 ? totalDistanceM : undefined,
    homeLocation: homeLat && homeLng ? { lat: homeLat, lng: homeLng } : undefined,
    startLocation: startLat && startLng ? { lat: startLat, lng: startLng } : undefined,
    endLocation: endLat && endLng ? { lat: endLat, lng: endLng } : undefined,
    batteryStartPercent: minBattery !== Infinity && minBattery >= 0 && minBattery <= 100 ? minBattery : undefined,
    batteryEndPercent: maxBattery !== -Infinity && maxBattery >= 0 && maxBattery <= 100 ? maxBattery : undefined,
  };
}

/**
 * Calculate haversine distance between two GPS points in meters
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Extract filename from file path or name
 */
function extractFilename(fileName: string): string {
  // DJI files are named like: DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt
  return fileName.split('/').pop() || fileName;
}

/**
 * Try to extract date from filename
 */
function extractDateFromFilename(fileName: string): Date | undefined {
  // Format: DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt
  const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})_\[(\d{2})-(\d{2})-(\d{2})\]/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match.map(Number);
    return new Date(year, month - 1, day, hour, minute, second);
  }
  return undefined;
}

/**
 * Main parsing function
 * Parses a DJI flight log file (binary .txt format)
 */
export async function parseDJILogFile(file: File): Promise<ParsedLogResult> {
  const arrayBuffer = await file.arrayBuffer();
  const filename = extractFilename(file.name);

  // Parse header (first 100 bytes)
  const header = parseHeader(arrayBuffer);

  // Parse records area (after header)
  const dataPoints = parseRecordsArea(arrayBuffer, 100);

  // Calculate statistics
  const stats = calculateStatistics(dataPoints);

  // Extract date from filename if possible
  const flightDate = extractDateFromFilename(filename);

  const flightLog: Partial<FlightLog> = {
    filename,
    flightDate: flightDate?.toISOString(),
    droneModel: 'DJI Air 3', // Default, could be extracted from header if known
    ...stats,
    metadata: {
      fileSize: arrayBuffer.byteLength,
      dataPointCount: dataPoints.length,
      ...header,
    },
  };

  return {
    flightLog,
    dataPoints,
  };
}

/**
 * Validate that a file appears to be a DJI log file
 */
export function validateDJILogFile(file: File): { valid: boolean; error?: string } {
  // Check filename pattern - accept both DJIFlightRecord_ and FlightRecord_ formats
  if (!file.name.match(/(DJI)?FlightRecord_\d{4}-\d{2}-\d{2}_\[\d{2}-\d{2}-\d{2}\]\.txt$/)) {
    return {
      valid: false,
      error: 'File does not match DJI flight log naming pattern (FlightRecord_YYYY-MM-DD_[HH-MM-SS].txt or DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt)',
    };
  }

  // Check file size (should be at least 100 bytes for header)
  if (file.size < 100) {
    return {
      valid: false,
      error: 'File is too small to be a valid DJI flight log',
    };
  }

  return { valid: true };
}

