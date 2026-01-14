'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { FlightLog, fetchFlightLog, deleteFlightLog, getAdjacentFlightLogIds, createMissionFromFlightLog } from '@/lib/supabase';
import FlightLogViewer from '@/components/FlightLogViewer';
import OrthomosaicProcessor from '@/components/OrthomosaicProcessor';
import Link from 'next/link';

// Component to fetch and display original photo with authentication
// For local files, prompts user to select folder
function OriginalPhotoViewer({ dataPointId, fallbackThumbnail, onClose, originalFileUrl, flightLog }: { 
  dataPointId: string; 
  fallbackThumbnail: string | null; 
  onClose: () => void;
  originalFileUrl?: string | null;
  flightLog?: FlightLog;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(fallbackThumbnail);
  const [loading, setLoading] = useState(true);
  const [needsFolderSelection, setNeedsFolderSelection] = useState(false);

  useEffect(() => {
    const loadOriginalPhoto = async () => {
      // If originalFileUrl exists and is not a URL, it's a local file - we need folder selection
      if (originalFileUrl && !originalFileUrl.startsWith('http') && !originalFileUrl.startsWith('/')) {
        setNeedsFolderSelection(true);
        setLoading(false);
        return;
      }

      // Otherwise, try to load from API (legacy Supabase Storage URLs)
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setImageUrl(fallbackThumbnail);
          setLoading(false);
          return;
        }

        const response = await fetch(`/api/serve-original-photo?dataPointId=${dataPointId}`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setImageUrl(url);
        } else {
          console.warn('Failed to load original photo, using thumbnail');
          setImageUrl(fallbackThumbnail);
        }
      } catch (error) {
        console.error('Error loading original photo:', error);
        setImageUrl(fallbackThumbnail);
      } finally {
        setLoading(false);
      }
    };

    loadOriginalPhoto();

    // Cleanup: revoke object URL when component unmounts
    return () => {
      if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [dataPointId, fallbackThumbnail, originalFileUrl]);

  const handleSelectFolder = async () => {
    try {
      // @ts-ignore - File System Access API
      const dirHandle = await window.showDirectoryPicker();
      
      // Find the file in the selected folder
      const filename = originalFileUrl || '';
      const fileHandle = await dirHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      
      // Create object URL from file
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setNeedsFolderSelection(false);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error selecting folder:', error);
        alert(`Error reading file: ${error.message}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (needsFolderSelection) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: '400px', maxWidth: '1200px' }}>
        <p className="text-white mb-4 text-center">
          This photo is stored locally. Please select the photo folder to view it.
        </p>
        {fallbackThumbnail && (
          <img 
            src={fallbackThumbnail} 
            alt="Thumbnail preview"
            className="mb-4 rounded-lg"
            style={{ 
              maxWidth: '1200px', 
              maxHeight: '80vh', 
              width: 'auto',
              height: 'auto',
              objectFit: 'contain' 
            }}
          />
        )}
        <button
          onClick={handleSelectFolder}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Select Photo Folder
        </button>
        <p className="text-white text-sm mt-2 text-center">
          File: {originalFileUrl}
        </p>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
        <div className="text-white">No image available</div>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt="Original photo"
      className="rounded-lg"
      style={{ 
        maxWidth: '95vw', 
        maxHeight: '95vh', 
        width: 'auto',
        height: 'auto',
        objectFit: 'contain'
      }}
      onClick={(e) => e.stopPropagation()}
      onError={(e) => {
        console.error('Failed to load photo');
        if (imageUrl !== fallbackThumbnail && fallbackThumbnail) {
          setImageUrl(fallbackThumbnail);
        } else {
          onClose();
        }
      }}
    />
  );
}

export default function FlightLogDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const [flightLog, setFlightLog] = useState<FlightLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isBatteryHealthExpanded, setIsBatteryHealthExpanded] = useState(false);
  const [isWarningsErrorsExpanded, setIsWarningsErrorsExpanded] = useState(false);
  const [isDetailedStatsExpanded, setIsDetailedStatsExpanded] = useState(false);
  const [previousLogId, setPreviousLogId] = useState<string | null>(null);
  const [nextLogId, setNextLogId] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [batteryLabel, setBatteryLabel] = useState<string | null>(null);
  const [creatingMission, setCreatingMission] = useState(false);
  const [showMissionSettings, setShowMissionSettings] = useState(false);
  const [missionSettings, setMissionSettings] = useState({
    maxWaypoints: 150,
    minDistanceM: 25,
  });
  const loadedLogIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        const currentLogId = params.id as string;
        // Only load if the log ID has changed
        if (currentLogId !== loadedLogIdRef.current) {
          loadFlightLog();
        }
      }
    }
  }, [user, authLoading, router, params.id]);

  // Handle ESC key to close photo modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedPhotoIndex !== null) {
        setSelectedPhotoIndex(null);
      }
    };

    if (selectedPhotoIndex !== null) {
      window.addEventListener('keydown', handleEscKey);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleEscKey);
      document.body.style.overflow = 'unset';
    };
  }, [selectedPhotoIndex]);

  const loadFlightLog = async () => {
    try {
      const currentLogId = params.id as string;
      setLoading(true);
      const data = await fetchFlightLog(currentLogId);
      setFlightLog(data);
      loadedLogIdRef.current = currentLogId;
      
      // Load adjacent log IDs for navigation
      const { previousId, nextId } = await getAdjacentFlightLogIds(currentLogId);
      setPreviousLogId(previousId);
      setNextLogId(nextId);
      
      // Fetch battery label if battery serial number exists
      if (data.metadata?.batterySerialNumber) {
        try {
          const { supabase } = await import('@/lib/supabase');
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: labelData, error: labelError } = await supabase
              .from('battery_labels')
              .select('label')
              .eq('owner_id', user.id)
              .eq('battery_serial_number', String(data.metadata.batterySerialNumber))
              .single();
            
            if (!labelError && labelData) {
              setBatteryLabel(labelData.label);
            } else {
              setBatteryLabel(null);
            }
          }
        } catch (labelErr) {
          console.error('Failed to fetch battery label:', labelErr);
          setBatteryLabel(null);
        }
      } else {
        setBatteryLabel(null);
      }
    } catch (error) {
      console.error('Failed to load flight log:', error);
      alert('Failed to load flight log');
      router.push('/logs');
    } finally {
      setLoading(false);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle arrow keys if not typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && previousLogId) {
        e.preventDefault();
        router.push(`/logs/${previousLogId}`);
      } else if (e.key === 'ArrowRight' && nextLogId) {
        e.preventDefault();
        router.push(`/logs/${nextLogId}`);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [previousLogId, nextLogId, router]);

  const handleDelete = async () => {
    if (!flightLog) return;
    if (!confirm('Are you sure you want to delete this flight log?')) return;

    try {
      await deleteFlightLog(flightLog.id);
      router.push('/logs');
    } catch (error) {
      console.error('Failed to delete flight log:', error);
      alert('Failed to delete flight log');
    }
  };

  const handleCreateMission = async () => {
    if (!flightLog) return;
    
    if (!flightLog.dataPoints || flightLog.dataPoints.length === 0) {
      alert('This flight log has no GPS data points. Cannot create a mission.');
      return;
    }

    // Validate settings
    if (missionSettings.maxWaypoints < 1 || missionSettings.maxWaypoints > 1000) {
      alert('Maximum waypoints must be between 1 and 1000');
      return;
    }
    if (missionSettings.minDistanceM < 1 || missionSettings.minDistanceM > 1000) {
      alert('Minimum distance must be between 1 and 1000 meters');
      return;
    }

    const missionName = prompt('Enter a name for the mission:', `Mission from ${flightLog.filename}`);
    if (!missionName) return; // User cancelled

    setCreatingMission(true);
    try {
      const mission = await createMissionFromFlightLog(flightLog, missionName, {
        maxWaypoints: missionSettings.maxWaypoints,
        minDistanceM: missionSettings.minDistanceM,
        includeAllPhotos: true,
        includeVideoActions: true,
        includeDirectionChanges: true,
        directionChangeThreshold: 30,
      });
      router.push(`/missions/${mission.id}`);
    } catch (error) {
      console.error('Failed to create mission:', error);
      alert(`Failed to create mission: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCreatingMission(false);
    }
  };

  const handleSignOut = async () => {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
    router.push('/login');
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
        </div>
      </div>
    );
  }

  if (!flightLog) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold">{flightLog.filename}</h1>
            <div className="flex gap-4 items-center">
              <Link
                href="/missions"
                className="text-gray-600 hover:text-gray-800"
              >
                Missions
              </Link>
              <Link
                href="/logs"
                className="text-gray-600 hover:text-gray-800"
              >
                Flight Logs
              </Link>
              <Link
                href="/photos"
                className="text-gray-600 hover:text-gray-800"
              >
                Photo Search
              </Link>
              <Link
                href="/batteries"
                className="text-gray-600 hover:text-gray-800"
              >
                Batteries
              </Link>
              <Link
                href="/fleet"
                className="text-gray-600 hover:text-gray-800"
              >
                Fleet
              </Link>
              <button
                onClick={handleDelete}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-800"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Flight Statistics */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 pb-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Flight Statistics</h2>
              <div className="flex gap-2">
                {flightLog.dataPoints && flightLog.dataPoints.length > 0 && (
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setShowMissionSettings(!showMissionSettings)}
                      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                      title="Configure mission creation settings"
                    >
                      ⚙️ Settings
                    </button>
                    <button
                      onClick={handleCreateMission}
                      disabled={creatingMission}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Create a mission from this flight log to replay the exact path"
                    >
                      {creatingMission ? 'Creating Mission...' : 'Create Mission from Flight'}
                    </button>
                  </div>
                )}
                {flightLog.dataPoints && flightLog.dataPoints.filter(dp => dp.isPhoto && dp.originalFileUrl).length > 0 && (
                  <OrthomosaicProcessor 
                    flightLog={flightLog}
                    onComplete={() => {
                      // Optionally refresh or navigate
                    }}
                  />
                )}
              </div>
            </div>
            {/* Mission Creation Settings */}
            {showMissionSettings && flightLog.dataPoints && flightLog.dataPoints.length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 text-gray-800">Mission Creation Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maximum Waypoints
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={missionSettings.maxWaypoints}
                      onChange={(e) => setMissionSettings({
                        ...missionSettings,
                        maxWaypoints: parseInt(e.target.value) || 150
                      })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum number of waypoints in the mission (1-1000). Action points (photos, video) are always included.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Distance Between Waypoints (meters)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      step="1"
                      value={missionSettings.minDistanceM}
                      onChange={(e) => setMissionSettings({
                        ...missionSettings,
                        minDistanceM: parseFloat(e.target.value) || 25
                      })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Minimum distance in meters between waypoints (1-1000). Larger values create fewer waypoints.
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-sm text-gray-600">
                  <p className="font-medium">Note:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Photo points and video start/stop points are always included regardless of distance</li>
                    <li>Points with significant direction changes (30°+) are included</li>
                    <li>Start and end points are always included</li>
                    <li>Current settings will create approximately {Math.min(
                      Math.ceil((flightLog.totalDistanceM || 0) / missionSettings.minDistanceM) + 
                      (flightLog.dataPoints?.filter(dp => dp.isPhoto).length || 0) + 2,
                      missionSettings.maxWaypoints
                    )} waypoints</li>
                  </ul>
                </div>
              </div>
            )}
            {/* Top line with key stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500">Flight Date</div>
                <div className="text-lg font-semibold">{formatDate(flightLog.flightDate)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Duration</div>
                <div className="text-lg font-semibold">{formatDuration(flightLog.durationSeconds)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Total Distance</div>
                <div className="text-lg font-semibold">
                  {flightLog.totalDistanceM
                    ? flightLog.totalDistanceM > 1000
                      ? `${(flightLog.totalDistanceM / 1000).toFixed(2)} km`
                      : `${Math.round(flightLog.totalDistanceM)}m`
                    : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Photos Taken</div>
                <div className="text-lg font-semibold">
                  {flightLog.dataPoints?.filter(dp => dp.isPhoto === true).length || 0}
                </div>
              </div>
            </div>
          </div>
          
          {/* Detailed stats collapsible panel */}
          <div className="border-t border-gray-200">
            <button
              onClick={() => setIsDetailedStatsExpanded(!isDetailedStatsExpanded)}
              className="w-full px-6 py-3 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-700">Detailed Statistics</span>
              <svg
                className={`w-5 h-5 transition-transform ${isDetailedStatsExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isDetailedStatsExpanded && (
              <div className="px-6 pb-6 pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Max Altitude</div>
                    <div className="text-lg font-semibold">
                      {flightLog.maxAltitudeM ? `${Math.round(flightLog.maxAltitudeM)}m` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Max Speed</div>
                    <div className="text-lg font-semibold">
                      {flightLog.maxSpeedMps ? `${Math.round(flightLog.maxSpeedMps * 3.6)} km/h` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Max Distance from Home</div>
                    <div className="text-lg font-semibold">
                      {flightLog.maxDistanceM
                        ? flightLog.maxDistanceM > 1000
                          ? `${(flightLog.maxDistanceM / 1000).toFixed(2)} km`
                          : `${Math.round(flightLog.maxDistanceM)}m`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Battery Start</div>
                    <div className="text-lg font-semibold">
                      {flightLog.batteryStartPercent ? `${Math.round(flightLog.batteryStartPercent)}%` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Battery End</div>
                    <div className="text-lg font-semibold">
                      {flightLog.batteryEndPercent ? `${Math.round(flightLog.batteryEndPercent)}%` : 'N/A'}
                    </div>
                  </div>
                  {flightLog.batteryStartPercent && flightLog.batteryEndPercent && (
                    <div>
                      <div className="text-sm text-gray-500">Battery Used</div>
                      <div className="text-lg font-semibold">
                        {Math.round(flightLog.batteryStartPercent - flightLog.batteryEndPercent)}%
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-gray-500">Average Speed</div>
                    <div className="text-lg font-semibold">
                      {flightLog.dataPoints && flightLog.durationSeconds && flightLog.totalDistanceM
                        ? `${Math.round((flightLog.totalDistanceM / flightLog.durationSeconds) * 3.6)} km/h`
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Average Altitude</div>
                    <div className="text-lg font-semibold">
                      {(() => {
                        const validAltitudes = flightLog.dataPoints?.filter(dp => dp.altitudeM !== undefined && dp.altitudeM > 0).map(dp => dp.altitudeM!) || [];
                        const avgAlt = validAltitudes.length > 0 
                          ? validAltitudes.reduce((sum, alt) => sum + alt, 0) / validAltitudes.length 
                          : null;
                        return avgAlt ? `${Math.round(avgAlt)}m` : 'N/A';
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Videos Recorded</div>
                    <div className="text-lg font-semibold">
                      {flightLog.dataPoints?.filter(dp => dp.isVideoRecording === true).length || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Data Points</div>
                    <div className="text-lg font-semibold">
                      {flightLog.dataPoints?.length || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Avg Satellite Count</div>
                    <div className="text-lg font-semibold">
                      {(() => {
                        const validSatellites = flightLog.dataPoints?.filter(dp => dp.satelliteCount !== undefined).map(dp => dp.satelliteCount!) || [];
                        const avgSat = validSatellites.length > 0 
                          ? Math.round(validSatellites.reduce((sum, sat) => sum + sat, 0) / validSatellites.length)
                          : null;
                        return avgSat !== null ? avgSat : 'N/A';
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Drone Model</div>
                    <div className="text-lg font-semibold">{flightLog.droneModel || 'N/A'}</div>
                  </div>
                  {batteryLabel && (
                    <div>
                      <div className="text-sm text-gray-500">Battery</div>
                      <div className="text-lg font-semibold">
                        {batteryLabel}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Battery Health Information */}
        {flightLog.dataPoints && flightLog.dataPoints.length > 0 && (() => {
          const batteryDataPoints = flightLog.dataPoints.filter(dp => 
            dp.batteryVoltage !== undefined || 
            dp.batteryTemperature !== undefined ||
            dp.batteryCurrent !== undefined ||
            dp.batteryCellVoltages !== undefined
          );
          
          if (batteryDataPoints.length === 0) return null;
          
          const voltages = batteryDataPoints.map(dp => dp.batteryVoltage).filter((v): v is number => v !== undefined);
          const currents = batteryDataPoints.map(dp => dp.batteryCurrent).filter((v): v is number => v !== undefined);
          const temperatures = batteryDataPoints.map(dp => dp.batteryTemperature).filter((v): v is number => v !== undefined);
          const minTemps = batteryDataPoints.map(dp => dp.batteryMinTemperature).filter((v): v is number => v !== undefined);
          const maxTemps = batteryDataPoints.map(dp => dp.batteryMaxTemperature).filter((v): v is number => v !== undefined);
          const cellVoltages = batteryDataPoints
            .map(dp => dp.batteryCellVoltages)
            .filter((v): v is number[] => Array.isArray(v) && v.length > 0);
          const deviations = batteryDataPoints.map(dp => dp.batteryCellVoltageDeviation).filter((v): v is number => v !== undefined);
          const capacities = batteryDataPoints.map(dp => dp.batteryFullCapacity).filter((v): v is number => v !== undefined);
          
          const avgVoltage = voltages.length > 0 ? voltages.reduce((a, b) => a + b, 0) / voltages.length : null;
          const minVoltage = voltages.length > 0 ? Math.min(...voltages) : null;
          const maxVoltage = voltages.length > 0 ? Math.max(...voltages) : null;
          const avgCurrent = currents.length > 0 ? currents.reduce((a, b) => a + b, 0) / currents.length : null;
          const maxCurrent = currents.length > 0 ? Math.max(...currents) : null;
          const avgTemp = temperatures.length > 0 ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : null;
          const minTemp = temperatures.length > 0 ? Math.min(...temperatures) : null;
          const maxTemp = temperatures.length > 0 ? Math.max(...temperatures) : null;
          const minTempRecorded = minTemps.length > 0 ? Math.min(...minTemps) : null;
          const maxTempRecorded = maxTemps.length > 0 ? Math.max(...maxTemps) : null;
          const avgDeviation = deviations.length > 0 ? deviations.reduce((a, b) => a + b, 0) / deviations.length : null;
          const maxDeviation = deviations.length > 0 ? Math.max(...deviations) : null;
          const fullCapacity = capacities.length > 0 ? capacities[0] : null; // Should be constant per battery
          
          // Calculate cell health - average cell voltages
          const cellHealth: { cellNum: number; avgVoltage: number; minVoltage: number; maxVoltage: number }[] = [];
          if (cellVoltages.length > 0) {
            const maxCells = Math.max(...cellVoltages.map(cv => cv.length));
            for (let i = 0; i < maxCells; i++) {
              const cellReadings = cellVoltages.map(cv => cv[i]).filter((v): v is number => v !== undefined && v > 0);
              if (cellReadings.length > 0) {
                cellHealth.push({
                  cellNum: i + 1,
                  avgVoltage: cellReadings.reduce((a, b) => a + b, 0) / cellReadings.length,
                  minVoltage: Math.min(...cellReadings),
                  maxVoltage: Math.max(...cellReadings),
                });
              }
            }
          }
          
          return (
            <div className="bg-white rounded-lg shadow mb-6">
              <button
                onClick={() => setIsBatteryHealthExpanded(!isBatteryHealthExpanded)}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <h2 className="text-2xl font-bold">Battery Health</h2>
                <svg
                  className={`w-5 h-5 transition-transform ${isBatteryHealthExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isBatteryHealthExpanded && (
                <div className="px-6 pb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {avgVoltage !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Avg Voltage</div>
                    <div className="text-lg font-semibold">{avgVoltage.toFixed(2)}V</div>
                  </div>
                )}
                {minVoltage !== null && maxVoltage !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Voltage Range</div>
                    <div className="text-lg font-semibold">{minVoltage.toFixed(2)}V - {maxVoltage.toFixed(2)}V</div>
                  </div>
                )}
                {avgCurrent !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Avg Current</div>
                    <div className="text-lg font-semibold">{avgCurrent.toFixed(2)}A</div>
                  </div>
                )}
                {maxCurrent !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Max Current</div>
                    <div className="text-lg font-semibold">{maxCurrent.toFixed(2)}A</div>
                  </div>
                )}
                {avgTemp !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Avg Temperature</div>
                    <div className="text-lg font-semibold">{avgTemp.toFixed(1)}°C</div>
                  </div>
                )}
                {(minTemp !== null || minTempRecorded !== null) && (maxTemp !== null || maxTempRecorded !== null) && (
                  <div>
                    <div className="text-sm text-gray-500">Temp Range</div>
                    <div className="text-lg font-semibold">
                      {(minTempRecorded ?? minTemp)?.toFixed(1)}°C - {(maxTempRecorded ?? maxTemp)?.toFixed(1)}°C
                    </div>
                  </div>
                )}
                {avgDeviation !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Avg Cell Deviation</div>
                    <div className="text-lg font-semibold">{avgDeviation.toFixed(3)}V</div>
                  </div>
                )}
                {maxDeviation !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Max Cell Deviation</div>
                    <div className="text-lg font-semibold">{maxDeviation.toFixed(3)}V</div>
                  </div>
                )}
                {fullCapacity !== null && (
                  <div>
                    <div className="text-sm text-gray-500">Full Capacity</div>
                    <div className="text-lg font-semibold">{fullCapacity}mAh</div>
                  </div>
                )}
              </div>
              
              {cellHealth.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Cell Health</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {cellHealth.map((cell) => (
                      <div key={cell.cellNum} className="border rounded p-3">
                        <div className="text-sm font-semibold text-gray-700 mb-2">Cell {cell.cellNum}</div>
                        <div className="text-xs text-gray-600">
                          <div>Avg: {cell.avgVoltage.toFixed(3)}V</div>
                          <div>Range: {cell.minVoltage.toFixed(3)}V - {cell.maxVoltage.toFixed(3)}V</div>
                          <div className={`mt-1 ${cell.maxVoltage - cell.minVoltage > 0.1 ? 'text-yellow-600' : 'text-green-600'}`}>
                            {(cell.maxVoltage - cell.minVoltage).toFixed(3)}V spread
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Warnings and Errors */}
        {(flightLog.warnings && flightLog.warnings.length > 0) || (flightLog.errors && flightLog.errors.length > 0) ? (
          <div className="bg-white rounded-lg shadow mb-6">
            <button
              onClick={() => setIsWarningsErrorsExpanded(!isWarningsErrorsExpanded)}
              className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <h2 className="text-2xl font-bold">Flight Warnings & Errors</h2>
              <svg
                className={`w-5 h-5 transition-transform ${isWarningsErrorsExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isWarningsErrorsExpanded && (
              <div className="px-6 pb-6">
            
            {(() => {
              // Group errors by category
              const errorGroups = new Map<string, typeof flightLog.errors>();
              if (flightLog.errors) {
                flightLog.errors.forEach(error => {
                  const category = error.category || 'Other';
                  if (!errorGroups.has(category)) {
                    errorGroups.set(category, []);
                  }
                  errorGroups.get(category)!.push(error);
                });
              }

              // Group warnings by category
              const warningGroups = new Map<string, typeof flightLog.warnings>();
              if (flightLog.warnings) {
                flightLog.warnings.forEach(warning => {
                  const category = warning.category || 'Other';
                  if (!warningGroups.has(category)) {
                    warningGroups.set(category, []);
                  }
                  warningGroups.get(category)!.push(warning);
                });
              }

              const toggleCategory = (categoryKey: string) => {
                setExpandedCategories(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(categoryKey)) {
                    newSet.delete(categoryKey);
                  } else {
                    newSet.add(categoryKey);
                  }
                  return newSet;
                });
              };

              return (
                <>
                  {errorGroups.size > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-red-600 mb-3 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        Errors ({flightLog.errors?.length || 0})
                      </h3>
                      <div className="space-y-2">
                        {Array.from(errorGroups.entries()).map(([category, errors]) => {
                          const categoryKey = `error-${category}`;
                          const isExpanded = expandedCategories.has(categoryKey);
                          return (
                            <div key={categoryKey} className="border border-red-200 rounded overflow-hidden">
                              <button
                                onClick={() => toggleCategory(categoryKey)}
                                className="w-full bg-red-50 px-4 py-2 text-left flex items-center justify-between hover:bg-red-100 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-red-800 capitalize">{category}</span>
                                  <span className="text-sm text-red-600">({errors?.length || 0})</span>
                                </div>
                                <svg
                                  className={`w-5 h-5 text-red-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {isExpanded && (
                                <div className="p-3 space-y-2 bg-white">
                                  {errors?.map((error, idx) => (
                                    <div key={error.id || idx} className="bg-red-50 border border-red-200 rounded p-3">
                                      <div className="flex justify-between items-start mb-1">
                                        <span className="font-medium text-red-800">{error.message}</span>
                                        {error.timestampOffsetMs !== undefined && (
                                          <span className="text-xs text-red-600">
                                            {formatDuration(error.timestampOffsetMs / 1000)}
                                          </span>
                                        )}
                                      </div>
                                      {error.details && Object.keys(error.details).length > 0 && (
                                        <details className="mt-2">
                                          <summary className="text-xs text-red-600 cursor-pointer">Details</summary>
                                          <pre className="mt-1 text-xs bg-red-100 p-2 rounded overflow-auto">
                                            {JSON.stringify(error.details, null, 2)}
                                          </pre>
                                        </details>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {warningGroups.size > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-yellow-600 mb-3 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Warnings ({flightLog.warnings?.length || 0})
                      </h3>
                      <div className="space-y-2">
                        {Array.from(warningGroups.entries()).map(([category, warnings]) => {
                          const categoryKey = `warning-${category}`;
                          const isExpanded = expandedCategories.has(categoryKey);
                          return (
                            <div key={categoryKey} className="border border-yellow-200 rounded overflow-hidden">
                              <button
                                onClick={() => toggleCategory(categoryKey)}
                                className="w-full bg-yellow-50 px-4 py-2 text-left flex items-center justify-between hover:bg-yellow-100 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-yellow-800 capitalize">{category}</span>
                                  <span className="text-sm text-yellow-600">({warnings?.length || 0})</span>
                                </div>
                                <svg
                                  className={`w-5 h-5 text-yellow-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {isExpanded && (
                                <div className="p-3 space-y-2 bg-white">
                                  {warnings?.map((warning, idx) => (
                                    <div key={warning.id || idx} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                                      <div className="flex justify-between items-start mb-1">
                                        <span className="font-medium text-yellow-800">{warning.message}</span>
                                        {warning.timestampOffsetMs !== undefined && (
                                          <span className="text-xs text-yellow-600">
                                            {formatDuration(warning.timestampOffsetMs / 1000)}
                                          </span>
                                        )}
                                      </div>
                                      {warning.details && Object.keys(warning.details).length > 0 && (
                                        <details className="mt-2">
                                          <summary className="text-xs text-yellow-600 cursor-pointer">Details</summary>
                                          <pre className="mt-1 text-xs bg-yellow-100 p-2 rounded overflow-auto">
                                            {JSON.stringify(warning.details, null, 2)}
                                          </pre>
                                        </details>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
              </div>
            )}
          </div>
        ) : null}

        {/* Flight Path Map */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Flight Path</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => previousLogId && router.push(`/logs/${previousLogId}`)}
                disabled={!previousLogId}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Previous log (← Arrow)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => nextLogId && router.push(`/logs/${nextLogId}`)}
                disabled={!nextLogId}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Next log (→ Arrow)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
          <FlightLogViewer flightLog={flightLog} />
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
            {flightLog.homeLocation && (
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-blue-500 rounded-full inline-block"></span>
                <span>Home Point</span>
              </div>
            )}
            {flightLog.startLocation && (
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-green-500 rounded-full inline-block"></span>
                <span>Start</span>
              </div>
            )}
            {flightLog.endLocation && (
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-red-500 rounded-full inline-block"></span>
                <span>End</span>
              </div>
            )}
            {flightLog.dataPoints && flightLog.dataPoints.filter(dp => dp.isPhoto === true).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-lg">📷</span>
                <span>Photo Location</span>
              </div>
            )}
          </div>
        </div>

        {/* Photos Gallery */}
        {flightLog.dataPoints && flightLog.dataPoints.filter(dp => dp.isPhoto === true).length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              Photos Taken ({flightLog.dataPoints?.filter(dp => dp.isPhoto === true).length || 0})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {flightLog.dataPoints
                ?.filter(dp => dp.isPhoto === true && dp.lat !== undefined && dp.lng !== undefined)
                .map((photo, index) => {
                  // Find the index of this photo in the filtered photos array for modal
                  const photoIndex = flightLog.dataPoints
                    ?.filter(dp => dp.isPhoto === true && dp.lat !== undefined && dp.lng !== undefined)
                    .findIndex(dp => dp.timestampOffsetMs === photo.timestampOffsetMs) ?? -1;
                  
                  return (
                    <div
                      key={`photo-${index}-${photo.timestampOffsetMs}`}
                      className="group relative bg-gray-50 rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-200 hover:border-blue-300"
                      onClick={() => {
                        if (photoIndex !== -1) {
                          setSelectedPhotoIndex(photoIndex);
                        }
                      }}
                    >
                      {/* Thumbnail */}
                      {photo.thumbnailUrl ? (
                        <div className="aspect-square bg-gray-100 overflow-hidden">
                          <img 
                            src={photo.thumbnailUrl} 
                            alt={`Photo ${index + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => {
                              // Show placeholder if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              if (target.parentElement) {
                                target.parentElement.innerHTML = `
                                  <div class="w-full h-full flex items-center justify-center text-gray-400">
                                    <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                `;
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="aspect-square bg-gray-200 flex items-center justify-center text-gray-400">
                          <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      
                      {/* Overlay with photo info */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end">
                        <div className="p-3 text-white w-full">
                          <div className="font-semibold text-sm mb-1">Photo {index + 1}</div>
                          {photo.altitudeM !== undefined && (
                            <div className="text-xs text-gray-200">
                              {Math.round(photo.altitudeM)}m • {formatDuration((photo.timestampOffsetMs || 0) / 1000)}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Bottom info bar */}
                      <div className="p-3">
                        <div className="text-xs font-semibold text-gray-700 mb-1 truncate">
                          {photo.photoFilename || `Photo ${index + 1}`}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {photo.altitudeM !== undefined && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                              </svg>
                              {Math.round(photo.altitudeM)}m
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatDuration((photo.timestampOffsetMs || 0) / 1000)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

      </main>

      {/* Photo Lightbox Modal */}
      {selectedPhotoIndex !== null && (() => {
        const photosWithGPS = flightLog.dataPoints
          .filter(dp => dp.isPhoto === true && dp.lat !== undefined && dp.lng !== undefined);
        const selectedPhoto = photosWithGPS[selectedPhotoIndex];
        
        if (!selectedPhoto) return null;

        // Determine image source: use original file if available, otherwise fall back to thumbnail
        // For original files, use the serve API endpoint (handles DNG conversion)
        // For thumbnails, use the URL directly
        const useOriginalFile = !!selectedPhoto.originalFileUrl && !!selectedPhoto.id;
        const imageSrc = useOriginalFile
          ? `/api/serve-original-photo?dataPointId=${selectedPhoto.id}`
          : selectedPhoto.thumbnailUrl || null;

        if (!imageSrc) return null;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
            onClick={() => setSelectedPhotoIndex(null)}
            tabIndex={-1}
          >
            <div className="relative max-w-7xl max-h-full">
              <button
                onClick={() => setSelectedPhotoIndex(null)}
                className="absolute top-2 right-2 text-white bg-black bg-opacity-50 hover:bg-opacity-75 rounded-full p-2 transition-opacity z-10"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {/* For original files served via API, we can't use img src directly with auth
                  Instead, fetch with credentials and create object URL */}
              {useOriginalFile ? (
                <OriginalPhotoViewer
                  dataPointId={selectedPhoto.id!}
                  fallbackThumbnail={selectedPhoto.thumbnailUrl || null}
                  onClose={() => setSelectedPhotoIndex(null)}
                  originalFileUrl={selectedPhoto.originalFileUrl}
                  flightLog={flightLog}
                />
              ) : (
                <img
                  src={imageSrc}
                  alt="Full size photo"
                  className="rounded-lg"
                  style={{ 
                    maxWidth: '95vw', 
                    maxHeight: '95vh', 
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain'
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onError={(e) => {
                    console.error('Failed to load photo');
                    setSelectedPhotoIndex(null);
                  }}
                />
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

