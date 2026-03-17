'use client';

import { useState, useRef, useEffect } from 'react';
import { FlightLog } from '@/lib/types';
import exifr from 'exifr';

const BULK_REGEN_IDB_NAME = 'bulk-photo-regen';
const BULK_REGEN_IDB_STORE = 'settings';
const BULK_REGEN_FOLDER_KEY = 'parent-folder-handle';

/** Persist the last selected parent folder handle in IndexedDB (supported in Chrome). */
async function saveParentFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(BULK_REGEN_IDB_NAME, 1);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
      r.onupgradeneeded = (e) => {
        (e.target as IDBOpenDBRequest).result.createObjectStore(BULK_REGEN_IDB_STORE);
      };
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BULK_REGEN_IDB_STORE, 'readwrite');
      const store = tx.objectStore(BULK_REGEN_IDB_STORE);
      store.put(handle, BULK_REGEN_FOLDER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('Could not save parent folder handle:', e);
  }
}

/** Restore the last used parent folder handle from IndexedDB, if any. */
async function loadParentFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(BULK_REGEN_IDB_NAME, 1);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
      r.onupgradeneeded = (e) => {
        (e.target as IDBOpenDBRequest).result.createObjectStore(BULK_REGEN_IDB_STORE);
      };
    });
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(BULK_REGEN_IDB_STORE, 'readonly');
      const req = tx.objectStore(BULK_REGEN_IDB_STORE).get(BULK_REGEN_FOLDER_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
    db.close();
    return handle ?? null;
  } catch {
    return null;
  }
}

interface BulkPhotoRegeneratorProps {
  flightLogs: FlightLog[];
  onClose: () => void;
  onComplete: () => Promise<void>;
}

interface FlightProcessingStatus {
  flightLog: FlightLog;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'skipped';
  photosFound: number;
  photosMatched: number;
  photosCreated: number;
  /** Number of video filenames linked (video-only mode or after full regen) */
  videosLinked?: number;
  /** When status is 'processing', number of photos processed so far in this flight */
  photosProcessed?: number;
  /** When status is 'processing', total photos to process in this flight */
  totalPhotosInFlight?: number;
  error?: string;
  folderFound: boolean;
}

