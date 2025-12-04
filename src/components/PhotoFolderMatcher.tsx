'use client';

import { useState, useRef } from 'react';
import { FlightLog } from '@/lib/types';
import exifr from 'exifr';

interface PhotoFolderMatcherProps {
  flightLog: FlightLog;
  onClose: () => void;
  onComplete: () => Promise<void>;
}

interface PhotoInfo {
  file: File;
  filename: string;
  exifTimestamp?: Date;
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;
  matched: boolean;
  timestampOffsetMs?: number;
  error?: string;
}

export default function PhotoFolderMatcher({ flightLog, onClose, onComplete }: PhotoFolderMatcherProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const folderHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Calculate flight time range
  const getFlightTimeRange = () => {
    if (!flightLog.flightDate || !flightLog.durationSeconds || !flightLog.dataPoints || flightLog.dataPoints.length === 0) {
      return null;
    }

    // Flight date is stored as ISO string, convert to Date
    const flightStart = new Date(flightLog.flightDate);
    // Find the first data point timestamp (should be 0, but check to be safe)
    const firstDataPoint = flightLog.dataPoints[0];
    const startOffset = firstDataPoint?.timestampOffsetMs || 0;
    
    // Flight start time (absolute)
    const absoluteStart = new Date(flightStart.getTime() + startOffset);
    // Flight end time
    const absoluteEnd = new Date(absoluteStart.getTime() + (flightLog.durationSeconds * 1000));

    return {
      start: absoluteStart,
      end: absoluteEnd,
      startOffset,
    };
  };

  // Find GPS coordinates from flight log at a specific timestamp
  const getGPSFromFlightLog = (photoTimestamp: Date) => {
    const flightTimeRange = getFlightTimeRange();
    if (!flightTimeRange || !flightLog.dataPoints || flightLog.dataPoints.length === 0) {
      return null;
    }

    // Calculate timestamp offset relative to flight start
    const photoTimestampMs = photoTimestamp.getTime();
    const flightStartMs = flightTimeRange.start.getTime();
    const timestampOffsetMs = photoTimestampMs - flightStartMs;

    // If photo is before flight start or after flight end, return null
    if (timestampOffsetMs < 0 || timestampOffsetMs > flightLog.durationSeconds! * 1000) {
      return null;
    }

    // Find the data point with the closest timestamp
    // Data points are sorted by timestampOffsetMs
    const dataPoints = flightLog.dataPoints.filter(dp => dp.lat !== undefined && dp.lng !== undefined);
    
    if (dataPoints.length === 0) {
      return null;
    }

    // Binary search for closest data point
    let left = 0;
    let right = dataPoints.length - 1;
    let closestPoint = dataPoints[0];
    let closestDiff = Math.abs((dataPoints[0].timestampOffsetMs || 0) - timestampOffsetMs);

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midTimestamp = dataPoints[mid].timestampOffsetMs || 0;
      const diff = Math.abs(midTimestamp - timestampOffsetMs);

      if (diff < closestDiff) {
        closestDiff = diff;
        closestPoint = dataPoints[mid];
      }

      if (midTimestamp < timestampOffsetMs) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // If we have adjacent points, interpolate for better accuracy
    const closestIndex = dataPoints.indexOf(closestPoint);
    
    if (closestIndex > 0 && closestIndex < dataPoints.length - 1) {
      const prevPoint = dataPoints[closestIndex - 1];
      const nextPoint = dataPoints[closestIndex + 1];
      const prevTimestamp = prevPoint.timestampOffsetMs || 0;
      const nextTimestamp = nextPoint.timestampOffsetMs || 0;

      // Interpolate if timestamp is between two points
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

    // Return closest point
    return {
      lat: closestPoint.lat!,
      lng: closestPoint.lng!,
      altitudeM: closestPoint.altitudeM,
      timestampOffsetMs,
    };
  };

  // Handle folder selection using File System Access API
  const handleFolderSelect = async () => {
    try {
      // @ts-ignore - File System Access API may not be in TypeScript types
      const dirHandle = await window.showDirectoryPicker();
      folderHandleRef.current = dirHandle;
      setSelectedFolder(dirHandle.name);
      
      // Read all image files in the directory
      const photoFiles: PhotoInfo[] = [];
      
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const filename = file.name.toLowerCase();
          
          // Check if it's an image file
          if (filename.endsWith('.dng') || filename.endsWith('.jpg') || 
              filename.endsWith('.jpeg') || filename.endsWith('.cr2') || 
              filename.endsWith('.nef') || filename.endsWith('.arw')) {
            photoFiles.push({
              file,
              filename: entry.name,
              matched: false,
            });
          }
        }
      }

      setPhotos(photoFiles);
      await processPhotos(photoFiles);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error selecting folder:', error);
        alert(`Error selecting folder: ${error.message}`);
      }
    }
  };

  // Extract timestamp from filename and get GPS coordinates from flight log
  const extractTimestampAndGPSFromFilename = (
    filename: string, 
    flightTimeRange: { start: Date; end: Date; startOffset: number } | null
  ): { photoDate: Date; lat: number; lng: number; altitudeM?: number; timestampOffsetMs: number } | null => {
    if (!flightTimeRange) {
      return null;
    }

    // Extract timestamp from DJI filename format: DJI_YYYYMMDDHHMMSS_####_D.DNG
    const filenameMatch = filename.match(/DJI_(\d{14})_(\d{4})/);
    if (!filenameMatch) {
      return null;
    }

    try {
      const dateStr = filenameMatch[1]; // YYYYMMDDHHMMSS
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1; // Months are 0-indexed
      const day = parseInt(dateStr.substring(6, 8));
      const hour = parseInt(dateStr.substring(8, 10));
      const minute = parseInt(dateStr.substring(10, 12));
      const second = parseInt(dateStr.substring(12, 14));
      
      const photoDate = new Date(year, month, day, hour, minute, second);
      
      if (isNaN(photoDate.getTime())) {
        return null;
      }

      // Check if photo timestamp falls within flight time range
      if (photoDate < flightTimeRange.start || photoDate > flightTimeRange.end) {
        // Photo is outside flight time range - ignore it (different flight on same day)
        return null;
      }

      // Get GPS coordinates from flight log at this timestamp
      const gpsData = getGPSFromFlightLog(photoDate);
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
  };

  // Process photos: extract EXIF and match to flight
  const processPhotos = async (photoFiles: PhotoInfo[]) => {
    setLoading(true);
    setProcessing(true);
    setProgress({ current: 0, total: photoFiles.length });

    const flightTimeRange = getFlightTimeRange();
    if (!flightTimeRange) {
      alert('Cannot match photos: Flight date or duration is missing.');
      setLoading(false);
      setProcessing(false);
      return;
    }

    const processedPhotos: PhotoInfo[] = [];

    for (let i = 0; i < photoFiles.length; i++) {
      const photo = photoFiles[i];
      setProgress({ current: i + 1, total: photoFiles.length });

      try {
        // Extract EXIF data - try multiple approaches for better DNG support
        let exifData: any = null;
        
        // First, try with comprehensive options including XMP and IFD0
        try {
          exifData = await exifr.parse(photo.file, {
            pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
            translateKeys: false, // Keep original EXIF keys
            reviveValues: true, // Convert dates automatically
            sanitize: false, // Don't sanitize values
            mergeOutput: true, // Merge all IFD data
          });
        } catch (firstError: any) {
          console.warn(`First EXIF parse attempt failed for ${photo.filename}:`, firstError);
          
          // Try with minimal options
          try {
            exifData = await exifr.parse(photo.file, {
              pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
              translateKeys: true,
            });
          } catch (secondError: any) {
            console.warn(`Second EXIF parse attempt failed for ${photo.filename}:`, secondError);
            
            // Try without picking specific fields (get all EXIF data)
            try {
              exifData = await exifr.parse(photo.file);
            } catch (thirdError: any) {
              console.error(`All EXIF parse attempts failed for ${photo.filename}:`, thirdError);
              throw new Error(`Failed to parse EXIF: ${thirdError.message || 'Unknown error'}`);
            }
          }
        }

        if (exifData && Object.keys(exifData).length > 0) {
          // Get timestamp from EXIF - try multiple field names
          const exifTimestamp = exifData.DateTimeOriginal || 
                               exifData.CreateDate || 
                               exifData.ModifyDate ||
                               exifData.DateTime ||
                               exifData.DateCreated;
          
          // Also check nested fields
          const nestedTimestamp = exifData.Exif?.DateTimeOriginal || 
                                 exifData.IFD0?.DateTime || 
                                 exifData.SubIFD?.DateTimeOriginal;
          
          const finalTimestamp = exifTimestamp || nestedTimestamp;
          
          if (finalTimestamp) {
            const photoDate = new Date(finalTimestamp);
            
            // Validate the date
            if (isNaN(photoDate.getTime())) {
              photo.matched = false;
              photo.error = `Invalid timestamp format: ${finalTimestamp}`;
            } else {
              // Check if photo timestamp falls within flight time range
              const isWithinFlight = photoDate >= flightTimeRange.start && photoDate <= flightTimeRange.end;
              
              if (isWithinFlight) {
                // Calculate timestamp offset relative to flight start
                const timestampOffsetMs = photoDate.getTime() - flightTimeRange.start.getTime();
                
                photo.exifTimestamp = photoDate;
                // GPS data might be in nested structures too
                let gpsLat = exifData.GPSLatitude || exifData.GPS?.Latitude;
                let gpsLng = exifData.GPSLongitude || exifData.GPS?.Longitude;
                let gpsAlt = exifData.GPSAltitude || exifData.GPS?.Altitude;
                
                // If GPS not in EXIF, get from flight log at this timestamp
                if (gpsLat === undefined || gpsLng === undefined) {
                  const gpsFromFlightLog = getGPSFromFlightLog(photoDate);
                  if (gpsFromFlightLog) {
                    gpsLat = gpsFromFlightLog.lat;
                    gpsLng = gpsFromFlightLog.lng;
                    if (gpsAlt === undefined) {
                      gpsAlt = gpsFromFlightLog.altitudeM;
                    }
                  }
                }
                
                photo.gpsLatitude = gpsLat;
                photo.gpsLongitude = gpsLng;
                photo.gpsAltitude = gpsAlt;
                photo.matched = true;
                photo.timestampOffsetMs = timestampOffsetMs;
              } else {
                photo.matched = false;
                photo.error = `Photo timestamp (${photoDate.toISOString()}) is outside flight time range (${flightTimeRange.start.toISOString()} - ${flightTimeRange.end.toISOString()})`;
              }
            }
          } else {
            // No timestamp in EXIF - try to extract from filename and cross-reference with flight log
            const gpsFromFlightLog = extractTimestampAndGPSFromFilename(photo.filename, flightTimeRange);
            if (gpsFromFlightLog) {
              photo.exifTimestamp = gpsFromFlightLog.photoDate;
              photo.gpsLatitude = gpsFromFlightLog.lat;
              photo.gpsLongitude = gpsFromFlightLog.lng;
              photo.gpsAltitude = gpsFromFlightLog.altitudeM;
              photo.matched = true;
              photo.timestampOffsetMs = gpsFromFlightLog.timestampOffsetMs;
            } else {
              // Log available EXIF fields for debugging
              const availableFields = Object.keys(exifData).slice(0, 10).join(', ');
              photo.matched = false;
              photo.error = `No timestamp found in EXIF data and could not match filename to flight log. Available fields: ${availableFields}${Object.keys(exifData).length > 10 ? '...' : ''}`;
              console.warn(`No timestamp found for ${photo.filename}. Available EXIF fields:`, Object.keys(exifData));
            }
          }
        } else {
          // EXIF data is empty - extract timestamp from filename and cross-reference with flight log
          const gpsFromFlightLog = extractTimestampAndGPSFromFilename(photo.filename, flightTimeRange);
          if (gpsFromFlightLog) {
            photo.exifTimestamp = gpsFromFlightLog.photoDate;
            photo.gpsLatitude = gpsFromFlightLog.lat;
            photo.gpsLongitude = gpsFromFlightLog.lng;
            photo.gpsAltitude = gpsFromFlightLog.altitudeM;
            photo.matched = true;
            photo.timestampOffsetMs = gpsFromFlightLog.timestampOffsetMs;
          } else {
            photo.matched = false;
            photo.error = 'EXIF data is empty and could not match filename timestamp to flight log';
          }
        }
      } catch (error: any) {
        // Error parsing EXIF - try extracting timestamp from filename and cross-reference with flight log
        const gpsFromFlightLog = extractTimestampAndGPSFromFilename(photo.filename, flightTimeRange);
        if (gpsFromFlightLog) {
          photo.exifTimestamp = gpsFromFlightLog.photoDate;
          photo.gpsLatitude = gpsFromFlightLog.lat;
          photo.gpsLongitude = gpsFromFlightLog.lng;
          photo.gpsAltitude = gpsFromFlightLog.altitudeM;
          photo.matched = true;
          photo.timestampOffsetMs = gpsFromFlightLog.timestampOffsetMs;
          photo.error = `EXIF parsing failed, but matched using filename timestamp and flight log GPS`;
          console.warn(`EXIF parsing failed for ${photo.filename}, using filename timestamp and flight log GPS`);
        } else {
          photo.matched = false;
          const errorMessage = error.message || 'Unknown error';
          photo.error = `Error processing photo: ${errorMessage}. Could not match filename to flight log.`;
        }
        console.error(`Error processing ${photo.filename}:`, error);
      }

      processedPhotos.push(photo);
    }

    setPhotos(processedPhotos);
    setLoading(false);
    setProcessing(false);
  };

  // Save matched photos
  const handleSave = async () => {
    const matchedPhotos = photos.filter(p => p.matched);
    
    if (matchedPhotos.length === 0) {
      alert('No matched photos to save.');
      return;
    }

    setSaving(true);

    try {
      // First, delete existing photos for this flight
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Not authenticated');
      }

      const deleteResponse = await fetch(`/api/flight-logs/${flightLog.id}/delete-photos`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
      });

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json();
        throw new Error(errorData.error || 'Failed to delete existing photos');
      }

      // Save folder path in flight log metadata
      const folderPath = folderHandleRef.current?.name || selectedFolder || '';
      await supabase
        .from('flight_logs')
        .update({
          metadata: {
            ...flightLog.metadata,
            photo_folder_path: folderPath,
          },
        })
        .eq('id', flightLog.id);

      // Create photo data points
      const createPromises = matchedPhotos.map(async (photo, index) => {
        // Generate thumbnail
        const formData = new FormData();
        formData.append('file', photo.file);
        formData.append('filename', photo.filename);

        let thumbnailUrl: string | null = null;
        try {
          const thumbResponse = await fetch('/api/generate-thumbnail', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
            credentials: 'include',
            body: formData,
          });

          if (thumbResponse.ok) {
            const thumbData = await thumbResponse.json();
            thumbnailUrl = thumbData.thumbnailUrl;
          }
        } catch (error) {
          console.error(`Failed to generate thumbnail for ${photo.filename}:`, error);
        }

        // Create data point
        const { error: insertError } = await supabase
          .from('flight_log_data_points')
          .insert({
            flight_log_id: flightLog.id,
            timestamp_offset_ms: photo.timestampOffsetMs!,
            lat: photo.gpsLatitude || null,
            lng: photo.gpsLongitude || null,
            altitude_m: photo.gpsAltitude || null,
            is_photo: true,
            photo_filename: photo.filename,
            thumbnail_url: thumbnailUrl,
            original_file_url: photo.filename, // Store just filename, folder path is in metadata
          });

        if (insertError) {
          throw new Error(`Failed to create photo data point for ${photo.filename}: ${insertError.message}`);
        }
      });

      await Promise.all(createPromises);
      
      alert(`Successfully created ${matchedPhotos.length} photo record(s).`);
      await onComplete();
      onClose();
    } catch (error) {
      console.error('Failed to save photos:', error);
      alert(`Failed to save photos: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const matchedCount = photos.filter(p => p.matched).length;
  const flightTimeRange = getFlightTimeRange();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Match Photos to Flight</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
          <p className="text-gray-600 mt-2">
            Select a folder containing photos from this flight. Photos will be matched by timestamp.
          </p>
          {flightTimeRange && (
            <p className="text-sm text-gray-500 mt-1">
              Flight time: {flightTimeRange.start.toLocaleString()} - {flightTimeRange.end.toLocaleString()}
            </p>
          )}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Folder selection */}
          <div className="mb-6">
            <button
              onClick={handleFolderSelect}
              disabled={processing || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedFolder ? `Folder: ${selectedFolder}` : 'Select Photo Folder'}
            </button>
          </div>

          {/* Progress */}
          {processing && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                Processing photos: {progress.current} / {progress.total}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Status */}
          {photos.length > 0 && !processing && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                Found <strong>{photos.length}</strong> photo(s). 
                Matched <strong>{matchedCount}</strong> photo(s) to this flight.
              </p>
            </div>
          )}

          {/* Photos table */}
          {photos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left">Filename</th>
                    <th className="px-4 py-2 text-left">Timestamp</th>
                    <th className="px-4 py-2 text-left">GPS</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {photos.map((photo, index) => (
                    <tr key={index} className={`border-b ${photo.matched ? 'bg-green-50' : ''}`}>
                      <td className="px-4 py-2 font-mono text-xs">
                        {photo.filename}
                      </td>
                      <td className="px-4 py-2">
                        {photo.exifTimestamp ? photo.exifTimestamp.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-2">
                        {photo.gpsLatitude && photo.gpsLongitude 
                          ? `${photo.gpsLatitude.toFixed(6)}, ${photo.gpsLongitude.toFixed(6)}`
                          : '-'}
                      </td>
                      <td className="px-4 py-2">
                        {photo.matched ? (
                          <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
                            Matched
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">
                            {photo.error || 'Not matched'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {photos.length === 0 && !processing && (
            <div className="text-center text-gray-500 py-12">
              <p>Please select a folder containing photos from this flight.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-end gap-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || matchedCount === 0 || processing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : `Create ${matchedCount} Photo Record(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

