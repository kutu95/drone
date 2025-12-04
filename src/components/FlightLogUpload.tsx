'use client';

import { useState, useRef } from 'react';
import { formatFlightDateForFolder, extractPhotoMetadata } from '@/lib/photo-processing';

interface FlightLogUploadProps {
  onUploadComplete?: () => void;
  onError?: (error: string) => void;
}

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'checking' | 'uploading' | 'success' | 'error' | 'skipped';
  progress?: string;
  error?: string;
  dataPointsCount?: number;
  flightLogId?: string;
  flightLog?: any; // Store flight log data for photo processing
}

export default function FlightLogUpload({ onUploadComplete, onError }: FlightLogUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [fileStatuses, setFileStatuses] = useState<FileUploadStatus[]>([]);
  const [showPhotoFolderDialog, setShowPhotoFolderDialog] = useState(false);
  const [uploadedFlightLogs, setUploadedFlightLogs] = useState<Array<{ id: string; flightLog: any }>>([]);
  const [processingPhotos, setProcessingPhotos] = useState(false);
  const [photoProcessingStatus, setPhotoProcessingStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parentFolderHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const uploadSingleFile = async (file: File, fileIndex: number): Promise<void> => {
    // Update status to checking
    setFileStatuses(prev => {
      const updated = [...prev];
      updated[fileIndex] = { ...updated[fileIndex], status: 'checking', progress: 'Checking for duplicates...' };
      return updated;
    });

    // Check if this file has already been uploaded
    try {
      const { checkFlightLogExists } = await import('@/lib/supabase');
      const alreadyExists = await checkFlightLogExists(file.name).catch((err) => {
        // Silently handle duplicate check errors - treat as "not a duplicate" to allow upload
        console.debug('Duplicate check encountered an error (treating as no duplicate):', err);
        return false;
      });
      
      if (alreadyExists) {
        setFileStatuses(prev => {
          const updated = [...prev];
          updated[fileIndex] = { 
            ...updated[fileIndex], 
            status: 'skipped', 
            progress: 'Already uploaded',
            error: 'This flight log has already been uploaded'
          };
          return updated;
        });
        return; // Skip this file
      }
    } catch (checkError) {
      // If we can't check, log but continue - server will also check
      console.warn('Could not check for duplicate, proceeding anyway:', checkError);
    }

    // Update status to uploading
    setFileStatuses(prev => {
      const updated = [...prev];
      updated[fileIndex] = { ...updated[fileIndex], status: 'uploading', progress: 'Uploading and parsing...' };
      return updated;
    });

    try {
      // Upload file to API route for parsing
      const formData = new FormData();
      formData.append('file', file);

      // Get the current session token for authentication
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      const headers: HeadersInit = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      setFileStatuses(prev => {
        const updated = [...prev];
        updated[fileIndex] = { ...updated[fileIndex], progress: 'Processing log file...' };
        return updated;
      });

      const response = await fetch('/api/parse-flight-log', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || 'Failed to parse flight log';
        
        // Check if it's a duplicate error (409 Conflict)
        if (response.status === 409 && errorData.duplicate) {
          setFileStatuses(prev => {
            const updated = [...prev];
            updated[fileIndex] = { 
              ...updated[fileIndex], 
              status: 'skipped', 
              progress: 'Already uploaded',
              error: 'This flight log has already been uploaded'
            };
            return updated;
          });
          return;
        }
        
        // Format error message for better readability
        let formattedError = errorMessage;
        if (errorMessage.includes('API Key Error') || errorMessage.includes('Unable to fetch keychain')) {
          formattedError = errorMessage.replace(/\n/g, '\n\n');
        }
        
        const errorDetails = errorData.details 
          ? `\n\nDetails: ${typeof errorData.details === 'string' ? errorData.details : JSON.stringify(errorData.details, null, 2)}`
          : '';
        
        throw new Error(formattedError + errorDetails);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to parse flight log');
      }

      // Update status to success
      setFileStatuses(prev => {
        const updated = [...prev];
        updated[fileIndex] = { 
          ...updated[fileIndex], 
          status: 'success', 
          progress: `Successfully parsed ${result.dataPointsCount} data points`,
          dataPointsCount: result.dataPointsCount,
          flightLogId: result.flightLogId,
          flightLog: result.flightLog
        };
        return updated;
      });
    } catch (error) {
      console.error(`Error uploading flight log ${file.name}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload flight log';
      
      setFileStatuses(prev => {
        const updated = [...prev];
        updated[fileIndex] = { 
          ...updated[fileIndex], 
          status: 'error', 
          error: errorMessage 
        };
        return updated;
      });
      
      // Show error for first file, but continue with others
      if (fileIndex === 0) {
        onError?.(`Error uploading ${file.name}: ${errorMessage}`);
      }
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Validate all files first
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach(file => {
      if (file.name.match(/DJIFlightRecord_\d{4}-\d{2}-\d{2}_\[\d{2}-\d{2}-\d{2}\]\.txt$/)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      onError?.(`Invalid file format. Expected DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt. Invalid files: ${invalidFiles.join(', ')}`);
    }

    if (validFiles.length === 0) {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Initialize file statuses
    const initialStatuses: FileUploadStatus[] = validFiles.map(file => ({
      file,
      status: 'pending',
    }));
    setFileStatuses(initialStatuses);
    setUploading(true);

    // Process files in parallel with concurrency limit
    // Each CLI process is independent and uses its own temp directory, so parallel execution is safe
    // This significantly speeds up multi-file uploads (3x faster for 3+ files)
    const CONCURRENT_UPLOADS = 4; // Process 4 files concurrently (CLI tool is CPU-bound, not I/O bound)
    
    const processBatch = async (files: File[], startIndex: number) => {
      const uploadPromises = files.map((file, batchIndex) => {
        const fileIndex = startIndex + batchIndex;
        return uploadSingleFile(file, fileIndex).catch((error) => {
          // Log error but don't throw - let Promise.allSettled handle it
          console.error(`Error uploading ${file.name}:`, error);
          return error;
        });
      });
      
      // Use Promise.allSettled to handle all results, even if some fail
      return Promise.allSettled(uploadPromises);
    };

    // Process files in batches for optimal concurrency
    for (let i = 0; i < validFiles.length; i += CONCURRENT_UPLOADS) {
      const batch = validFiles.slice(i, i + CONCURRENT_UPLOADS);
      await processBatch(batch, i);
      
      // Brief pause between batches to allow server resources to recover
      if (i + CONCURRENT_UPLOADS < validFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Wait a moment for all final state updates
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check final results
    setFileStatuses(current => {
      const finalSuccessCount = current.filter(fs => fs.status === 'success').length;
      const successfulLogs = current
        .filter(fs => fs.status === 'success' && fs.flightLogId && fs.flightLog)
        .map(fs => ({ id: fs.flightLogId!, flightLog: fs.flightLog }));
      
      if (finalSuccessCount > 0) {
        // Store successful logs and show photo folder dialog
        setUploadedFlightLogs(successfulLogs);
        
        // Call onUploadComplete after a brief delay to ensure UI is updated
        setTimeout(() => {
          onUploadComplete?.();
          // Show photo folder dialog
          setShowPhotoFolderDialog(true);
        }, 100);
      }
      
      return current;
    });

    // Reset file input after a delay
    setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setUploading(false);
      // Keep statuses visible for a bit longer, then clear after 5 seconds
      setTimeout(() => {
        setFileStatuses([]);
      }, 5000);
    }, 2000);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    // Create a fake event to reuse the file select handler
    const fakeEvent = {
      target: { files },
    } as React.ChangeEvent<HTMLInputElement>;

    await handleFileSelect(fakeEvent);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  // Recalculate battery stats (can be called independently)
  const recalculateBatteryStats = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.warn('Not authenticated, skipping battery stats recalculation');
        return;
      }

      setPhotoProcessingStatus('Recalculating battery stats...');

      const response = await fetch('/api/recalculate-battery-stats', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
      });

      if (response.ok) {
        setPhotoProcessingStatus('Battery stats updated successfully.');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.warn('Failed to recalculate battery stats:', errorData.error);
        setPhotoProcessingStatus('Battery stats update failed (non-critical).');
      }
    } catch (error) {
      console.error('Error recalculating battery stats:', error);
      setPhotoProcessingStatus('Battery stats update failed (non-critical).');
    }
  };

  // Handle parent folder selection
  const handleSelectPhotoFolder = async () => {
    try {
      // @ts-ignore - File System Access API
      const dirHandle = await window.showDirectoryPicker();
      parentFolderHandleRef.current = dirHandle;
      setShowPhotoFolderDialog(false);
      await processPhotosForUploadedLogs();
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error selecting photo folder:', error);
        alert(`Error selecting folder: ${error.message}`);
      } else {
        // User cancelled - still recalculate battery stats but skip photos
        setShowPhotoFolderDialog(false);
        await handleSkipPhotoProcessing();
      }
    }
  };

  // Handle skipping photo processing (but still do battery stats)
  const handleSkipPhotoProcessing = async () => {
    setProcessingPhotos(true);
    setPhotoProcessingStatus('Skipping photo processing. Recalculating battery stats...');
    await recalculateBatteryStats();
    setProcessingPhotos(false);
    
    setTimeout(() => {
      setShowPhotoFolderDialog(false);
      setPhotoProcessingStatus('');
      setUploadedFlightLogs([]);
    }, 2000);
  };

  // Process photos for all uploaded flight logs
  const processPhotosForUploadedLogs = async () => {
    if (!parentFolderHandleRef.current || uploadedFlightLogs.length === 0) {
      return;
    }

    setProcessingPhotos(true);
    setPhotoProcessingStatus('Processing photos...');

    const { supabase } = await import('@/lib/supabase');
    const { fetchFlightLog } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      alert('Not authenticated');
      setProcessingPhotos(false);
      return;
    }

    let totalPhotosCreated = 0;

    for (const uploaded of uploadedFlightLogs) {
      try {
        setPhotoProcessingStatus(`Processing photos for flight ${uploaded.id}...`);

        // Fetch full flight log with data points
        const fullFlightLog = await fetchFlightLog(uploaded.id);

        // Format date folder
        const folderName = formatFlightDateForFolder(fullFlightLog.flightDate);
        if (!folderName) {
          console.warn(`Skipping flight ${uploaded.id}: no valid flight date`);
          continue;
        }

        // Get date folder
        let dateFolderHandle: FileSystemDirectoryHandle;
        try {
          dateFolderHandle = await parentFolderHandleRef.current.getDirectoryHandle(folderName);
        } catch {
          console.warn(`Date folder ${folderName} not found for flight ${uploaded.id}`);
          continue;
        }

        // Read all image files
        const photoFiles: Array<{ file: File; filename: string }> = [];
        for await (const entry of dateFolderHandle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            const filename = file.name.toLowerCase();
            if (filename.endsWith('.dng') || filename.endsWith('.jpg') || 
                filename.endsWith('.jpeg') || filename.endsWith('.cr2') || 
                filename.endsWith('.nef') || filename.endsWith('.arw')) {
              photoFiles.push({
                file,
                filename: entry.name,
              });
            }
          }
        }

        // Match photos to flight
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
            const metadata = await extractPhotoMetadata(photoFile.file, photoFile.filename, fullFlightLog);
            if (metadata) {
              matchedPhotos.push({
                file: photoFile.file,
                filename: photoFile.filename,
                photoDate: metadata.photoDate,
                lat: metadata.lat,
                lng: metadata.lng,
                altitudeM: metadata.altitudeM,
                timestampOffsetMs: metadata.timestampOffsetMs,
              });
            }
          } catch (error) {
            console.error(`Error processing photo ${photoFile.filename}:`, error);
          }
        }

        // Create photo records
        let photosCreated = 0;
        for (const photo of matchedPhotos) {
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
              }
            } catch (error) {
              console.warn(`Failed to generate thumbnail for ${photo.filename}:`, error);
            }

            // Create data point
            const { error: insertError } = await supabase
              .from('flight_log_data_points')
              .insert({
                flight_log_id: fullFlightLog.id,
                timestamp_offset_ms: photo.timestampOffsetMs,
                lat: photo.lat,
                lng: photo.lng,
                altitude_m: photo.altitudeM || null,
                is_photo: true,
                photo_filename: photo.filename,
                thumbnail_url: thumbnailUrl || null,
                original_file_url: photo.filename,
              });

            if (!insertError) {
              photosCreated++;
            } else {
              console.error(`Failed to create photo record for ${photo.filename}:`, insertError);
            }
          } catch (error) {
            console.error(`Exception creating photo record for ${photo.filename}:`, error);
          }
        }

        // Update folder path in flight log metadata
        if (photosCreated > 0) {
          await supabase
            .from('flight_logs')
            .update({
              metadata: {
                ...fullFlightLog.metadata,
                photo_folder_path: folderName,
              },
            })
            .eq('id', fullFlightLog.id);
        }

        totalPhotosCreated += photosCreated;
        setPhotoProcessingStatus(`Created ${photosCreated} photos for flight ${uploaded.id} (${totalPhotosCreated} total)`);
      } catch (error) {
        console.error(`Error processing photos for flight ${uploaded.id}:`, error);
        setPhotoProcessingStatus(`Error processing flight ${uploaded.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Recalculate battery stats after photo processing
    setPhotoProcessingStatus(`Created ${totalPhotosCreated} photos total. Recalculating battery stats...`);
    await recalculateBatteryStats();
    
    setProcessingPhotos(false);
    setPhotoProcessingStatus(`Completed! Created ${totalPhotosCreated} photos and updated battery stats.`);
    
    // Close dialog after a short delay
    setTimeout(() => {
      setShowPhotoFolderDialog(false);
      setPhotoProcessingStatus('');
      setUploadedFlightLogs([]);
    }, 3000);
  };

  return (
    <div className="w-full">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          uploading
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          multiple
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="flight-log-upload"
        />
        <label
          htmlFor="flight-log-upload"
          className={`cursor-pointer ${uploading ? 'pointer-events-none opacity-50' : ''}`}
        >
          <div className="flex flex-col items-center space-y-4">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div>
              <p className="text-lg font-medium text-gray-700">
                {uploading ? 'Processing...' : 'Upload DJI Flight Log'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {uploading
                  ? `Processing ${fileStatuses.filter(fs => fs.status !== 'success' && fs.status !== 'error' && fs.status !== 'skipped').length} file(s)...`
                  : 'Click to select or drag and drop .txt file(s) from your RC2 controller'}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Expected format: DJIFlightRecord_YYYY-MM-DD_[HH-MM-SS].txt (multiple files supported)
              </p>
            </div>
          </div>
        </label>
      </div>
      {fileStatuses.length > 0 && (
        <div className="mt-4 space-y-2">
          {fileStatuses.map((fileStatus, index) => (
            <div
              key={index}
              className={`p-3 rounded border ${
                fileStatus.status === 'success'
                  ? 'bg-green-50 border-green-200'
                  : fileStatus.status === 'error'
                  ? 'bg-red-50 border-red-200'
                  : fileStatus.status === 'skipped'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fileStatus.file.name}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    {fileStatus.status === 'pending' && 'Waiting...'}
                    {fileStatus.status === 'checking' && fileStatus.progress}
                    {fileStatus.status === 'uploading' && fileStatus.progress}
                    {fileStatus.status === 'success' && fileStatus.progress}
                    {fileStatus.status === 'error' && `Error: ${fileStatus.error}`}
                    {fileStatus.status === 'skipped' && fileStatus.error}
                  </p>
                </div>
                <div className="ml-4">
                  {fileStatus.status === 'pending' && (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {fileStatus.status === 'checking' && (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {fileStatus.status === 'uploading' && (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {fileStatus.status === 'success' && (
                    <span className="text-green-600 text-lg">✓</span>
                  )}
                  {fileStatus.status === 'error' && (
                    <span className="text-red-600 text-lg">✗</span>
                  )}
                  {fileStatus.status === 'skipped' && (
                    <span className="text-yellow-600 text-lg">⊘</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Folder Selection Dialog */}
      {showPhotoFolderDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-2xl font-bold mb-4">Process Photos</h2>
            <p className="text-gray-600 mb-4">
              {uploadedFlightLogs.length === 1
                ? 'Select the parent folder containing date-based photo folders (YYYY_MM_DD format). Photos will be matched to the uploaded flight by date and timestamp.'
                : `Select the parent folder containing date-based photo folders (YYYY_MM_DD format). Photos will be matched to ${uploadedFlightLogs.length} uploaded flights by date and timestamp.`}
            </p>
            
            {processingPhotos && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-900">{photoProcessingStatus}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSelectPhotoFolder}
                disabled={processingPhotos}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingPhotos ? 'Processing...' : 'Select Parent Folder'}
              </button>
              <button
                onClick={handleSkipPhotoProcessing}
                disabled={processingPhotos}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Skip Photos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

