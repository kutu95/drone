import { FlightLog } from './types';
import exifr from 'exifr';

/**
 * Format flight date as YYYY_MM_DD for folder matching
 */
export function formatFlightDateForFolder(flightDate?: string): string | null {
  if (!flightDate) return null;
  
  try {
    const date = new Date(flightDate);
    if (isNaN(date.getTime())) return null;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}_${month}_${day}`;
  } catch {
    return null;
  }
}

/**
 * Calculate flight time range from flight log
 */
export function getFlightTimeRange(flightLog: FlightLog) {
  if (!flightLog.flightDate || !flightLog.durationSeconds || !flightLog.dataPoints || flightLog.dataPoints.length === 0) {
    return null;
  }

  const flightStart = new Date(flightLog.flightDate);
  const firstDataPoint = flightLog.dataPoints[0];
  const startOffset = firstDataPoint?.timestampOffsetMs || 0;
  
  const absoluteStart = new Date(flightStart.getTime() + startOffset);
  const absoluteEnd = new Date(absoluteStart.getTime() + (flightLog.durationSeconds * 1000));

  return {
    start: absoluteStart,
    end: absoluteEnd,
    startOffset,
  };
}

/**
 * Get GPS coordinates from flight log at a specific timestamp (with interpolation)
 */
export function getGPSFromFlightLog(flightLog: FlightLog, photoTimestamp: Date) {
  const flightTimeRange = getFlightTimeRange(flightLog);
  if (!flightTimeRange || !flightLog.dataPoints || flightLog.dataPoints.length === 0) {
    return null;
  }

  const photoTimestampMs = photoTimestamp.getTime();
  const flightStartMs = flightTimeRange.start.getTime();
  const timestampOffsetMs = photoTimestampMs - flightStartMs;

  if (timestampOffsetMs < 0 || timestampOffsetMs > flightLog.durationSeconds! * 1000) {
    return null;
  }

  const dataPoints = flightLog.dataPoints.filter(dp => dp.lat !== undefined && dp.lng !== undefined);
  
  if (dataPoints.length === 0) {
    return null;
  }

  // Find closest data point
  let closestPoint = dataPoints[0];
  let minDiff = Math.abs((closestPoint.timestampOffsetMs || 0) - timestampOffsetMs);

  for (const dp of dataPoints) {
    const diff = Math.abs((dp.timestampOffsetMs || 0) - timestampOffsetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestPoint = dp;
    }
  }

  // If we have a point very close (< 1 second), use it directly
  if (minDiff < 1000) {
    return {
      lat: closestPoint.lat!,
      lng: closestPoint.lng!,
      altitudeM: closestPoint.altitudeM,
      timestampOffsetMs,
    };
  }

  // Otherwise, interpolate between surrounding points
  const sortedPoints = [...dataPoints].sort((a, b) => 
    (a.timestampOffsetMs || 0) - (b.timestampOffsetMs || 0)
  );

  // Find surrounding points
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const prevPoint = sortedPoints[i];
    const nextPoint = sortedPoints[i + 1];
    const prevTimestamp = prevPoint.timestampOffsetMs || 0;
    const nextTimestamp = nextPoint.timestampOffsetMs || 0;

    if (timestampOffsetMs >= prevTimestamp && timestampOffsetMs <= nextTimestamp) {
      const totalDiff = nextTimestamp - prevTimestamp;
      if (totalDiff > 0) {
        const ratio = (timestampOffsetMs - prevTimestamp) / totalDiff;
        
        return {
          lat: (prevPoint.lat! * (1 - ratio) + nextPoint.lat! * ratio),
          lng: (prevPoint.lng! * (1 - ratio) + nextPoint.lng! * ratio),
          altitudeM: prevPoint.altitudeM && nextPoint.altitudeM
            ? (prevPoint.altitudeM * (1 - ratio) + nextPoint.altitudeM * ratio)
            : closestPoint.altitudeM,
          timestampOffsetMs,
        };
      }
    }
  }

  return {
    lat: closestPoint.lat!,
    lng: closestPoint.lng!,
    altitudeM: closestPoint.altitudeM,
    timestampOffsetMs,
  };
}

/**
 * Extract timestamp and GPS from filename
 */
export function extractTimestampAndGPSFromFilename(
  filename: string,
  flightLog: FlightLog,
  flightTimeRange: { start: Date; end: Date; startOffset: number } | null
) {
  if (!flightTimeRange) {
    return null;
  }

  const filenameMatch = filename.match(/DJI_(\d{14})_(\d{4})/);
  if (!filenameMatch) {
    return null;
  }

  try {
    const dateStr = filenameMatch[1];
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const hour = parseInt(dateStr.substring(8, 10));
    const minute = parseInt(dateStr.substring(10, 12));
    const second = parseInt(dateStr.substring(12, 14));
    
    const photoDate = new Date(year, month, day, hour, minute, second);
    
    if (isNaN(photoDate.getTime())) {
      return null;
    }

    if (photoDate < flightTimeRange.start || photoDate > flightTimeRange.end) {
      return null;
    }

    const gpsData = getGPSFromFlightLog(flightLog, photoDate);
    if (!gpsData) {
      return null;
    }

    return {
      photoDate,
      lat: gpsData.lat,
      lng: gpsData.lng,
      altitudeM: gpsData.altitudeM,
      timestampOffsetMs: gpsData.timestampOffsetMs,
    };
  } catch (error) {
    console.error(`Error parsing filename timestamp for ${filename}:`, error);
    return null;
  }
}

/**
 * Extract timestamp and GPS from photo file (EXIF or filename)
 */
export async function extractPhotoMetadata(
  photoFile: File,
  filename: string,
  flightLog: FlightLog
): Promise<{
  photoDate: Date;
  lat: number;
  lng: number;
  altitudeM?: number;
  timestampOffsetMs: number;
} | null> {
  const flightTimeRange = getFlightTimeRange(flightLog);
  if (!flightTimeRange) {
    return null;
  }

  // Try EXIF first
  let exifData: any = null;
  try {
    exifData = await exifr.parse(photoFile, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
      translateKeys: false,
      reviveValues: true,
      sanitize: false,
      mergeOutput: true,
    });
  } catch {
    try {
      exifData = await exifr.parse(photoFile, {
        pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
      });
    } catch {
      // EXIF parsing failed
    }
  }

  let photoDate: Date | null = null;
  let gpsFromExif: { lat: number; lng: number; altitudeM?: number } | null = null;

  // Extract timestamp from EXIF
  if (exifData) {
    const timestamp = exifData.DateTimeOriginal || 
                     exifData.CreateDate || 
                     exifData.ModifyDate ||
                     exifData.dateTimeOriginal ||
                     exifData.createDate ||
                     exifData.modifyDate;
    
    if (timestamp) {
      photoDate = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (isNaN(photoDate.getTime())) {
        photoDate = null;
      }
    }

    // Extract GPS from EXIF
    if (exifData.GPSLatitude && exifData.GPSLongitude) {
      gpsFromExif = {
        lat: exifData.GPSLatitude,
        lng: exifData.GPSLongitude,
        altitudeM: exifData.GPSAltitude,
      };
    } else if (exifData.latitude && exifData.longitude) {
      gpsFromExif = {
        lat: exifData.latitude,
        lng: exifData.longitude,
        altitudeM: exifData.altitude || exifData.Altitude,
      };
    }
  }

  // If no EXIF timestamp, try filename
  if (!photoDate) {
    const filenameResult = extractTimestampAndGPSFromFilename(filename, flightLog, flightTimeRange);
    if (filenameResult) {
      photoDate = filenameResult.photoDate;
    }
  }

  if (!photoDate || photoDate < flightTimeRange.start || photoDate > flightTimeRange.end) {
    return null;
  }

  // Get GPS - prefer EXIF, fallback to flight log
  let lat: number;
  let lng: number;
  let altitudeM: number | undefined;

  if (gpsFromExif) {
    lat = gpsFromExif.lat;
    lng = gpsFromExif.lng;
    altitudeM = gpsFromExif.altitudeM;
  } else {
    const gpsData = getGPSFromFlightLog(flightLog, photoDate);
    if (!gpsData) {
      return null;
    }
    lat = gpsData.lat;
    lng = gpsData.lng;
    altitudeM = gpsData.altitudeM;
  }

  const photoTimestampMs = photoDate.getTime();
  const flightStartMs = flightTimeRange.start.getTime();
  const timestampOffsetMs = photoTimestampMs - flightStartMs;

  return {
    photoDate,
    lat,
    lng,
    altitudeM,
    timestampOffsetMs,
  };
}