export default function BulkPhotoRegenerator({ flightLogs, onClose, onComplete }: BulkPhotoRegeneratorProps) {
  const [parentFolder, setParentFolder] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [videoLinksOnly, setVideoLinksOnly] = useState(false);
  const [statuses, setStatuses] = useState<Map<string, FlightProcessingStatus>>(new Map());
  const [currentFlightIndex, setCurrentFlightIndex] = useState(0);
  const parentFolderHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const cancelRequestedRef = useRef(false);

  // Initialize or sync statuses when flightLogs changes. Preserve existing stats after
  // processing so that when the parent refetches (onComplete) we don't reset to pending.
  useEffect(() => {
    setStatuses((prev) => {
      const next = new Map<string, FlightProcessingStatus>();
      for (const log of flightLogs) {
        const existing = prev.get(log.id);
        if (existing) {
          // Keep existing status and counts; only refresh the flightLog reference
          next.set(log.id, { ...existing, flightLog: log });
        } else {
          next.set(log.id, {
            flightLog: log,
            status: 'pending',
            photosFound: 0,
            photosMatched: 0,
            photosCreated: 0,
            folderFound: false,
          });
        }
      }
      return next;
    });
  }, [flightLogs]);

  // Restore last used parent folder from IndexedDB (Chrome preserves FileSystemHandle)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const handle = await loadParentFolderHandle();
      if (cancelled || !handle) return;
      try {
        // Permission may have been revoked; re-request read access
        const perm = 'requestPermission' in handle
          ? await (handle as any).requestPermission({ mode: 'read' })
          : 'granted';
        if (cancelled || perm !== 'granted') return;
        parentFolderHandleRef.current = handle;
        setParentFolder(handle.name);
      } catch {
        // Handle invalid or permission denied; user will pick again
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Format flight date as YYYY_MM_DD
  const formatFlightDateForFolder = (flightDate?: string): string | null => {
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
  };

  // Calculate flight time range (same as PhotoFolderMatcher)
  const getFlightTimeRange = (flightLog: FlightLog) => {
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
  };

  // Get GPS coordinates from flight log at a specific timestamp (same as PhotoFolderMatcher)
  const getGPSFromFlightLog = (flightLog: FlightLog, photoTimestamp: Date) => {
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

    // Interpolate if we have adjacent points
    const closestIndex = dataPoints.indexOf(closestPoint);
    
    if (closestIndex > 0 && closestIndex < dataPoints.length - 1) {
      const prevPoint = dataPoints[closestIndex - 1];
      const nextPoint = dataPoints[closestIndex + 1];
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
  };

  // Extract timestamp from filename and get GPS from flight log
  const extractTimestampAndGPSFromFilename = (
    filename: string,
    flightLog: FlightLog,
    flightTimeRange: { start: Date; end: Date; startOffset: number } | null
  ) => {
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
  };

  // Handle parent folder selection
  const handleSelectParentFolder = async () => {
    try {
      // @ts-ignore - File System Access API
      const dirHandle = await window.showDirectoryPicker();
      parentFolderHandleRef.current = dirHandle;
      setParentFolder(dirHandle.name);
      await saveParentFolderHandle(dirHandle);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error selecting parent folder:', error);
        alert(`Error selecting folder: ${error.message}`);
      }
    }
  };

  // Process a single flight (optionally video links only — no photo delete/regeneration)
  const processFlight = async (flightLog: FlightLog, folderHandle: FileSystemDirectoryHandle, videoOnly: boolean = false) => {
    const folderName = formatFlightDateForFolder(flightLog.flightDate);
    
    if (!folderName) {
      setStatuses(prev => {
        const newStatuses = new Map(prev);
        const status = newStatuses.get(flightLog.id);
        if (status) {
          newStatuses.set(flightLog.id, {
            ...status,
            status: 'skipped',
            error: 'Flight date is missing or invalid',
          });
        }
        return newStatuses;
      });
      return;
    }

    // Try to find the subfolder
    let dateFolderHandle: FileSystemDirectoryHandle | null = null;
    try {
      dateFolderHandle = await folderHandle.getDirectoryHandle(folderName);
      setStatuses(prev => {
        const newStatuses = new Map(prev);
        const status = newStatuses.get(flightLog.id);
        if (status) {
          newStatuses.set(flightLog.id, {
            ...status,
            folderFound: true,
            status: 'processing',
          });
        }
        return newStatuses;
      });
    } catch (error) {
      setStatuses(prev => {
        const newStatuses = new Map(prev);
        const status = newStatuses.get(flightLog.id);
        if (status) {
          newStatuses.set(flightLog.id, {
            ...status,
            status: 'skipped',
            error: `Folder "${folderName}" not found in parent directory`,
          });
        }
        return newStatuses;
      });
      return;
    }

    // Video-only mode: scan for videos, update metadata, skip all photo processing
    if (videoOnly) {
      const videoFilenames: string[] = [];
      const videoExtensions = /\.(mp4|mov|avi|mkv|MP4|MOV|AVI|MKV)$/i;
      for await (const [name, entry] of dateFolderHandle as any) {
        if (entry.kind === 'file' && !name.startsWith('._') && videoExtensions.test(name)) {
          videoFilenames.push(name);
        }
      }
      const { supabase } = await import('@/lib/supabase');
      await supabase
        .from('flight_logs')
        .update({
          metadata: {
            ...flightLog.metadata,
            photo_folder_path: folderName,
            ...(videoFilenames.length > 0 && { video_filenames: videoFilenames }),
          },
        })
        .eq('id', flightLog.id);
      setStatuses(prev => {
        const next = new Map(prev);
        const s = next.get(flightLog.id);
        if (s) next.set(flightLog.id, { ...s, status: 'completed', videosLinked: videoFilenames.length, folderFound: true });
        return next;
      });
      return;
    }

    // Delete existing photos and thumbnails
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Delete photos
      const deletePhotosResponse = await fetch(`/api/flight-logs/${flightLog.id}/delete-photos`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
      });

      if (!deletePhotosResponse.ok) {
        throw new Error('Failed to delete existing photos');
      }

      // Delete thumbnails
      const deleteThumbnailsResponse = await fetch(`/api/flight-logs/${flightLog.id}/delete-thumbnails`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
      });

      if (!deleteThumbnailsResponse.ok) {
        console.warn('Failed to delete thumbnails (continuing anyway):', await deleteThumbnailsResponse.text());
      }
    } catch (error) {
      console.error(`Failed to delete existing photos for ${flightLog.id}:`, error);
      setStatuses(prev => {
        const newStatuses = new Map(prev);
        const status = newStatuses.get(flightLog.id);
        if (status) {
          newStatuses.set(flightLog.id, {
            ...status,
            status: 'error',
            error: `Failed to delete existing photos: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
        return newStatuses;
      });
      return;
    }

    // Read all image files and detect all video files from the date folder
    const photoFiles: Array<{ file: File; filename: string }> = [];
    const videoFilenames: string[] = [];
    const videoExtensions = /\.(mp4|mov|avi|mkv|MP4|MOV|AVI|MKV)$/i;

    for await (const [name, entry] of dateFolderHandle as any) {
      if (entry.kind === 'file') {
        if (name.startsWith('._')) continue;

        const file = await entry.getFile();
        const filename = file.name.toLowerCase();

        if (filename.endsWith('.dng') || filename.endsWith('.jpg') ||
            filename.endsWith('.jpeg') || filename.endsWith('.cr2') ||
            filename.endsWith('.nef') || filename.endsWith('.arw')) {
          photoFiles.push({
            file,
            filename: name,
          });
        } else if (videoExtensions.test(name)) {
          videoFilenames.push(name);
        }
      }
    }

    setStatuses(prev => {
      const newStatuses = new Map(prev);
      const status = newStatuses.get(flightLog.id);
      if (status) {
        newStatuses.set(flightLog.id, {
          ...status,
          photosFound: photoFiles.length,
        });
      }
      return newStatuses;
    });

    // Process photos and match to flight
    const flightTimeRange = getFlightTimeRange(flightLog);
    const matchedPhotos: Array<{
      file: File;
      filename: string;
      photoDate: Date;
      lat: number;
      lng: number;
      altitudeM?: number;
      timestampOffsetMs: number;
    }> = [];

    for (const photoFile of photoFiles) {
      try {
        // Try EXIF first - use multiple strategies like PhotoFolderMatcher
        let exifData: any = null;
        try {
          exifData = await exifr.parse(photoFile.file, {
            pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
            translateKeys: false,
            reviveValues: true,
            sanitize: false,
            mergeOutput: true,
          });
        } catch {
          // Try simpler approach
          try {
            exifData = await exifr.parse(photoFile.file, {
              pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
            });
          } catch {
            // EXIF parsing failed, continue to filename extraction
          }
        }

        let photoDate: Date | null = null;
        let gpsData: { lat: number; lng: number; altitudeM?: number; timestampOffsetMs: number } | null = null;

        if (exifData && Object.keys(exifData).length > 0) {
          const exifTimestamp = exifData.DateTimeOriginal || 
                               exifData.CreateDate || 
                               exifData.ModifyDate ||
                               exifData.Exif?.DateTimeOriginal ||
                               exifData.IFD0?.DateTime;
          
          if (exifTimestamp) {
            photoDate = new Date(exifTimestamp);
            if (!isNaN(photoDate.getTime()) && flightTimeRange) {
              if (photoDate >= flightTimeRange.start && photoDate <= flightTimeRange.end) {
                const timestampOffsetMs = photoDate.getTime() - flightTimeRange.start.getTime();
                let lat = exifData.GPSLatitude || exifData.GPS?.Latitude;
                let lng = exifData.GPSLongitude || exifData.GPS?.Longitude;
                
                // If GPS not in EXIF, get from flight log
                if (lat === undefined || lng === undefined) {
                  const flightGps = getGPSFromFlightLog(flightLog, photoDate);
                  if (flightGps) {
                    gpsData = flightGps;
                  }
                } else {
                  gpsData = {
                    lat,
                    lng,
                    altitudeM: exifData.GPSAltitude || exifData.GPS?.Altitude,
                    timestampOffsetMs,
                  };
                }
              }
            }
          }
        }

        // If EXIF failed or no timestamp found, try filename extraction
        if (!photoDate || !gpsData) {
          const filenameMatch = extractTimestampAndGPSFromFilename(photoFile.filename, flightLog, flightTimeRange);
          if (filenameMatch) {
            photoDate = filenameMatch.photoDate;
            gpsData = {
              lat: filenameMatch.lat,
              lng: filenameMatch.lng,
              altitudeM: filenameMatch.altitudeM,
              timestampOffsetMs: filenameMatch.timestampOffsetMs,
            };
          }
        }

        if (photoDate && gpsData) {
          matchedPhotos.push({
            file: photoFile.file,
            filename: photoFile.filename,
            photoDate,
            lat: gpsData.lat,
            lng: gpsData.lng,
            altitudeM: gpsData.altitudeM,
            timestampOffsetMs: gpsData.timestampOffsetMs,
          });
        }
      } catch (error) {
        console.error(`Error processing photo ${photoFile.filename}:`, error);
      }
    }

    setStatuses(prev => {
      const newStatuses = new Map(prev);
      const status = newStatuses.get(flightLog.id);
      if (status) {
        newStatuses.set(flightLog.id, {
          ...status,
          photosMatched: matchedPhotos.length,
        });
      }
      return newStatuses;
    });

    // Create photo records and thumbnails
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('Not authenticated');
    }

    let photosCreated = 0;
    const insertErrors: Array<{ filename: string; error: string }> = [];
    const totalInFlight = matchedPhotos.length;

    // Show progress: total photos to process for this flight
    setStatuses((prev) => {
      const next = new Map(prev);
      const s = next.get(flightLog.id);
      if (s) next.set(flightLog.id, { ...s, totalPhotosInFlight: totalInFlight, photosProcessed: 0 });
      return next;
    });

    for (let i = 0; i < matchedPhotos.length; i++) {
      const photo = matchedPhotos[i];

      try {
        // Generate thumbnail
        let thumbnailUrl: string | null = null;
        try {
          const formData = new FormData();
          formData.append('file', photo.file);
          formData.append('filename', photo.filename);

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
          } else {
            const errorText = await thumbResponse.text();
            console.warn(`Thumbnail generation failed for ${photo.filename}:`, errorText);
          }
        } catch (error) {
          console.warn(`Failed to generate thumbnail for ${photo.filename}:`, error);
        }

        // Create data point
        const insertPayload = {
          flight_log_id: flightLog.id,
          timestamp_offset_ms: photo.timestampOffsetMs,
          lat: photo.lat,
          lng: photo.lng,
          altitude_m: photo.altitudeM || null,
          is_photo: true,
          photo_filename: photo.filename,
          thumbnail_url: thumbnailUrl || null,
          original_file_url: photo.filename, // Store filename for local file path
        };

        const { data: insertData, error: insertError } = await supabase
          .from('flight_log_data_points')
          .insert(insertPayload)
          .select();

        if (insertError) {
          const errorMsg = insertError.message || JSON.stringify(insertError);
          console.error(`Failed to create photo record for ${photo.filename}:`, insertError, 'Payload:', insertPayload);
          insertErrors.push({ filename: photo.filename, error: errorMsg });
        } else {
          photosCreated++;
          console.log(`Successfully created photo record for ${photo.filename}`);
        }
      } catch (error: any) {
        const errorMsg = error?.message || JSON.stringify(error);
        console.error(`Exception creating photo record for ${photo.filename}:`, error);
        insertErrors.push({ filename: photo.filename, error: errorMsg });
      }

      // Update progress: N of M photos processed for this flight
      setStatuses((prev) => {
        const next = new Map(prev);
        const s = next.get(flightLog.id);
        if (s) next.set(flightLog.id, { ...s, photosProcessed: i + 1 });
        return next;
      });
    }

    // Log summary of errors
    if (insertErrors.length > 0) {
      console.error(`Failed to create ${insertErrors.length} photo record(s):`, insertErrors);
    }

    // Verify photos were actually created in the database
    if (photosCreated > 0) {
      const { count: verifyCount, error: verifyError } = await supabase
        .from('flight_log_data_points')
        .select('*', { count: 'exact', head: true })
        .eq('flight_log_id', flightLog.id)
        .eq('is_photo', true);
      
      if (!verifyError && verifyCount !== null) {
        console.log(`Verified ${verifyCount} photo(s) exist in database for flight ${flightLog.id}`);
        if (verifyCount !== photosCreated) {
          console.warn(`Mismatch: Created ${photosCreated} but database shows ${verifyCount} photos for flight ${flightLog.id}`);
        }
      } else if (verifyError) {
        console.error(`Error verifying photos for flight ${flightLog.id}:`, verifyError);
      }
    }

    // Update folder path and all video filenames in flight log metadata (videos live in same date folder as photos)
    if (photosCreated > 0 || videoFilenames.length > 0) {
      await supabase
        .from('flight_logs')
        .update({
          metadata: {
            ...flightLog.metadata,
            photo_folder_path: folderName,
            ...(videoFilenames.length > 0 && { video_filenames: videoFilenames }),
          },
        })
        .eq('id', flightLog.id);
    }

    setStatuses(prev => {
      const newStatuses = new Map(prev);
      const status = newStatuses.get(flightLog.id);
      if (status) {
        let errorMsg: string | undefined = undefined;
        if (photosCreated === 0) {
          if (matchedPhotos.length === 0) {
            errorMsg = 'No photos matched this flight';
          } else if (insertErrors.length > 0) {
            errorMsg = `Failed to create ${insertErrors.length} photo record(s). Check console for details.`;
          } else {
            errorMsg = 'No photos were created';
          }
        } else if (insertErrors.length > 0) {
          errorMsg = `Created ${photosCreated} photos, but ${insertErrors.length} failed. Check console for details.`;
        }
        
        newStatuses.set(flightLog.id, {
          ...status,
          status: photosCreated > 0 ? 'completed' : 'error',
          photosCreated,
          videosLinked: videoFilenames.length,
          error: errorMsg,
        });
      }
      return newStatuses;
    });
  };

  // Process all selected flights
  const handleStartProcessing = async () => {
    if (!parentFolderHandleRef.current) {
      alert('Please select a parent folder first');
      return;
    }

    cancelRequestedRef.current = false;
    setProcessing(true);
    setCurrentFlightIndex(0);

    const { supabase } = await import('@/lib/supabase');
    const { fetchFlightLog } = await import('@/lib/supabase');

    for (let i = 0; i < flightLogs.length; i++) {
      if (cancelRequestedRef.current) break;

      const flightLog = flightLogs[i];
      setCurrentFlightIndex(i + 1);

      try {
        if (videoLinksOnly) {
          await processFlight(flightLog, parentFolderHandleRef.current!, true);
        } else {
          const fullFlightLog = await fetchFlightLog(flightLog.id);
          await processFlight(fullFlightLog, parentFolderHandleRef.current!, false);
        }
      } catch (error) {
        console.error(`Error processing flight ${flightLog.id}:`, error);
        setStatuses(prev => {
          const newStatuses = new Map(prev);
          const status = newStatuses.get(flightLog.id);
          if (status) {
            newStatuses.set(flightLog.id, {
              ...status,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
          return newStatuses;
        });
      }
    }

    setProcessing(false);
    await onComplete();
  };

  const handleCancelProcessing = () => {
    cancelRequestedRef.current = true;
  };

  const statusArray = Array.from(statuses.values());
  const completedCount = statusArray.filter(s => s.status === 'completed').length;
  const errorCount = statusArray.filter(s => s.status === 'error').length;
  const skippedCount = statusArray.filter(s => s.status === 'skipped').length;
  const totalPhotosCreated = statusArray.reduce((sum, s) => sum + s.photosCreated, 0);
  const totalVideosLinked = statusArray.reduce((sum, s) => sum + (s.videosLinked ?? 0), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Bulk Photo Regeneration</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
              disabled={processing}
            >
              ×
            </button>
          </div>
          <p className="text-gray-600 mt-2">
            Select a parent folder containing date-based subfolders (YYYY_MM_DD format).
            Photos will be matched to flights by date and timestamp.
          </p>
          <label className="mt-4 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={videoLinksOnly}
              onChange={(e) => setVideoLinksOnly(e.target.checked)}
              disabled={processing}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              Update video links only (do not regenerate photos) — use when photos are already done and you only need to record video file locations.
            </span>
          </label>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Folder selection */}
          <div className="mb-6">
            <button
              onClick={handleSelectParentFolder}
              disabled={processing}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {parentFolder ? `Parent Folder: ${parentFolder}` : 'Select Parent Folder'}
            </button>
          </div>

          {/* Processing status */}
          {processing && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-900">
                {videoLinksOnly
                  ? `Updating video links — flight ${currentFlightIndex} of ${flightLogs.length}...`
                  : `Processing flight ${currentFlightIndex} of ${flightLogs.length}...`}
              </p>
              <p className="text-sm text-blue-800 mt-1">
                Videos linked so far: <strong>{totalVideosLinked}</strong>
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(currentFlightIndex / flightLogs.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Summary */}
          {!processing && (completedCount > 0 || errorCount > 0 || skippedCount > 0) && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-900">
                <strong>Summary:</strong> {completedCount} completed, {errorCount} error(s), {skippedCount} skipped
                {videoLinksOnly
                  ? `, ${totalVideosLinked} video(s) linked.`
                  : `, ${totalPhotosCreated} photo(s) created, ${totalVideosLinked} video(s) linked.`}
              </p>
            </div>
          )}

          {/* Flight status table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Flight Date</th>
                  <th className="px-4 py-2 text-left">Expected Folder</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Photos Found</th>
                  <th className="px-4 py-2 text-left">Photos Matched</th>
                  <th className="px-4 py-2 text-left">Photos Created</th>
                  <th className="px-4 py-2 text-left">Videos</th>
                </tr>
              </thead>
              <tbody>
                {statusArray.map((status) => (
                  <tr key={status.flightLog.id} className={`border-b ${status.status === 'completed' ? 'bg-green-50' : status.status === 'error' ? 'bg-red-50' : status.status === 'skipped' ? 'bg-yellow-50' : ''}`}>
                    <td className="px-4 py-2">
                      {status.flightLog.flightDate ? new Date(status.flightLog.flightDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {formatFlightDateForFolder(status.flightLog.flightDate) || 'N/A'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        status.status === 'completed' ? 'bg-green-100 text-green-800' :
                        status.status === 'error' ? 'bg-red-100 text-red-800' :
                        status.status === 'skipped' ? 'bg-yellow-100 text-yellow-800' :
                        status.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {status.status === 'completed' ? 'Completed' :
                         status.status === 'error' ? 'Error' :
                         status.status === 'skipped' ? 'Skipped' :
                         status.status === 'processing' ? 'Processing' :
                         'Pending'}
                      </span>
                      {status.status === 'processing' && status.totalPhotosInFlight != null && status.totalPhotosInFlight > 0 && (
                        <div className="mt-2 min-w-[120px]">
                          <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                            <span>{status.photosProcessed ?? 0} / {status.totalPhotosInFlight} photos</span>
                            <span>{Math.round(((status.photosProcessed ?? 0) / status.totalPhotosInFlight) * 100)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${((status.photosProcessed ?? 0) / status.totalPhotosInFlight) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {status.error && (
                        <div className="text-xs text-red-600 mt-1">{status.error}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">{status.photosFound}</td>
                    <td className="px-4 py-2">{status.photosMatched}</td>
                    <td className="px-4 py-2">{status.photosCreated}</td>
                    <td className="px-4 py-2">{status.videosLinked != null ? status.videosLinked : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-end gap-4">
          <button
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Close
          </button>
          {processing ? (
            <button
              onClick={handleCancelProcessing}
              type="button"
              className="px-4 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={handleStartProcessing}
              disabled={!parentFolder}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {videoLinksOnly ? `Update video links (${flightLogs.length} flights)` : `Regenerate Photos (${flightLogs.length} flights)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

