'use client';

import { useMemo, useState, useEffect } from 'react';
import { GoogleMap, Marker, Polyline, InfoWindow, useJsApiLoader } from '@react-google-maps/api';
import { FlightLog } from '@/lib/types';
import { GOOGLE_MAPS_LOADER_CONFIG } from '@/lib/google-maps-config';

interface FlightLogViewerProps {
  flightLog: FlightLog;
  /** Called after flight log metadata is updated (e.g. video filename linked) so parent can refetch */
  onFlightLogUpdated?: () => void;
}

const VIDEO_PARENT_FOLDER_IDB = 'bulk-photo-regen';
const VIDEO_PARENT_FOLDER_STORE = 'settings';
const VIDEO_PARENT_FOLDER_KEY = 'parent-folder-handle';

/** Load the last-used parent folder (from Bulk Photo Regeneration) so we can open video files directly. */
async function loadStoredParentFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(VIDEO_PARENT_FOLDER_IDB, 1);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
      r.onupgradeneeded = (e) => {
        (e.target as IDBOpenDBRequest).result.createObjectStore(VIDEO_PARENT_FOLDER_STORE);
      };
    });
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(VIDEO_PARENT_FOLDER_STORE, 'readonly');
      const req = tx.objectStore(VIDEO_PARENT_FOLDER_STORE).get(VIDEO_PARENT_FOLDER_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
    db.close();
    return handle ?? null;
  } catch {
    return null;
  }
}

