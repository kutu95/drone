'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { Marker, Polyline } from '@react-google-maps/api';
import Link from 'next/link';
import { GOOGLE_MAPS_LOADER_CONFIG } from '@/lib/google-maps-config';

const VIDEO_PARENT_IDB_NAME = 'bulk-photo-regen';
const VIDEO_PARENT_IDB_STORE = 'settings';
const VIDEO_PARENT_FOLDER_KEY = 'parent-folder-handle';

async function loadStoredParentFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(VIDEO_PARENT_IDB_NAME, 1);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
      r.onupgradeneeded = (e) => {
        (e.target as IDBOpenDBRequest).result.createObjectStore(VIDEO_PARENT_IDB_STORE);
      };
    });
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(VIDEO_PARENT_IDB_STORE, 'readonly');
      const req = tx.objectStore(VIDEO_PARENT_IDB_STORE).get(VIDEO_PARENT_FOLDER_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
    db.close();
    return handle ?? null;
  } catch {
    return null;
  }
}

function formatFlightDateForFolder(flightDate?: string | null): string | null {
  if (!flightDate) return null;
  try {
    const d = new Date(flightDate);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}


interface Photo {
  id: string;
  flightLogId: string;
  lat: number;
  lng: number;
  altitudeM?: number;
  timestampOffsetMs: number;
  photoFilename?: string;
  thumbnailUrl?: string | null;
  originalFileUrl?: string | null;
  flightDate?: string;
  absoluteTimestamp?: string;
  headingDeg?: number | null;
  gimbalPitchDeg?: number | null;
}

interface PhotoGroupedByMonth {
  year: number;
  month: number;
  monthName: string;
  photos: Photo[];
}

interface VideoSearchResult {
  flightLogId: string;
  flightDate: string | null;
  videoFilenames: string[];
  lat: number;
  lng: number;
  recordingPath: Array<{ lat: number; lng: number }>;
}

export default function PhotoSearchPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [searchMode, setSearchMode] = useState<'photos' | 'videos'>('photos');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [videos, setVideos] = useState<VideoSearchResult[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoSearchResult | null>(null);
  /** When true, show the full-screen lightbox (from list click). When false, only the map InfoWindow can show (from marker click). */
  const [showLightbox, setShowLightbox] = useState(false);
  const [loading, setLoading] = useState(false);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const closeListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const currentPhotoIdRef = useRef<string | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  
  // Initialize InfoWindow once when map loads
  useEffect(() => {
    if (map && !infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow({
        maxWidth: 300,
        pixelOffset: new google.maps.Size(0, -10),
      });
    }
  }, [map]);
  
  // Manually manage InfoWindow (photo or video selected from map)
  useEffect(() => {
    if (!map || !infoWindowRef.current) return;
    if (isProcessingRef.current) return;

    const infoWindow = infoWindowRef.current;
    if (closeListenerRef.current) {
      google.maps.event.removeListener(closeListenerRef.current);
      closeListenerRef.current = null;
    }

    const showPhoto = selectedPhoto && !showLightbox;
    const showVideo = selectedVideo;
    const itemToShow = showPhoto ? selectedPhoto : showVideo ? selectedVideo : null;

    if (!itemToShow) {
      infoWindow.close();
      currentPhotoIdRef.current = null;
      return;
    }

    isProcessingRef.current = true;
    const content = document.createElement('div');
    content.className = 'p-2 max-w-xs';

    if ('flightLogId' in itemToShow) {
      const v = itemToShow as VideoSearchResult;
      const title = document.createElement('div');
      title.className = 'font-semibold mb-1 text-sm';
      title.textContent = 'Flight with video';
      content.appendChild(title);
      if (v.flightDate) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'text-gray-600 text-xs mb-1';
        dateDiv.textContent = new Date(v.flightDate).toLocaleDateString();
        content.appendChild(dateDiv);
      }
      const countDiv = document.createElement('div');
      countDiv.className = 'text-gray-600 text-xs mb-2';
      countDiv.textContent = v.videoFilenames.length > 0
        ? `${v.videoFilenames.length} video file(s)`
        : 'Video path in area (files not linked)';
      content.appendChild(countDiv);
      const flightLogLink = document.createElement('a');
      flightLogLink.href = `/logs/${v.flightLogId}`;
      flightLogLink.className = 'text-blue-600 hover:underline text-sm block mb-2';
      flightLogLink.textContent = 'Open flight log →';
      flightLogLink.target = '_blank';
      content.appendChild(flightLogLink);
      if (v.videoFilenames.length > 0) {
        const listLabel = document.createElement('div');
        listLabel.className = 'text-xs font-medium text-gray-700 mb-1';
        listLabel.textContent = 'Open video:';
        content.appendChild(listLabel);
        const list = document.createElement('div');
        list.className = 'flex flex-col gap-1 max-h-32 overflow-y-auto';
        const dateFolderName = formatFlightDateForFolder(v.flightDate);
        v.videoFilenames.forEach((filename) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'text-left text-blue-600 hover:underline text-xs truncate';
          btn.textContent = filename;
          btn.title = filename;
          btn.onclick = async () => {
            try {
              let dirHandle: FileSystemDirectoryHandle | null = await loadStoredParentFolderHandle();
              if (dirHandle && 'requestPermission' in dirHandle) {
                // Cast to any so we don't depend on TS lib having requestPermission typed
                const perm = await (dirHandle as any).requestPermission({ mode: 'read' });
                if (perm !== 'granted') dirHandle = null;
              }
              if (!dirHandle && typeof (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker === 'function') {
                dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
              }
              if (!dirHandle) return;
              const dateFolder = dateFolderName
                ? await dirHandle.getDirectoryHandle(dateFolderName)
                : dirHandle;
              const fileHandle = await dateFolder.getFileHandle(filename);
              const file = await fileHandle.getFile();
              const url = URL.createObjectURL(file);
              window.open(url, '_blank');
            } catch (err: unknown) {
              if ((err as { name?: string })?.name !== 'AbortError') {
                alert('Could not open video. Use Bulk Photo Regeneration to set the parent folder, or open the flight log to open videos.');
              }
            }
          };
          list.appendChild(btn);
        });
        content.appendChild(list);
      }
      infoWindow.setPosition({ lat: v.lat, lng: v.lng });
      currentPhotoIdRef.current = null;
      closeListenerRef.current = google.maps.event.addListener(infoWindow, 'closeclick', () => setSelectedVideo(null));
    } else {
      const p = itemToShow as Photo;
      if (currentPhotoIdRef.current === p.id) {
        isProcessingRef.current = false;
        return;
      }
      infoWindow.close();
      if (p.thumbnailUrl) {
        const img = document.createElement('img');
        img.src = p.thumbnailUrl;
        img.alt = p.photoFilename || 'Photo';
        img.className = 'mb-2 rounded max-w-full h-auto';
        img.style.maxHeight = '200px';
        content.appendChild(img);
      }
      const textDiv = document.createElement('div');
      textDiv.className = 'text-sm';
      const filenameDiv = document.createElement('div');
      filenameDiv.className = 'font-semibold mb-1';
      filenameDiv.textContent = p.photoFilename || 'Photo';
      textDiv.appendChild(filenameDiv);
      if (p.absoluteTimestamp) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'text-gray-600 mb-1';
        dateDiv.textContent = new Date(p.absoluteTimestamp).toLocaleString();
        textDiv.appendChild(dateDiv);
      }
      const gpsDiv = document.createElement('div');
      gpsDiv.className = 'text-gray-600 text-xs';
      gpsDiv.textContent = `GPS: ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
      textDiv.appendChild(gpsDiv);
      if (p.altitudeM !== undefined) {
        const altDiv = document.createElement('div');
        altDiv.className = 'text-gray-600 text-xs';
        altDiv.textContent = `Altitude: ${Math.round(p.altitudeM)}m`;
        textDiv.appendChild(altDiv);
      }
      content.appendChild(textDiv);
      infoWindow.setPosition({ lat: p.lat, lng: p.lng });
      currentPhotoIdRef.current = p.id;
      closeListenerRef.current = google.maps.event.addListener(infoWindow, 'closeclick', () => {
        currentPhotoIdRef.current = null;
        setSelectedPhoto(null);
      });
    }

    infoWindow.setContent(content);
    infoWindow.open(map);
    isProcessingRef.current = false;
  }, [selectedPhoto, selectedVideo, showLightbox, map]);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  
  // Load last map view from localStorage
  const loadLastMapView = (): { center: google.maps.LatLngLiteral; zoom: number } => {
    if (typeof window === 'undefined') {
      return { center: { lat: -25, lng: 133 }, zoom: 5 }; // Default to Australia
    }
    
    try {
      const saved = localStorage.getItem('photoSearchMapView');
      if (saved) {
        const view = JSON.parse(saved);
        if (view.center && view.zoom) {
          return view;
        }
      }
    } catch (error) {
      console.error('Error loading last map view:', error);
    }
    
    return { center: { lat: -25, lng: 133 }, zoom: 5 }; // Default to Australia
  };
  
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(() => loadLastMapView().center);
  const [mapZoom, setMapZoom] = useState<number>(() => loadLastMapView().zoom);
  /** Current map view width in meters; used to show directional marker when < 200m */
  const [viewWidthMeters, setViewWidthMeters] = useState<number | null>(null);

  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_CONFIG);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        // Debug: Check if photos exist in database on page load
        const checkPhotos = async () => {
          try {
            const { supabase } = await import('@/lib/supabase');
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              const { count, error } = await supabase
                .from('flight_log_data_points')
                .select('*', { count: 'exact', head: true })
                .eq('is_photo', true)
                .not('lat', 'is', null)
                .not('lng', 'is', null);
              
              if (!error && count !== null) {
                console.log(`📸 Total photos with GPS coordinates in database: ${count}`);
                if (count === 0) {
                  console.warn('⚠️ No photos found in database. Make sure flight logs have been uploaded and photos have GPS coordinates.');
                }
              } else {
                console.error('Error checking photos:', error);
              }
            }
          } catch (error) {
            console.error('Error checking photos on load:', error);
          }
        };
        checkPhotos();
      }
    }
  }, [user, authLoading, router]);

  // Save map view to localStorage when map moves
  useEffect(() => {
    if (!map) return;

    const saveMapView = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      if (center && zoom !== undefined) {
        const view = {
          center: { lat: center.lat(), lng: center.lng() },
          zoom: zoom,
        };
        
        try {
          localStorage.setItem('photoSearchMapView', JSON.stringify(view));
        } catch (error) {
          console.error('Error saving map view:', error);
        }
      }
    };

    // Save on idle (debounce to avoid too many writes)
    let timeoutId: NodeJS.Timeout;
    const listener = map.addListener('idle', () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(saveMapView, 1000);
    });

    return () => {
      clearTimeout(timeoutId);
      google.maps.event.removeListener(listener);
    };
  }, [map]);

  // Update view width in meters when map bounds change (for directional photo markers when zoomed in)
  useEffect(() => {
    if (!map) return;
    const updateViewWidth = () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const centerLat = (ne.lat() + sw.lat()) / 2;
      const lngSpanDeg = ne.lng() - sw.lng();
      const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
      const widthM = lngSpanDeg * metersPerDegLng;
      setViewWidthMeters(widthM);
    };
    updateViewWidth();
    const listeners = [
      map.addListener('bounds_changed', updateViewWidth),
      map.addListener('idle', updateViewWidth),
    ];
    return () => listeners.forEach((l) => google.maps.event.removeListener(l));
  }, [map]);

  // Group photos by month
  const photosByMonth = useMemo<PhotoGroupedByMonth[]>(() => {
    const groups = new Map<string, PhotoGroupedByMonth>();

    photos.forEach(photo => {
      if (!photo.absoluteTimestamp) return;
      
      const date = new Date(photo.absoluteTimestamp);
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${month}`;

      if (!groups.has(key)) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        groups.set(key, {
          year,
          month,
          monthName: monthNames[month],
          photos: [],
        });
      }

      groups.get(key)!.photos.push(photo);
    });

    // Sort groups by date (newest first), and photos within each group by date (newest first)
    return Array.from(groups.values())
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      })
      .map(group => ({
        ...group,
        photos: group.photos.sort((a, b) => {
          const dateA = a.absoluteTimestamp ? new Date(a.absoluteTimestamp).getTime() : 0;
          const dateB = b.absoluteTimestamp ? new Date(b.absoluteTimestamp).getTime() : 0;
          return dateB - dateA;
        }),
      }));
  }, [photos]);

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${month}`;
    setExpandedMonths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const expandAllMonths = () => {
    const allKeys = photosByMonth.map(g => `${g.year}-${g.month}`);
    setExpandedMonths(new Set(allKeys));
  };

  const collapseAllMonths = () => {
    setExpandedMonths(new Set());
  };

  // Search photos in currently visible map area
  const handleSearch = async () => {
    if (!map) {
      alert('Map is not loaded yet');
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert('Not authenticated');
        return;
      }

      // Get current map bounds
      const bounds = map.getBounds();
      if (!bounds) {
        alert('Unable to get map bounds');
        setLoading(false);
        return;
      }

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const searchParams = {
        bounds: {
          north: ne.lat(),
          south: sw.lat(),
          east: ne.lng(),
          west: sw.lng(),
        },
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };

      if (searchMode === 'videos') {
        const response = await fetch('/api/videos/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          credentials: 'include',
          body: JSON.stringify(searchParams),
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to search videos');
        }
        const data = await response.json();
        setVideos(data.videos || []);
        setPhotos([]);
        return;
      }

      const response = await fetch('/api/photos/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
        body: JSON.stringify(searchParams),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Search API error:', error);
        throw new Error(error.error || 'Failed to search photos');
      }

      const data = await response.json();
      const uniquePhotos = data.photos ? Array.from(
        new Map(data.photos.map((p: Photo) => [p.id, p])).values()
      ) : [];
      setPhotos(uniquePhotos);
      setVideos([]);
      
      // Note: We intentionally don't change the map view - keep the current visible area
    } catch (error) {
      console.error('Error searching photos:', error);
      alert(`Error searching photos: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
    router.push('/login');
  };

  const clearResults = () => {
    setPhotos([]);
    setVideos([]);
    setSelectedPhoto(null);
    setSelectedVideo(null);
  };

  if (authLoading || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-xl font-bold text-blue-600">
                DJI Air 3 Mission Planner
              </Link>
              <Link href="/missions" className="text-gray-600 hover:text-gray-800">
                Missions
              </Link>
              <Link href="/logs" className="text-gray-600 hover:text-gray-800">
                Flight Logs
              </Link>
              <Link href="/photos" className="text-blue-600 font-semibold">
                Photos &amp; Videos
              </Link>
              <Link href="/batteries" className="text-gray-600 hover:text-gray-800">
                Batteries
              </Link>
              <Link href="/fleet" className="text-gray-600 hover:text-gray-800">
                Fleet
              </Link>
            </div>
            <div className="flex items-center space-x-4">
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-4">Photo &amp; Video Search</h1>
          
          {/* Search Controls */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-wrap items-center gap-4 mb-3">
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1">Search for</span>
                <div className="flex rounded-md border border-gray-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode('photos');
                      clearResults();
                    }}
                    className={`px-4 py-2 text-sm font-medium ${searchMode === 'photos' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    Photos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMode('videos');
                      clearResults();
                    }}
                    className={`px-4 py-2 text-sm font-medium border-l border-gray-300 ${searchMode === 'videos' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                  >
                    Videos
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Range (Optional)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSearch}
                  disabled={!map || loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
                >
                  {loading ? 'Searching...' : 'Search Visible Area'}
                </button>
                {(photos.length > 0 || videos.length > 0) && (
                  <button
                    onClick={clearResults}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
                  >
                    Clear Results
                  </button>
                )}
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mt-3">
              {searchMode === 'photos'
                ? 'Search for photos in the currently visible map area. Pan and zoom the map to adjust the search area.'
                : 'Search for flights with video whose path overlaps the visible map area. Pan and zoom to adjust the area.'}
            </p>
            
            {photos.length > 0 && (
              <div className="text-sm text-gray-600 mt-2 font-semibold">
                Found {photos.length} photo(s) in visible area
              </div>
            )}
            {videos.length > 0 && (
              <div className="text-sm text-gray-600 mt-2 font-semibold">
                Found {videos.length} flight(s) with video in visible area
              </div>
            )}
            
            {/* Debug info */}
            {process.env.NODE_ENV === 'development' && map && (
              <div className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded">
                <div>Map bounds: N={map.getBounds()?.getNorthEast().lat().toFixed(4)}, S={map.getBounds()?.getSouthWest().lat().toFixed(4)}, E={map.getBounds()?.getNorthEast().lng().toFixed(4)}, W={map.getBounds()?.getSouthWest().lng().toFixed(4)}</div>
                <div>Center: {mapCenter.lat.toFixed(4)}, {mapCenter.lng.toFixed(4)} | Zoom: {mapZoom}</div>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="bg-white rounded-lg shadow mb-6" style={{ height: '600px' }}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={mapCenter}
            zoom={mapZoom}
            onLoad={(mapInstance) => {
              setMap(mapInstance);
            }}
            onClick={() => {
              if (infoWindowRef.current) infoWindowRef.current.close();
              setSelectedPhoto(null);
              setSelectedVideo(null);
            }}
            options={{
              mapTypeId: 'satellite',
              mapTypeControl: true,
              streetViewControl: false,
              fullscreenControl: true,
            }}
          >

            {/* Video recording paths: red polyline per flight; click to show flight info */}
            {videos.map((v) => (
              <span key={v.flightLogId}>
                {v.recordingPath?.length > 1 ? (
                  <Polyline
                    path={v.recordingPath}
                    options={{
                      strokeColor: '#DC2626',
                      strokeOpacity: 0.9,
                      strokeWeight: 4,
                      clickable: true,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e?.domEvent?.stopPropagation();
                      if (infoWindowRef.current) infoWindowRef.current.close();
                      setSelectedPhoto(null);
                      setSelectedVideo(selectedVideo?.flightLogId === v.flightLogId ? null : v);
                    }}
                  />
                ) : (
                  <Marker
                    position={{ lat: v.lat, lng: v.lng }}
                    icon={{
                      path: google.maps.SymbolPath.CIRCLE,
                      scale: 10,
                      fillColor: '#DC2626',
                      fillOpacity: 1,
                      strokeColor: '#ffffff',
                      strokeWeight: 2,
                    }}
                    onClick={(e) => {
                      e?.domEvent?.stopPropagation();
                      if (infoWindowRef.current) infoWindowRef.current.close();
                      setSelectedPhoto(null);
                      setSelectedVideo(selectedVideo?.flightLogId === v.flightLogId ? null : v);
                    }}
                    options={{ optimized: false, clickable: true }}
                  />
                )}
              </span>
            ))}
            {/* Photo markers: circle when zoomed out; circle with direction pointer when view < 200m and heading known */}
            {photos.map((photo) => {
              const heading =
                photo.headingDeg != null && typeof photo.headingDeg === 'number'
                  ? photo.headingDeg
                  : (photo as { heading_deg?: number }).heading_deg;
              const useDirectional =
                viewWidthMeters != null &&
                viewWidthMeters < 200 &&
                heading != null &&
                typeof heading === 'number';
              // Arrow path: circle + triangle. In SVG path coords Y is down, so (0,-0.6) is "up".
              // Google Maps Symbol rotation: degrees clockwise from the path's default. Our default
              // points up (north). Stored heading: 0=north, 90=east (clockwise from north).
              // If the symbol renders with default = south, use (heading + 180) % 360.
              const path =
                useDirectional
                  ? 'M 0,0 m -0.5,0 a 0.5,0.5 0 1,1 1,0 a 0.5,0.5 0 1,1 -1,0 M 0,-0.6 L -0.15,0.05 L 0.15,0.05 Z'
                  : google.maps.SymbolPath.CIRCLE;
              const rotationDeg =
                useDirectional && typeof heading === 'number'
                  ? (heading + 180) % 360
                  : 0;
              return (
              <Marker
                key={photo.id}
                position={{ lat: photo.lat, lng: photo.lng }}
                icon={{
                  path,
                  scale: useDirectional ? 10 : 8,
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                  rotation: rotationDeg,
                }}
                onClick={(e) => {
                  if (e?.domEvent) {
                    e.domEvent.stopPropagation();
                  }
                  if (selectedPhoto?.id === photo.id) {
                    if (infoWindowRef.current) {
                      infoWindowRef.current.close();
                    }
                    setSelectedPhoto(null);
                  } else {
                    if (infoWindowRef.current) {
                      infoWindowRef.current.close();
                    }
                    setShowLightbox(false); // Map click = show InfoWindow only, not lightbox
                    setSelectedPhoto(photo);
                  }
                }}
                options={{
                  optimized: false, // Prevent duplicate rendering issues
                  clickable: true,
                }}
              />
            );
            })}

            {/* InfoWindow is now managed manually via useEffect */}
          </GoogleMap>
        </div>

        {/* Video results list */}
        {videos.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-2xl font-bold mb-4">Videos ({videos.length} flight{videos.length !== 1 ? 's' : ''})</h2>
            <ul className="space-y-3">
              {videos.map((v) => (
                <li key={v.flightLogId} className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="font-medium">
                      {v.flightDate ? new Date(v.flightDate).toLocaleDateString() : 'Unknown date'}
                    </span>
                    <span className="text-gray-500 text-sm ml-2">
                      {v.videoFilenames.length} video file{v.videoFilenames.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Link
                    href={`/logs/${v.flightLogId}`}
                    className="text-blue-600 hover:underline text-sm font-medium"
                  >
                    Open flight log →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Photo List Grouped by Month */}
        {photosByMonth.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Photos ({photos.length})</h2>
              <div className="flex gap-2">
                <button
                  onClick={expandAllMonths}
                  className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAllMonths}
                  className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {photosByMonth.map((group) => {
              const key = `${group.year}-${group.month}`;
              const isExpanded = expandedMonths.has(key);

              return (
                <div key={key} className="mb-4 border border-gray-200 rounded-lg">
                  <button
                    onClick={() => toggleMonth(group.year, group.month)}
                    className="w-full px-4 py-3 flex justify-between items-center bg-gray-50 hover:bg-gray-100 rounded-t-lg"
                  >
                    <span className="font-semibold">
                      {group.monthName} {group.year} ({group.photos.length} photo{group.photos.length !== 1 ? 's' : ''})
                    </span>
                    <svg
                      className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {group.photos.map((photo) => (
                          <div
                            key={photo.id}
                            className="cursor-pointer hover:opacity-75 transition-opacity group"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (infoWindowRef.current?.getMap()) {
                                infoWindowRef.current.close();
                              }
                              setSelectedPhoto(photo);
                              setShowLightbox(true); // List click = open full-screen lightbox
                            }}
                          >
                            {photo.thumbnailUrl ? (
                              <img
                                src={photo.thumbnailUrl}
                                alt={photo.photoFilename || 'Photo'}
                                className="w-full h-auto rounded border border-gray-200"
                              />
                            ) : (
                              <div className="w-full aspect-square bg-gray-200 rounded border border-gray-200 flex items-center justify-center text-gray-400 text-xs">
                                No thumbnail
                              </div>
                            )}
                            <div className="mt-1 text-xs text-gray-600 truncate">
                              {photo.photoFilename || 'Photo'}
                            </div>
                            {photo.absoluteTimestamp && (
                              <div className="text-xs text-gray-500">
                                {new Date(photo.absoluteTimestamp).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {photos.length === 0 && videos.length === 0 && !loading && map && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            {searchMode === 'photos'
              ? 'No photos found in the visible map area. Try panning or zooming and search again.'
              : 'No flights with video found whose path overlaps the visible area. Try panning or zooming and search again.'}
            {startDate || endDate ? ' (Date filter applied.)' : ''}
          </div>
        )}
      </main>

      {/* Photo Lightbox Modal - only when opened from the list, not from map marker */}
      {selectedPhoto && showLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => {
            setShowLightbox(false);
            setSelectedPhoto(null);
          }}
          tabIndex={-1}
        >
          <div className="relative max-w-7xl max-h-full">
            <button
              onClick={() => {
                setShowLightbox(false);
                setSelectedPhoto(null);
              }}
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
            
            {/* Determine image source: use original file if available, otherwise fall back to thumbnail */}
            {selectedPhoto.thumbnailUrl ? (
              <img
                src={selectedPhoto.thumbnailUrl}
                alt={selectedPhoto.photoFilename || 'Photo'}
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
                  setShowLightbox(false);
                  setSelectedPhoto(null);
                }}
              />
            ) : (
              <div className="bg-gray-800 rounded-lg p-8 text-white text-center">
                <p>No thumbnail available</p>
                <button
                  onClick={() => {
                    setShowLightbox(false);
                    setSelectedPhoto(null);
                  }}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            )}
            
            {/* Photo metadata overlay */}
            <div 
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-w-4xl mx-auto">
                {selectedPhoto.photoFilename && (
                  <div className="font-semibold text-lg mb-2">{selectedPhoto.photoFilename}</div>
                )}
                {selectedPhoto.absoluteTimestamp && (
                  <div className="text-sm text-gray-200 mb-1">
                    {new Date(selectedPhoto.absoluteTimestamp).toLocaleString()}
                  </div>
                )}
                <div className="text-xs text-gray-300 space-y-1">
                  <div>GPS: {selectedPhoto.lat.toFixed(6)}, {selectedPhoto.lng.toFixed(6)}</div>
                  {selectedPhoto.altitudeM !== undefined && (
                    <div>Altitude: {Math.round(selectedPhoto.altitudeM)}m</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

