'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { Marker, InfoWindow } from '@react-google-maps/api';
import Link from 'next/link';
import { GOOGLE_MAPS_LOADER_CONFIG } from '@/lib/google-maps-config';


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
}

interface PhotoGroupedByMonth {
  year: number;
  month: number;
  monthName: string;
  photos: Photo[];
}

export default function PhotoSearchPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(false);
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

  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_CONFIG);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
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

      const response = await fetch('/api/photos/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          bounds: {
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng(),
          },
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search photos');
      }

      const data = await response.json();
      setPhotos(data.photos || []);
      
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
    setSelectedPhoto(null);
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
                Photo Search
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
          <h1 className="text-3xl font-bold mb-4">Photo Search</h1>
          
          {/* Search Controls */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
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
                {photos.length > 0 && (
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
              Search for photos in the currently visible map area. Pan and zoom the map to adjust the search area.
            </p>
            
            {photos.length > 0 && (
              <div className="text-sm text-gray-600 mt-2 font-semibold">
                Found {photos.length} photo(s) in visible area
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
            options={{
              mapTypeId: 'satellite',
              mapTypeControl: true,
              streetViewControl: false,
              fullscreenControl: true,
            }}
          >

            {/* Photo markers */}
            {photos.map((photo) => (
              <Marker
                key={photo.id}
                position={{ lat: photo.lat, lng: photo.lng }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                }}
                onClick={() => setSelectedPhoto(photo)}
              />
            ))}

            {/* Info window for selected photo */}
            {selectedPhoto && (
              <InfoWindow
                position={{ lat: selectedPhoto.lat, lng: selectedPhoto.lng }}
                onCloseClick={() => setSelectedPhoto(null)}
              >
                <div className="p-2 max-w-xs">
                  {selectedPhoto.thumbnailUrl && (
                    <img
                      src={selectedPhoto.thumbnailUrl}
                      alt={selectedPhoto.photoFilename || 'Photo'}
                      className="mb-2 rounded max-w-full h-auto"
                      style={{ maxHeight: '200px' }}
                    />
                  )}
                  <div className="text-sm">
                    <div className="font-semibold mb-1">
                      {selectedPhoto.photoFilename || 'Photo'}
                    </div>
                    {selectedPhoto.absoluteTimestamp && (
                      <div className="text-gray-600 mb-1">
                        {new Date(selectedPhoto.absoluteTimestamp).toLocaleString()}
                      </div>
                    )}
                    <div className="text-gray-600 text-xs">
                      GPS: {selectedPhoto.lat.toFixed(6)}, {selectedPhoto.lng.toFixed(6)}
                    </div>
                    {selectedPhoto.altitudeM !== undefined && (
                      <div className="text-gray-600 text-xs">
                        Altitude: {Math.round(selectedPhoto.altitudeM)}m
                      </div>
                    )}
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>

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
                              e.stopPropagation(); // Prevent collapsing the month section
                              setSelectedPhoto(photo);
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

        {photos.length === 0 && !loading && map && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            {photos.length === 0 && map ? (
              <>
                No photos found in the visible map area{startDate || endDate ? ' for the specified date range' : ''}. 
                Try panning or zooming to a different area and search again.
              </>
            ) : (
              'Click "Search Visible Area" to find photos in the current map view.'
            )}
          </div>
        )}
      </main>

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setSelectedPhoto(null)}
          tabIndex={-1}
        >
          <div className="relative max-w-7xl max-h-full">
            <button
              onClick={() => setSelectedPhoto(null)}
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
                  setSelectedPhoto(null);
                }}
              />
            ) : (
              <div className="bg-gray-800 rounded-lg p-8 text-white text-center">
                <p>No thumbnail available</p>
                <button
                  onClick={() => setSelectedPhoto(null)}
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