function formatDateFolder(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`;
}

export default function FlightLogViewer({ flightLog, onFlightLogUpdated }: FlightLogViewerProps) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_CONFIG);

  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  /** When user clicks a red (recording) path segment, this is the segment index for the video InfoWindow */
  const [selectedRecordingSegmentIndex, setSelectedRecordingSegmentIndex] = useState<number | null>(null);

  /**
   * Calculate distance between two coordinates in meters using Haversine formula
   */
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Helper function to check if a coordinate is near the home point
  const isNearHomePoint = (lat: number, lng: number): boolean => {
    if (!flightLog.homeLocation) return false;
    const distance = calculateDistance(lat, lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng);
    // Consider points within 10 meters of home as "at home"
    return distance < 10;
  };

  // Get all valid GPS coordinates from data points (preserving photo info)
  // Filter out anomalous GPS points near home that create fork lines
  const allPathCoordinates = useMemo(() => {
    if (!flightLog.dataPoints) {
      console.log('No data points in flight log');
      return [];
    }
    
    const validCoords = flightLog.dataPoints
      .filter(dp => dp.lat !== undefined && dp.lng !== undefined && 
                     !isNaN(dp.lat!) && !isNaN(dp.lng!) &&
                     dp.lat! !== 0 && dp.lng! !== 0)
      .map(dp => ({
        lat: dp.lat!,
        lng: dp.lng!,
        isPhoto: dp.isPhoto === true,
        isVideoRecording: dp.isVideoRecording === true,
        timestampOffsetMs: dp.timestampOffsetMs ?? 0,
      }));
    
    console.log(`Flight log has ${flightLog.dataPoints.length} total data points, ${validCoords.length} with valid GPS coordinates`);
    
    // Filter out anomalous sequences of points that create fork lines to/from home
    // Detect patterns where the path jumps to home and back (GPS glitches creating forks)
    if (validCoords.length > 20 && flightLog.homeLocation) {
      const HOME_THRESHOLD = 50; // 50 meters from home - increased to catch fork lines
      const MIN_DISTANCE_FROM_HOME = 200; // Minimum distance for "far from home"
      const START_END_BUFFER = 100; // Don't filter points at start/end (takeoff/landing)
      const MAX_FORK_SEQUENCE_LENGTH = 50; // Maximum length of a fork sequence to filter
      
      const filteredCoords: typeof validCoords = [];
      const skipIndices = new Set<number>();
      
      // First pass: identify sequences that form fork lines
      for (let i = START_END_BUFFER; i < validCoords.length - START_END_BUFFER; i++) {
        if (skipIndices.has(i)) continue;
        
        const coord = validCoords[i];
        const distanceFromHome = calculateDistance(coord.lat, coord.lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng);
        
        // Check if this point is near home
        if (distanceFromHome < HOME_THRESHOLD) {
          // Check previous and next points
          const prevCoord = validCoords[i - 1];
          const nextCoord = i < validCoords.length - 1 ? validCoords[i + 1] : null;
          
          const prevDist = calculateDistance(prevCoord.lat, prevCoord.lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng);
          const nextDist = nextCoord 
            ? calculateDistance(nextCoord.lat, nextCoord.lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng)
            : Infinity;
          
          // If both previous and next are far from home, this might be a fork
          // Check a larger window to confirm
          if (prevDist > MIN_DISTANCE_FROM_HOME && nextDist > MIN_DISTANCE_FROM_HOME) {
            // Check if this is part of a sequence going to/from home
            let sequenceStart = i;
            let sequenceEnd = i;
            
            // Find the start of the sequence (where it jumps toward home)
            for (let j = i - 1; j >= Math.max(0, i - MAX_FORK_SEQUENCE_LENGTH); j--) {
              const dist = calculateDistance(validCoords[j].lat, validCoords[j].lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng);
              if (dist < HOME_THRESHOLD || (dist < prevDist && dist < calculateDistance(validCoords[j + 1].lat, validCoords[j + 1].lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng))) {
                sequenceStart = j;
              } else {
                break;
              }
            }
            
            // Find the end of the sequence (where it jumps away from home)
            for (let j = i + 1; j < Math.min(validCoords.length, i + MAX_FORK_SEQUENCE_LENGTH); j++) {
              const dist = calculateDistance(validCoords[j].lat, validCoords[j].lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng);
              if (dist < HOME_THRESHOLD || (dist < nextDist && dist < calculateDistance(validCoords[j - 1].lat, validCoords[j - 1].lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng))) {
                sequenceEnd = j;
              } else {
                break;
              }
            }
            
            // Check if points before and after the sequence are far from home
            const beforeSeqDist = sequenceStart > 0 
              ? calculateDistance(validCoords[sequenceStart - 1].lat, validCoords[sequenceStart - 1].lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng)
              : 0;
            const afterSeqDist = sequenceEnd < validCoords.length - 1
              ? calculateDistance(validCoords[sequenceEnd + 1].lat, validCoords[sequenceEnd + 1].lng, flightLog.homeLocation.lat, flightLog.homeLocation.lng)
              : 0;
            
            // If both before and after the sequence are far from home, this is a fork
            if (beforeSeqDist > MIN_DISTANCE_FROM_HOME && afterSeqDist > MIN_DISTANCE_FROM_HOME) {
              // Check if any points in the sequence are photos - don't filter if so
              let hasPhoto = false;
              for (let j = sequenceStart; j <= sequenceEnd; j++) {
                if (validCoords[j].isPhoto) {
                  hasPhoto = true;
                  break;
                }
              }
              
              if (!hasPhoto) {
                console.log(`Filtering out fork sequence from index ${sequenceStart} to ${sequenceEnd} (${sequenceEnd - sequenceStart + 1} points, before: ${beforeSeqDist.toFixed(0)}m, after: ${afterSeqDist.toFixed(0)}m from home)`);
                for (let j = sequenceStart; j <= sequenceEnd; j++) {
                  skipIndices.add(j);
                }
              }
            }
          }
        }
      }
      
      // Second pass: build filtered array
      for (let i = 0; i < validCoords.length; i++) {
        if (!skipIndices.has(i)) {
          filteredCoords.push(validCoords[i]);
        }
      }
      
      if (filteredCoords.length < validCoords.length) {
        console.log(`Filtered out ${validCoords.length - filteredCoords.length} GPS points creating fork lines near home`);
      }
      
      return filteredCoords;
    }
    
    return validCoords;
  }, [flightLog.dataPoints, flightLog.homeLocation]);

  // Get photo locations first (needed for path simplification)
  const photoLocations = useMemo(() => {
    if (!flightLog.dataPoints) return [];
    
    const allPhotos = flightLog.dataPoints.filter(dp => dp.isPhoto === true);
    console.log(`Found ${allPhotos.length} photos in flight log`);
    
    const photosWithGPS = allPhotos.filter(dp => 
      dp.lat !== undefined && dp.lng !== undefined && 
      !isNaN(dp.lat!) && !isNaN(dp.lng!) &&
      dp.lat! !== 0 && dp.lng! !== 0
    );
    
    const photosWithoutGPS = allPhotos.filter(dp => 
      !(dp.lat !== undefined && dp.lng !== undefined && 
        !isNaN(dp.lat!) && !isNaN(dp.lng!) &&
        dp.lat! !== 0 && dp.lng! !== 0)
    );
    
    if (photosWithoutGPS.length > 0) {
      console.warn(`${photosWithoutGPS.length} photos are missing valid GPS coordinates:`, 
        photosWithoutGPS.map(dp => ({
          timestamp: dp.timestampOffsetMs,
          lat: dp.lat,
          lng: dp.lng,
          hasRawData: !!dp.rawData,
        }))
      );
    }
    
    console.log(`${photosWithGPS.length} photos have valid GPS coordinates and will be displayed on map`);
    
    return photosWithGPS.map(dp => ({
      lat: dp.lat!,
      lng: dp.lng!,
      altitude: dp.altitudeM,
      filename: dp.photoFilename,
      thumbnailUrl: dp.thumbnailUrl,
      timestamp: dp.timestampOffsetMs,
      heading: dp.headingDeg,
      gimbalPitch: dp.gimbalPitchDeg,
      speed: dp.speedMps,
    }));
  }, [flightLog.dataPoints]);

  // Split path into segments (by large jumps and by video recording state)
  // Then simplify each segment separately for rendering; recording segments get timeRange for video matching
  type PathSegmentWithRecording = {
    path: Array<{ lat: number; lng: number }>;
    isRecording: boolean;
    timeRange?: { startMs: number; endMs: number };
  };
  const pathSegments = useMemo((): PathSegmentWithRecording[] => {
    if (allPathCoordinates.length === 0) return [];
    
    const MAX_JUMP_DISTANCE_M = 1000; // 1km threshold for detecting invalid GPS jumps
    type Point = { lat: number; lng: number; isPhoto?: boolean; timestampOffsetMs?: number };
    const rawSegments: Array<{ points: Point[]; isRecording: boolean; timeRange?: { startMs: number; endMs: number } }> = [];
    let currentPoints: Point[] = [];
    let currentIsRecording = false;

    allPathCoordinates.forEach((coord, index) => {
      const point: Point = {
        lat: coord.lat,
        lng: coord.lng,
        isPhoto: coord.isPhoto,
        timestampOffsetMs: coord.timestampOffsetMs,
      };
      const prevCoord = index > 0 ? allPathCoordinates[index - 1] : null;
      const recordingChanged = prevCoord && (coord.isVideoRecording !== prevCoord.isVideoRecording);
      const distance = prevCoord
        ? calculateDistance(prevCoord.lat, prevCoord.lng, coord.lat, coord.lng)
        : 0;
      const bigJump = distance > MAX_JUMP_DISTANCE_M;

      if (index === 0) {
        currentPoints = [point];
        currentIsRecording = coord.isVideoRecording;
      } else if (bigJump || recordingChanged) {
        if (currentPoints.length > 0) {
          const first = currentPoints[0];
          const last = currentPoints[currentPoints.length - 1];
          const startMs = first.timestampOffsetMs ?? 0;
          const endMs = last.timestampOffsetMs ?? 0;
          rawSegments.push({
            points: [...currentPoints],
            isRecording: currentIsRecording,
            ...(currentIsRecording && { timeRange: { startMs, endMs } }),
          });
        }
        if (bigJump) {
          console.log(`Path jump detected at data point ${index}: ${distance.toFixed(0)}m gap. Splitting into new segment.`);
        }
        currentPoints = [point];
        currentIsRecording = coord.isVideoRecording;
      } else {
        currentPoints.push(point);
      }
    });

    if (currentPoints.length > 0) {
      const first = currentPoints[0];
      const last = currentPoints[currentPoints.length - 1];
      const startMs = first.timestampOffsetMs ?? 0;
      const endMs = last.timestampOffsetMs ?? 0;
      rawSegments.push({
        points: currentPoints,
        isRecording: currentIsRecording,
        ...(currentIsRecording && { timeRange: { startMs, endMs } }),
      });
    }

    // Filter out segments that create incorrect connections to the home point.
    // A normal flight should have:
    // - One segment starting at home and going away (takeoff/departure) - the FIRST segment
    // - One segment ending at home (landing/return) - the LAST segment
    // - NO other segments that connect to home (these are erroneous GPS jumps)
    
    const HOME_STATIONARY_THRESHOLD = 20; // Max movement in meters for a "stationary" segment
    
    // First pass: Filter out entirely stationary segments at home
    const afterStationaryFilter = rawSegments.filter(seg => {
      const segment = seg.points;
      if (segment.length === 0) return false;
      if (segment.length === 1) return true; // Single point segments are OK
      
      const allNearHome = segment.every(coord => isNearHomePoint(coord.lat, coord.lng));
      
      if (allNearHome) {
        let totalMovement = 0;
        for (let i = 1; i < segment.length; i++) {
          totalMovement += calculateDistance(
            segment[i-1].lat, segment[i-1].lng,
            segment[i].lat, segment[i].lng
          );
        }
        if (totalMovement < HOME_STATIONARY_THRESHOLD) {
          console.log(`Filtering out stationary segment at home (${segment.length} points, ${totalMovement.toFixed(1)}m movement)`);
          return false;
        }
      }
      return true;
    });
    
    // Second pass: Filter out segments that incorrectly connect to home
    const segmentsWithHomeInfo = afterStationaryFilter.map((seg, index) => {
      const segment = seg.points;
      if (segment.length === 0) return { segment, index, startsAtHome: false, endsAtHome: false, isRecording: seg.isRecording, timeRange: seg.timeRange };
      
      const firstPoint = segment[0];
      const lastPoint = segment[segment.length - 1];
      const startsAtHome = isNearHomePoint(firstPoint.lat, firstPoint.lng);
      const endsAtHome = isNearHomePoint(lastPoint.lat, lastPoint.lng);
      
      return { segment, index, startsAtHome, endsAtHome, isRecording: seg.isRecording, timeRange: seg.timeRange };
    });
    
    // Find all segments that end at home
    // Only the chronologically last segment ending at home should be kept (the actual landing)
    // All others are erroneous GPS jumps that create extra lines
    const segmentsEndingAtHome = segmentsWithHomeInfo
      .filter(s => s.endsAtHome && !s.startsAtHome)
      .map(s => s.index);
    
    // The only valid segment ending at home is the one with the highest index (last chronologically)
    // If multiple segments end at home, they all end at the same point, but only the last one is legitimate
    const validSegmentEndingAtHomeIndex = segmentsEndingAtHome.length > 0 
      ? Math.max(...segmentsEndingAtHome)  // The last segment that ends at home
      : -1;
    
    console.log(`Found ${segmentsEndingAtHome.length} segment(s) ending at home at indices: [${segmentsEndingAtHome.join(', ')}]. Only keeping segment at index ${validSegmentEndingAtHomeIndex}`);
    
    // Log details about segments ending at home for debugging
    segmentsEndingAtHome.forEach(segIndex => {
      const seg = afterStationaryFilter[segIndex];
      if (seg && seg.points.length > 0) {
        const start = seg.points[0];
        const end = seg.points[seg.points.length - 1];
        const distance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
        console.log(`  Segment ${segIndex + 1}: ${seg.points.length} points, ${distance.toFixed(0)}m straight distance, is last: ${segIndex === validSegmentEndingAtHomeIndex}`);
      }
    });
    
    // Filter segments
    const filteredSegments = segmentsWithHomeInfo.filter(({ segment, index, startsAtHome, endsAtHome }) => {
      if (segment.length === 0) return false;
      if (!startsAtHome && !endsAtHome) return true;
      if (startsAtHome && !endsAtHome) {
        if (index === 0) return true;
        console.log(`Filtering out segment ${index + 1}: starts at home but is not the first segment (erroneous GPS jump)`);
        return false;
      }
      if (endsAtHome && !startsAtHome) {
        if (segmentsEndingAtHome.length > 1) {
          const isLastSegmentEndingAtHome = index === validSegmentEndingAtHomeIndex;
          if (!isLastSegmentEndingAtHome) {
            console.log(`Filtering out segment ${index + 1}: ends at home but is not the last segment ending at home`);
            return false;
          }
        }
        return true;
      }
      if (startsAtHome && endsAtHome) {
        if (afterStationaryFilter.length === 1) return true;
        console.log(`Filtering out segment ${index + 1}: both starts and ends at home (erroneous loop)`);
        return false;
      }
      return true;
    }).map(({ segment, isRecording, timeRange }) => ({ points: segment, isRecording, timeRange }));

    // Simplify each segment and keep isRecording + timeRange
    const result: PathSegmentWithRecording[] = [];
    const photoCoords = new Set<string>();
    photoLocations.forEach(photo => {
      photoCoords.add(`${Math.round(photo.lat * 1000000)},${Math.round(photo.lng * 1000000)}`);
    });

    filteredSegments.forEach(({ points: segment, isRecording, timeRange }, segIndex) => {
      let simplified: Array<{ lat: number; lng: number }>;
      if (segment.length < 200) {
        simplified = segment.map(c => ({ lat: c.lat, lng: c.lng }));
      } else {
        const targetMaxPoints = 500;
        const sampleRate = Math.ceil(segment.length / targetMaxPoints);
        simplified = [];
        segment.forEach((coord, index) => {
          const coordKey = `${Math.round(coord.lat * 1000000)},${Math.round(coord.lng * 1000000)}`;
          const isPhotoLocation = photoCoords.has(coordKey) || coord.isPhoto === true;
          if (index === 0) {
            simplified.push({ lat: coord.lat, lng: coord.lng });
            return;
          }
          if (index === segment.length - 1) {
            const lastAdded = simplified[simplified.length - 1];
            if (!lastAdded || Math.abs(lastAdded.lat - coord.lat) > 0.000001 || Math.abs(lastAdded.lng - coord.lng) > 0.000001) {
              simplified.push({ lat: coord.lat, lng: coord.lng });
            }
            return;
          }
          if (isPhotoLocation) {
            const lastPoint = simplified[simplified.length - 1];
            if (!lastPoint || Math.abs(lastPoint.lat - coord.lat) > 0.000001 || Math.abs(lastPoint.lng - coord.lng) > 0.000001) {
              simplified.push({ lat: coord.lat, lng: coord.lng });
            }
            return;
          }
          if (index % sampleRate === 0) simplified.push({ lat: coord.lat, lng: coord.lng });
        });
        console.log(`Segment ${segIndex + 1}: Simplified from ${segment.length} to ${simplified.length} points`);
      }
      result.push({ path: simplified, isRecording, ...(timeRange && { timeRange }) });
    });

    const totalOriginal = allPathCoordinates.length;
    const totalSimplified = result.reduce((sum, seg) => sum + seg.path.length, 0);
    console.log(`Total: Simplified path from ${totalOriginal} to ${totalSimplified} points across ${result.length} segment(s)`);
    return result;
  }, [allPathCoordinates, photoLocations]);

  // Recording intervals from flight log: contiguous runs where isVideoRecording is true (order = video 1, 2, ...)
  const recordingIntervals = useMemo(() => {
    if (!flightLog.dataPoints?.length) return [];
    const intervals: Array<{ startMs: number; endMs: number }> = [];
    let runStart: number | null = null;
    flightLog.dataPoints.forEach((dp) => {
      const t = dp.timestampOffsetMs ?? 0;
      if (dp.isVideoRecording) {
        if (runStart === null) runStart = t;
      } else {
        if (runStart !== null) {
          intervals.push({ startMs: runStart, endMs: t });
          runStart = null;
        }
      }
    });
    if (runStart !== null) {
      const lastT = flightLog.dataPoints[flightLog.dataPoints.length - 1]?.timestampOffsetMs ?? runStart;
      intervals.push({ startMs: runStart, endMs: lastT });
    }
    return intervals;
  }, [flightLog.dataPoints]);

  // For backward compatibility, create a single path if only one segment (for bounds etc.)
  const pathCoordinates = useMemo(() => {
    if (pathSegments.length === 0) return [];
    if (pathSegments.length === 1) return pathSegments[0].path;
    return pathSegments.reduce((longest, seg) => 
      seg.path.length > longest.length ? seg.path : longest
    , pathSegments[0].path);
  }, [pathSegments]);

  /** Match a recording segment's time range to the video file for that period (by overlapping recording interval). */
  const getVideoForSegment = (timeRange: { startMs: number; endMs: number }, videoFilenames: string[]): string | null => {
    if (videoFilenames.length === 0) return null;
    const segmentMid = (timeRange.startMs + timeRange.endMs) / 2;
    const idx = recordingIntervals.findIndex(
      (iv) => timeRange.startMs < iv.endMs && timeRange.endMs > iv.startMs
    );
    if (idx === -1) return null;
    return videoFilenames[idx] ?? null;
  };

  // Calculate bounds using ALL coordinates (not simplified) to ensure we capture everything
  const bounds = useMemo(() => {
    const allCoords = allPathCoordinates.map(c => ({ lat: c.lat, lng: c.lng }));
    
    // Add photo locations to bounds calculation so map includes all photos
    if (photoLocations && Array.isArray(photoLocations)) {
      photoLocations.forEach(photo => {
        if (photo && typeof photo.lat === 'number' && typeof photo.lng === 'number' &&
            !isNaN(photo.lat) && !isNaN(photo.lng)) {
          allCoords.push({ lat: photo.lat, lng: photo.lng });
        }
      });
    }
    
    if (allCoords.length === 0) return null;
    
    const lats = allCoords.map(c => c.lat);
    const lngs = allCoords.map(c => c.lng);
    
    // Safety check: ensure we have valid numbers
    if (lats.length === 0 || lngs.length === 0) return null;
    
    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    };
  }, [allPathCoordinates, photoLocations]);

  const center = useMemo(() => {
    if (bounds) {
      return {
        lat: (bounds.north + bounds.south) / 2,
        lng: (bounds.east + bounds.west) / 2,
      };
    }
    if (pathCoordinates.length > 0) {
      const avgLat = pathCoordinates.reduce((sum, coord) => sum + coord.lat, 0) / pathCoordinates.length;
      const avgLng = pathCoordinates.reduce((sum, coord) => sum + coord.lng, 0) / pathCoordinates.length;
      return { lat: avgLat, lng: avgLng };
    }
    if (flightLog.homeLocation) {
      return flightLog.homeLocation;
    }
    return { lat: 37.7749, lng: -122.4194 }; // Default to San Francisco
  }, [bounds, pathCoordinates, flightLog.homeLocation]);

  // Get start and end positions (use allPathCoordinates for accuracy, not simplified)
  const startPosition = flightLog.startLocation || (allPathCoordinates.length > 0 ? { lat: allPathCoordinates[0].lat, lng: allPathCoordinates[0].lng } : null);
  const endPosition = flightLog.endLocation || (allPathCoordinates.length > 0 ? { lat: allPathCoordinates[allPathCoordinates.length - 1].lat, lng: allPathCoordinates[allPathCoordinates.length - 1].lng } : null);

  if (!isLoaded) {
    return <div className="w-full h-[600px] flex items-center justify-center">Loading map...</div>;
  }

  if (pathCoordinates.length === 0) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center border border-gray-300 rounded-lg">
        <p className="text-gray-500">No GPS data available in this flight log</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] border border-gray-300 rounded-lg overflow-hidden">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={pathCoordinates.length > 0 ? 15 : 10}
        onLoad={(map) => {
          // Fit map to show all path coordinates AND photo locations
          if (bounds) {
            const googleBounds = new google.maps.LatLngBounds();
            
            // Add all flight path coordinates (not just simplified ones) for accurate bounds
            allPathCoordinates.forEach(coord => {
              googleBounds.extend(new google.maps.LatLng(coord.lat, coord.lng));
            });
            
            // Add photo locations
            photoLocations.forEach(photo => {
              googleBounds.extend(new google.maps.LatLng(photo.lat, photo.lng));
            });
            
            map.fitBounds(googleBounds);
            
            // Don't zoom in too much if it's a single point
            const zoom = map.getZoom();
            if (zoom && zoom > 18) {
              map.setZoom(18);
            }
          }
        }}
        options={{
          mapTypeId: 'satellite',
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        }}
      >
        {/* Home point marker */}
        {flightLog.homeLocation && (
          <Marker
            position={flightLog.homeLocation}
            label="H"
            icon={{
              url: 'http://maps.google.com/mapfiles/ms/icons/homegardenbusiness.png',
              scaledSize: new google.maps.Size(32, 32),
            }}
            title="Home Point"
          />
        )}

        {/* Start position marker */}
        {startPosition && (
          <Marker
            position={startPosition}
            label="S"
            icon={{
              url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
              scaledSize: new google.maps.Size(32, 32),
            }}
            title="Start Position"
          />
        )}

        {/* End position marker */}
        {endPosition && endPosition !== startPosition && (
          <Marker
            position={endPosition}
            label="E"
            icon={{
              url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
              scaledSize: new google.maps.Size(32, 32),
            }}
            title="End Position"
          />
        )}

        {/* Flight path polylines - red when recording video, blue otherwise; red segments are clickable for video link */}
        {pathSegments.map((seg, segmentIndex) =>
          seg.path.length > 1 ? (
            <Polyline
              key={`path-segment-${segmentIndex}`}
              path={seg.path}
              options={{
                strokeColor: seg.isRecording ? '#DC2626' : '#3B82F6',
                strokeOpacity: 0.8,
                strokeWeight: 3,
                clickable: seg.isRecording,
                cursor: seg.isRecording ? 'pointer' : undefined,
              }}
              onClick={seg.isRecording ? () => setSelectedRecordingSegmentIndex(segmentIndex) : undefined}
            />
          ) : null
        )}
        {/* InfoWindow for video when user clicks a red (recording) segment — one video for this segment when matched by time */}
        {selectedRecordingSegmentIndex != null && pathSegments[selectedRecordingSegmentIndex]?.isRecording && (() => {
          const seg = pathSegments[selectedRecordingSegmentIndex];
          const mid = Math.floor(seg.path.length / 2);
          const pos = seg.path[mid] ?? seg.path[0];
          const rawList = flightLog.metadata?.video_filenames;
          const videoFilenames: string[] = Array.isArray(rawList)
            ? rawList.filter((f): f is string => typeof f === 'string')
            : (flightLog.metadata?.video_filename || flightLog.metadata?.videoFilename)
              ? [String(flightLog.metadata.video_filename || flightLog.metadata.videoFilename)]
              : [];
          const photoFolderPath = (flightLog.metadata?.photo_folder_path as string) || formatDateFolder(flightLog.flightDate);
          const segmentVideo =
            seg.timeRange && videoFilenames.length > 0
              ? getVideoForSegment(seg.timeRange, videoFilenames)
              : videoFilenames.length === 1
                ? videoFilenames[0]
                : null;
          const handleOpenVideo = async (filename: string) => {
            try {
              let dirHandle: FileSystemDirectoryHandle | null = await loadStoredParentFolderHandle();
              if (dirHandle && 'requestPermission' in dirHandle) {
                const perm = await (dirHandle as FileSystemDirectoryHandle).requestPermission({ mode: 'read' });
                if (perm !== 'granted') dirHandle = null;
              }
              if (!dirHandle) {
                // @ts-expect-error File System Access API
                dirHandle = await window.showDirectoryPicker();
              }
              const dateFolder = photoFolderPath
                ? await dirHandle.getDirectoryHandle(photoFolderPath)
                : dirHandle;
              const fileHandle = await dateFolder.getFileHandle(filename);
              const file = await fileHandle.getFile();
              const url = URL.createObjectURL(file);
              window.open(url, '_blank');
            } catch (e: unknown) {
              if ((e as { name?: string })?.name !== 'AbortError') {
                console.error('Open video failed:', e);
                alert('Could not open video. Select the parent folder that contains the date folder (e.g. ' + (photoFolderPath || 'YYYY_MM_DD') + ').');
              }
            }
          };
          const handleAddVideoFiles = async () => {
            try {
              // @ts-expect-error File System Access API
              const handles = await window.showOpenFilePicker({
                types: [{ accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv'] } }],
                multiple: true,
              });
              const names = await Promise.all(handles.map(async (h) => (await h.getFile()).name));
              const combined = [...videoFilenames, ...names];
              const deduped = Array.from(new Set(combined));
              const { supabase } = await import('@/lib/supabase');
              await supabase
                .from('flight_logs')
                .update({
                  metadata: {
                    ...flightLog.metadata,
                    video_filenames: deduped,
                  },
                })
                .eq('id', flightLog.id);
              onFlightLogUpdated?.();
              setSelectedRecordingSegmentIndex(null);
            } catch (e: unknown) {
              if ((e as { name?: string })?.name !== 'AbortError') {
                console.error('Add video failed:', e);
                alert('Could not save video links.');
              }
            }
          };
          return (
            <InfoWindow
              position={pos}
              onCloseClick={() => setSelectedRecordingSegmentIndex(null)}
            >
              <div className="p-2 min-w-[200px] max-w-[320px]">
                <p className="text-sm font-medium text-gray-900 mb-2">Video recorded during this segment</p>
                {segmentVideo ? (
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => handleOpenVideo(segmentVideo)}
                      className="text-blue-600 underline text-sm hover:no-underline text-left truncate block w-full"
                      title={segmentVideo}
                    >
                      Open {segmentVideo}
                    </button>
                    {videoFilenames.length > 1 && (
                      <button
                        type="button"
                        onClick={handleAddVideoFiles}
                        className="text-xs text-gray-500 underline hover:no-underline block"
                      >
                        Add more video files
                      </button>
                    )}
                  </div>
                ) : videoFilenames.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 mb-1.5">No video matched this segment by time. All videos:</p>
                    <ul className="list-none space-y-0.5">
                      {videoFilenames.map((name, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => handleOpenVideo(name)}
                            className="text-blue-600 underline text-sm hover:no-underline text-left truncate block w-full"
                            title={name}
                          >
                            Open {name}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={handleAddVideoFiles}
                      className="text-xs text-gray-500 underline hover:no-underline mt-1"
                    >
                      Add more video files
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-500 mb-2">No video files linked. Videos are stored in the same folder as this flight&apos;s photos.</p>
                    <button
                      type="button"
                      onClick={handleAddVideoFiles}
                      className="text-sm text-blue-600 underline hover:no-underline"
                    >
                      Link video files (store filenames)
                    </button>
                  </>
                )}
              </div>
            </InfoWindow>
          );
        })()}

        {/* Photo markers - show camera icon for all photos */}
        {(() => {
          // Group photos by location to avoid duplicate markers
          const locationMap = new Map<string, { photos: typeof photoLocations; firstIndex: number }>();
          
          photoLocations.forEach((photo, index) => {
            const locationKey = `${Math.round(photo.lat * 1000000)},${Math.round(photo.lng * 1000000)}`;
            if (!locationMap.has(locationKey)) {
              locationMap.set(locationKey, { photos: [], firstIndex: index });
            }
            locationMap.get(locationKey)!.photos.push(photo);
          });

          console.log(`Creating ${locationMap.size} photo marker(s) from ${photoLocations.length} photo(s)`);

          return Array.from(locationMap.entries()).map(([locationKey, { photos, firstIndex }]) => {
            const photo = photos[0]; // Use first photo for marker
            const photoCount = photos.length;
            
            return (
              <Marker
                key={`photo-marker-${locationKey}`}
                position={{ lat: photo.lat, lng: photo.lng }}
                label={{
                  text: '📷',
                  fontSize: '20px',
                  fontWeight: 'bold',
                }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#FF6B6B',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2,
                }}
                zIndex={1000}
                title={photoCount > 1 
                  ? `${photoCount} photos at this location${photo.filename ? `\n${photo.filename}` : ''}` 
                  : (photo.filename || `Photo ${firstIndex + 1}`)}
                onClick={() => {
                  console.log(`Photo marker clicked: ${firstIndex}`);
                  setSelectedPhoto(firstIndex);
                }}
              >
                {selectedPhoto === firstIndex && (
                  <InfoWindow
                    onCloseClick={() => setSelectedPhoto(null)}
                    position={{ lat: photo.lat, lng: photo.lng }}
                  >
                    <div className="p-2" style={{ maxWidth: '350px' }}>
                      {photoCount > 1 && (
                        <p className="text-xs text-gray-500 mb-2">
                          {photoCount} photos at this location (showing photo {firstIndex + 1})
                        </p>
                      )}
                      <h3 className="font-bold text-lg mb-2">📷 Photo {firstIndex + 1}</h3>
                      {photo.thumbnailUrl && (
                        <div className="mb-3">
                          <img 
                            src={photo.thumbnailUrl} 
                            alt={`Photo ${firstIndex + 1}`}
                            className="rounded-lg shadow-sm"
                            style={{ 
                              maxWidth: '100%',
                              maxHeight: '250px', 
                              width: 'auto',
                              height: 'auto',
                              objectFit: 'contain',
                              display: 'block'
                            }}
                            onError={(e) => {
                              // Hide image if it fails to load
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      {photo.filename && (
                        <p className="text-sm text-gray-600 mb-2">
                          <strong>Filename:</strong><br/>{photo.filename}
                        </p>
                      )}
                      <div className="text-sm space-y-1">
                        <p><strong>Location:</strong> {photo.lat.toFixed(6)}, {photo.lng.toFixed(6)}</p>
                        {photo.altitude !== undefined && (
                          <p><strong>Altitude:</strong> {Math.round(photo.altitude)}m</p>
                        )}
                        {photo.heading !== undefined && (
                          <p><strong>Heading:</strong> {Math.round(photo.heading)}°</p>
                        )}
                        {photo.gimbalPitch !== undefined && (
                          <p><strong>Gimbal Pitch:</strong> {Math.round(photo.gimbalPitch)}°</p>
                        )}
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            );
          });
        })()}
      </GoogleMap>
    </div>
  );
}

