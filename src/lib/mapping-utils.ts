import { Waypoint, Mission } from './types';

// DJI Air 3 camera specifications
const DJI_AIR_3_CAMERA = {
  sensorWidth: 23.5, // mm
  sensorHeight: 15.6, // mm
  focalLength: 24, // mm (wide camera)
  aspectRatio: 4 / 3,
};

export interface MappingArea {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MappingParameters {
  area: MappingArea;
  altitudeM: number;
  frontOverlap: number; // 60-90%
  sideOverlap: number; // 60-90%
  speedMps?: number;
  pattern?: 'parallel_lines' | 'zigzag';
  direction?: 'north_south' | 'east_west';
  gimbalPitchDeg?: number; // Default -90 for vertical
}

/**
 * Calculate Ground Sample Distance (GSD) in cm/pixel
 */
export function calculateGSD(
  altitudeM: number,
  sensorWidthMm: number = DJI_AIR_3_CAMERA.sensorWidth,
  focalLengthMm: number = DJI_AIR_3_CAMERA.focalLength,
  imageWidthPx: number = 5280 // DJI Air 3 max resolution width
): number {
  // GSD (cm/pixel) = (Altitude (m) * Sensor Width (mm) * 100) / (Focal Length (mm) * Image Width (px))
  const gsdCm = (altitudeM * sensorWidthMm * 100) / (focalLengthMm * imageWidthPx);
  return Math.round(gsdCm * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate photo footprint dimensions at given altitude
 */
export function calculatePhotoFootprint(altitudeM: number): {
  widthM: number;
  heightM: number;
} {
  const sensorWidthMm = DJI_AIR_3_CAMERA.sensorWidth;
  const sensorHeightMm = DJI_AIR_3_CAMERA.sensorHeight;
  const focalLengthMm = DJI_AIR_3_CAMERA.focalLength;

  // Footprint = (Altitude * Sensor Dimension) / Focal Length
  // Note: Altitude is in meters, sensor dimensions and focal length are in mm
  // To convert: (m * mm) / mm = m, so we multiply altitude by 1000 to convert to mm, then divide by 1000 to get m
  // Simplified: (altitudeM * 1000 * sensorWidthMm) / (focalLengthMm * 1000) = (altitudeM * sensorWidthMm) / focalLengthMm
  const widthM = (altitudeM * sensorWidthMm) / focalLengthMm;
  const heightM = (altitudeM * sensorHeightMm) / focalLengthMm;

  return {
    widthM: Math.round(widthM * 100) / 100,
    heightM: Math.round(heightM * 100) / 100,
  };
}

/**
 * Calculate spacing between photos based on overlap
 */
function calculatePhotoSpacing(
  footprintDimension: number,
  overlapPercent: number
): number {
  // Validate inputs
  if (footprintDimension <= 0) {
    throw new Error('Photo footprint dimension must be greater than zero');
  }
  if (overlapPercent < 0 || overlapPercent >= 100) {
    throw new Error('Overlap must be between 0% and 99%');
  }
  
  // Spacing = Footprint * (1 - Overlap)
  const spacing = footprintDimension * (1 - overlapPercent / 100);
  
  // Minimum spacing to prevent excessive waypoints (1.0 meters is reasonable minimum)
  const MIN_SPACING = 1.0;
  if (spacing < MIN_SPACING) {
    throw new Error(
      `Photo spacing would be ${spacing.toFixed(2)}m, which is too small. ` +
      `For an 800m x 800m area, try: Altitude 70-80m, Overlap 70-75%. ` +
      `Current: Altitude ${altitudeM}m would need spacing > ${MIN_SPACING}m.`
    );
  }
  
  return spacing;
}

/**
 * Calculate the number of flight lines needed
 */
function calculateFlightLines(
  areaWidth: number,
  photoSpacing: number,
  footprintDimension: number
): number {
  // Validate inputs
  if (areaWidth <= 0) {
    throw new Error('Area width must be greater than zero');
  }
  if (photoSpacing <= 0) {
    throw new Error('Photo spacing must be greater than zero');
  }
  
  // Number of lines = ceil(Area Width / Photo Spacing) + 1
  const numLines = Math.ceil(areaWidth / photoSpacing) + 1;
  
  // Safety check for reasonable values
  if (!isFinite(numLines) || numLines > 10000) {
    throw new Error(`Calculated flight lines (${numLines}) is invalid or too large. Please adjust settings.`);
  }
  
  return numLines;
}

/**
 * Calculate the number of photos per flight line
 */
function calculatePhotosPerLine(
  lineLength: number,
  photoSpacing: number
): number {
  // Validate inputs
  if (lineLength <= 0) {
    throw new Error('Flight line length must be greater than zero');
  }
  if (photoSpacing <= 0) {
    throw new Error('Photo spacing must be greater than zero');
  }
  
  // Photos per line = ceil(Line Length / Photo Spacing) + 1
  const photosPerLine = Math.ceil(lineLength / photoSpacing) + 1;
  
  // Safety check for reasonable values
  if (!isFinite(photosPerLine) || photosPerLine > 10000) {
    throw new Error(`Calculated photos per line (${photosPerLine}) is invalid or too large. Please adjust settings.`);
  }
  
  return photosPerLine;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two lat/lng points in meters (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate bearing between two points
 */
function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  const bearing = Math.atan2(y, x);
  return ((bearing * 180) / Math.PI + 360) % 360;
}

/**
 * Calculate destination point given start point, bearing, and distance
 */
function calculateDestination(
  lat: number,
  lng: number,
  bearing: number,
  distanceM: number
): { lat: number; lng: number } {
  const R = 6371000; // Earth radius in meters
  const lat1Rad = toRadians(lat);
  const lng1Rad = toRadians(lng); // Convert longitude to radians
  const bearingRad = toRadians(bearing);
  const angularDistance = distanceM / R;

  const lat2Rad = Math.asin(
    Math.sin(lat1Rad) * Math.cos(angularDistance) +
      Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const lng2Rad =
    lng1Rad + // Use radians, not degrees
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1Rad),
      Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2Rad)
    );

  return {
    lat: (lat2Rad * 180) / Math.PI,
    lng: (lng2Rad * 180) / Math.PI,
  };
}

/**
 * Generate grid waypoints for mapping mission
 */
export function generateMappingWaypoints(
  params: MappingParameters
): Waypoint[] {
  const {
    area,
    altitudeM,
    frontOverlap,
    sideOverlap,
    speedMps = 5,
    pattern = 'parallel_lines',
    direction = 'north_south',
    gimbalPitchDeg = -90,
  } = params;

  // Calculate photo footprint
  const footprint = calculatePhotoFootprint(altitudeM);

  // Determine flight direction
  const flyNorthSouth = direction === 'north_south';

  // Calculate area dimensions
  const centerLat = (area.north + area.south) / 2;
  const centerLng = (area.east + area.west) / 2;

  // Calculate actual area dimensions in meters
  const areaWidthM = calculateDistance(
    centerLat,
    area.west,
    centerLat,
    area.east
  );
  const areaHeightM = calculateDistance(
    area.north,
    centerLng,
    area.south,
    centerLng
  );

  // Determine which dimension corresponds to flight lines
  const flightLineLength = flyNorthSouth ? areaHeightM : areaWidthM;
  const flightLineSpacing = flyNorthSouth
    ? calculatePhotoSpacing(footprint.widthM, sideOverlap)
    : calculatePhotoSpacing(footprint.widthM, sideOverlap);
  const photoSpacing = flyNorthSouth
    ? calculatePhotoSpacing(footprint.heightM, frontOverlap)
    : calculatePhotoSpacing(footprint.heightM, frontOverlap);

  // Validate spacing values to prevent division by zero or extremely small values
  if (flightLineSpacing <= 0 || photoSpacing <= 0) {
    console.error('Invalid spacing values:', { flightLineSpacing, photoSpacing });
    throw new Error('Photo spacing is too small. Please adjust altitude or overlap settings.');
  }

  // Validate spacing values to prevent division by zero or extremely small values
  if (flightLineSpacing <= 0 || photoSpacing <= 0) {
    console.error('Invalid spacing values:', { flightLineSpacing, photoSpacing });
    throw new Error('Photo spacing is too small. Please adjust altitude or overlap settings.');
  }

  // Calculate number of flight lines and photos per line with validation
  let numLines = calculateFlightLines(
    flyNorthSouth ? areaWidthM : areaHeightM,
    flightLineSpacing,
    footprint.widthM
  );
  let photosPerLine = calculatePhotosPerLine(flightLineLength, photoSpacing);

  // Add safety limits to prevent excessive waypoint generation
  const MAX_WAYPOINTS = 5000; // Reasonable upper limit (reduced from 10000)
  const MAX_LINES = 500;
  const MAX_PHOTOS_PER_LINE = 500;
  
  // Cap individual values
  if (numLines > MAX_LINES) {
    console.warn(`Number of flight lines (${numLines}) exceeds maximum (${MAX_LINES}), capping to ${MAX_LINES}`);
    numLines = MAX_LINES;
  }
  if (photosPerLine > MAX_PHOTOS_PER_LINE) {
    console.warn(`Photos per line (${photosPerLine}) exceeds maximum (${MAX_PHOTOS_PER_LINE}), capping to ${MAX_PHOTOS_PER_LINE}`);
    photosPerLine = MAX_PHOTOS_PER_LINE;
  }

  const estimatedTotalWaypoints = numLines * photosPerLine;

  if (estimatedTotalWaypoints > MAX_WAYPOINTS) {
    const errorMsg = `This would create ${estimatedTotalWaypoints} waypoints, which exceeds the maximum of ${MAX_WAYPOINTS}. Please increase altitude, reduce overlap, or select a smaller area.`;
    console.error('Too many waypoints:', {
      numLines,
      photosPerLine,
      estimatedTotalWaypoints,
    });
    throw new Error(errorMsg);
  }

  // Additional validation for reasonable values
  if (isNaN(numLines) || isNaN(photosPerLine) || !isFinite(numLines) || !isFinite(photosPerLine)) {
    const errorMsg = `Invalid waypoint count calculation: ${numLines} lines, ${photosPerLine} photos per line. Please check your settings.`;
    console.error('Invalid waypoint count:', { numLines, photosPerLine });
    throw new Error(errorMsg);
  }

  console.log('Mapping grid calculation:', {
    areaWidthM,
    areaHeightM,
    footprint,
    flightLineLength,
    flightLineSpacing,
    photoSpacing,
    numLines,
    photosPerLine,
    totalPhotos: estimatedTotalWaypoints,
  });

  const waypoints: Waypoint[] = [];
  let waypointIndex = 0;

  // Starting position (southwest corner for north-south, northwest for east-west)
  let startLat = flyNorthSouth ? area.south : centerLat;
  let startLng = flyNorthSouth ? centerLng : area.west;

  // Calculate bearing for flight lines
  const flightBearing = flyNorthSouth ? 0 : 90; // North or East
  const lineBearing = flyNorthSouth ? 90 : 0; // East or North

  // Generate waypoints
  for (let lineIndex = 0; lineIndex < numLines; lineIndex++) {
    // Calculate start position for this flight line
    let lineStartLat = startLat;
    let lineStartLng = startLng;

    if (lineIndex > 0) {
      // Move to start of next flight line
      const lineOffset = calculateDestination(
        startLat,
        startLng,
        lineBearing,
        lineIndex * flightLineSpacing
      );
      lineStartLat = lineOffset.lat;
      lineStartLng = lineOffset.lng;
    }

    // Determine direction for this line (zigzag pattern reverses direction on alternate lines)
    const reverseDirection =
      pattern === 'zigzag' && lineIndex % 2 === 1;
    const currentFlightBearing = reverseDirection
      ? (flightBearing + 180) % 360
      : flightBearing;
    const currentPhotosPerLine = photosPerLine;

    // Generate waypoints along this flight line
    for (let photoIndex = 0; photoIndex < currentPhotosPerLine; photoIndex++) {
      let waypointLat = lineStartLat;
      let waypointLng = lineStartLng;

      if (photoIndex > 0) {
        // Calculate position along flight line
        const photoDistance =
          reverseDirection
            ? (currentPhotosPerLine - photoIndex) * photoSpacing
            : photoIndex * photoSpacing;
        const photoPosition = calculateDestination(
          lineStartLat,
          lineStartLng,
          currentFlightBearing,
          photoDistance
        );
        waypointLat = photoPosition.lat;
        waypointLng = photoPosition.lng;
      }

      // Calculate heading (perpendicular to flight line for camera orientation)
      const heading = (currentFlightBearing + 90) % 360;

      waypoints.push({
        id: `wp-${waypointIndex}`,
        index: waypointIndex,
        lat: waypointLat,
        lng: waypointLng,
        altitudeM: altitudeM,
        speedMps: speedMps,
        headingDeg: heading,
        gimbalPitchDeg: gimbalPitchDeg,
        actionType: 'photo',
        actionPayload: {
          triggerPhoto: true,
        },
      });

      waypointIndex++;
    }
  }

  return waypoints;
}

/**
 * Estimate total flight time for mapping mission using parameters
 * More accurate than calculating from waypoints for large missions
 */
export function estimateMappingFlightTimeFromParams(
  params: MappingParameters
): number {
  const { area, altitudeM, frontOverlap, sideOverlap, speedMps = 5 } = params;
  
  // Calculate photo footprint and spacing
  const footprint = calculatePhotoFootprint(altitudeM);
  const centerLat = (area.north + area.south) / 2;
  const centerLng = (area.east + area.west) / 2;
  
  // Calculate area dimensions
  const areaWidthM = calculateDistance(centerLat, area.west, centerLat, area.east);
  const areaHeightM = calculateDistance(area.north, centerLng, area.south, centerLng);
  
  // Determine flight direction
  const flyNorthSouth = params.direction === 'north_south';
  
  // Calculate spacing
  const frontSpacing = calculatePhotoSpacing(footprint.heightM, frontOverlap);
  const sideSpacing = calculatePhotoSpacing(footprint.widthM, sideOverlap);
  
  // Calculate number of flight lines and photos per line based on direction
  // If flying north-south: flight lines go north-south, spacing is east-west
  // If flying east-west: flight lines go east-west, spacing is north-south
  const flightLineLength = flyNorthSouth ? areaHeightM : areaWidthM;
  const flightLineSpacingDimension = flyNorthSouth ? areaWidthM : areaHeightM;
  
  const numLines = Math.ceil(flightLineSpacingDimension / sideSpacing) + 1;
  const photosPerLine = Math.ceil(flightLineLength / frontSpacing) + 1;
  
  // Calculate total flight distance
  // Total distance = length of all flight lines combined
  const totalFlightDistance = flightLineLength * numLines;
  
  // Calculate flight time in seconds
  const flightTimeSeconds = totalFlightDistance / speedMps;
  
  // Add time for photo capture (2 seconds per photo)
  const totalPhotos = numLines * photosPerLine;
  const photoTimeSeconds = totalPhotos * 2;
  
  // Add buffer for turns between flight lines (5 seconds per turn)
  const turnTimeSeconds = (numLines - 1) * 5;
  
  const totalTimeSeconds = flightTimeSeconds + photoTimeSeconds + turnTimeSeconds;
  
  // Sanity check: flight time should be reasonable (less than 24 hours)
  const MAX_REASONABLE_TIME = 24 * 60 * 60; // 24 hours in seconds
  if (totalTimeSeconds > MAX_REASONABLE_TIME) {
    console.warn('Flight time seems unreasonably large:', totalTimeSeconds, 'seconds');
    // Return a capped estimate or recalculate with simpler method
    return Math.min(totalTimeSeconds, MAX_REASONABLE_TIME);
  }
  
  return Math.ceil(totalTimeSeconds);
}

/**
 * Estimate total flight time for mapping mission
 * This is a simplified calculation that estimates based on waypoint count and speed,
 * rather than calculating exact distance (which can be inaccurate for zigzag patterns)
 */
export function estimateMappingFlightTime(
  waypoints: Waypoint[],
  speedMps: number
): number {
  if (waypoints.length < 2) return 0;
  
  // For large waypoint counts, use a simpler estimation
  // Average spacing between waypoints along flight lines (typically 10-30m)
  const avgSpacingM = 20;
  const totalDistanceM = (waypoints.length - 1) * avgSpacingM;
  
  // Calculate flight time in seconds
  const flightTimeSeconds = totalDistanceM / speedMps;
  
  // Add time for photo capture (assume 2 seconds per photo)
  const photoTimeSeconds = waypoints.length * 2;
  
  // Add buffer for turns (estimate based on waypoint count)
  const estimatedLines = Math.max(1, Math.ceil(Math.sqrt(waypoints.length / 20)));
  const turnTimeSeconds = estimatedLines * 5;
  
  const totalTimeSeconds = flightTimeSeconds + photoTimeSeconds + turnTimeSeconds;
  
  // Return in seconds (component will convert to minutes for display)
  return Math.ceil(totalTimeSeconds);
}

/**
 * Validate mapping parameters
 */
export function validateMappingParameters(
  params: MappingParameters
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!params.area) {
    errors.push('Mapping area is required');
  } else {
    if (params.area.north <= params.area.south) {
      errors.push('North boundary must be greater than south boundary');
    }
    if (params.area.east <= params.area.west) {
      errors.push('East boundary must be greater than west boundary');
    }
  }

  if (params.altitudeM < 10 || params.altitudeM > 500) {
    errors.push('Altitude must be between 10m and 500m');
  }

  if (params.frontOverlap < 50 || params.frontOverlap > 95) {
    errors.push('Front overlap must be between 50% and 95%');
  }

  if (params.sideOverlap < 50 || params.sideOverlap > 95) {
    errors.push('Side overlap must be between 50% and 95%');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

