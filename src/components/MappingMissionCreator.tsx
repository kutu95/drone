'use client';

import { useState, useCallback, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Polygon, Rectangle } from '@react-google-maps/api';
import { Mission } from '@/lib/types';
import { generateMappingWaypoints, validateMappingParameters, calculateGSD, calculatePhotoFootprint, estimateMappingFlightTimeFromParams, type MappingParameters, type MappingArea } from '@/lib/mapping-utils';
import { GOOGLE_MAPS_LOADER_CONFIG } from '@/lib/google-maps-config';

interface MappingMissionCreatorProps {
  onMissionCreate: (mission: Mission) => void;
  onCancel: () => void;
  initialCenter?: { lat: number; lng: number };
}

export default function MappingMissionCreator({
  onMissionCreate,
  onCancel,
  initialCenter = { lat: -31.95, lng: 115.86 }, // Default to Perth, Western Australia
}: MappingMissionCreatorProps) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_CONFIG);

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);
  const [selectedArea, setSelectedArea] = useState<MappingArea | null>(null);
  const [selectedRectangle, setSelectedRectangle] = useState<google.maps.Rectangle | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Load saved map view or use initial center
  const [mapCenter, setMapCenter] = useState(() => {
    const lastViewKey = 'mapping-mission-last-view';
    try {
      const savedView = localStorage.getItem(lastViewKey);
      if (savedView) {
        const view = JSON.parse(savedView);
        if (view.center && view.zoom) {
          return view.center;
        }
      }
    } catch (error) {
      console.error('Error loading saved map view:', error);
    }
    return initialCenter;
  });
  
  const [mapZoom, setMapZoom] = useState(() => {
    const lastViewKey = 'mapping-mission-last-view';
    try {
      const savedView = localStorage.getItem(lastViewKey);
      if (savedView) {
        const view = JSON.parse(savedView);
        if (view.center && view.zoom) {
          return view.zoom;
        }
      }
    } catch (error) {
      console.error('Error loading saved map zoom:', error);
    }
    return 17;
  });
  
  // Mapping parameters
  const [altitudeM, setAltitudeM] = useState(70);
  const [frontOverlap, setFrontOverlap] = useState(75);
  const [sideOverlap, setSideOverlap] = useState(70);
  const [speedMps, setSpeedMps] = useState(5);
  const [pattern, setPattern] = useState<'parallel_lines' | 'zigzag'>('parallel_lines');
  const [direction, setDirection] = useState<'north_south' | 'east_west'>('north_south');
  
  // Mission details
  const [missionName, setMissionName] = useState('');
  const [missionDescription, setMissionDescription] = useState('');
  
  // Stats
  const [estimatedStats, setEstimatedStats] = useState<{
    gsd: number;
    footprint: { widthM: number; heightM: number };
    waypointCount: number;
    flightTime: number;
  } | null>(null);

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    
    // Set map to satellite view
    mapInstance.setMapTypeId('satellite');
    
    // Load and set initial view from localStorage (or use state as fallback)
    const lastViewKey = 'mapping-mission-last-view';
    try {
      const savedView = localStorage.getItem(lastViewKey);
      if (savedView) {
        const view = JSON.parse(savedView);
        if (view.center && view.zoom) {
          mapInstance.setCenter(view.center);
          mapInstance.setZoom(view.zoom);
        } else {
          mapInstance.setCenter(mapCenter);
          mapInstance.setZoom(mapZoom);
        }
      } else {
        mapInstance.setCenter(mapCenter);
        mapInstance.setZoom(mapZoom);
      }
    } catch (error) {
      console.error('Error loading saved map view:', error);
      mapInstance.setCenter(mapCenter);
      mapInstance.setZoom(mapZoom);
    }
    
    // Save view changes to localStorage (debounced) - but don't update state props
    // to avoid causing map to reset on re-render
    // Note: lastViewKey is already defined above
    let saveTimeout: NodeJS.Timeout | null = null;
    
    const saveView = () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(() => {
        const center = mapInstance.getCenter();
        const zoom = mapInstance.getZoom();
        if (center && zoom !== undefined) {
          try {
            const viewData = {
              center: { lat: center.lat(), lng: center.lng() },
              zoom: zoom,
            };
            // Only save to localStorage, don't update state props to avoid map reset
            localStorage.setItem(lastViewKey, JSON.stringify(viewData));
          } catch (error) {
            console.error('Error saving map view:', error);
          }
        }
      }, 500); // Debounce by 500ms
    };
    
    // Use idle event instead of bounds_changed to avoid too frequent saves
    google.maps.event.addListener(mapInstance, 'idle', saveView);
    
    // Create drawing manager for rectangle selection (disabled by default)
    const manager = new google.maps.drawing.DrawingManager({
      drawingMode: null, // Start with no drawing mode so map can be dragged
      drawingControl: false, // Hide default control
      rectangleOptions: {
        fillColor: '#FF0000',
        fillOpacity: 0.2,
        strokeColor: '#FF0000',
        strokeWeight: 2,
        clickable: false,
        editable: true,
        draggable: true,
      },
    });
    
    manager.setMap(mapInstance);
    
    // Listen for rectangle completion
    google.maps.event.addListener(manager, 'rectanglecomplete', (rectangle: google.maps.Rectangle) => {
      const bounds = rectangle.getBounds();
      if (bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        
        const area: MappingArea = {
          north: ne.lat(),
          south: sw.lat(),
          east: ne.lng(),
          west: sw.lng(),
        };
        
        setSelectedArea(area);
        setSelectedRectangle(rectangle);
        
        // Disable drawing mode after completion
        manager.setDrawingMode(null);
        setIsDrawing(false);
        
        // Fit map to bounds
        mapInstance.fitBounds(bounds);
      }
    });
    
    setDrawingManager(manager);
  }, []);

  // Calculate stats when parameters change
  useEffect(() => {
    if (selectedArea && altitudeM) {
      try {
        const gsd = calculateGSD(altitudeM);
        const footprint = calculatePhotoFootprint(altitudeM);
        
        const params: MappingParameters = {
          area: selectedArea,
          altitudeM,
          frontOverlap,
          sideOverlap,
          speedMps,
          pattern,
          direction,
        };
        
        const validation = validateMappingParameters(params);
        if (validation.valid) {
          // Generate waypoints with error handling
          try {
            const waypoints = generateMappingWaypoints(params);
            // Use parameter-based estimation for more accuracy (before waypoints are generated)
            const flightTime = estimateMappingFlightTimeFromParams(params);
            
            setEstimatedStats({
              gsd,
              footprint,
              waypointCount: waypoints.length,
              flightTime,
            });
          } catch (error) {
            console.error('Error generating waypoints:', error);
            setEstimatedStats(null);
            // Show error to user
            if (error instanceof Error) {
              alert(`Error: ${error.message}`);
            }
          }
        } else {
          setEstimatedStats(null);
        }
      } catch (error) {
        console.error('Error calculating stats:', error);
        setEstimatedStats(null);
      }
    } else {
      setEstimatedStats(null);
    }
  }, [selectedArea, altitudeM, frontOverlap, sideOverlap, speedMps, pattern, direction]);

  const handleCreate = () => {
    if (!selectedArea || !missionName.trim()) {
      alert('Please select an area and enter a mission name');
      return;
    }

    const params: MappingParameters = {
      area: selectedArea,
      altitudeM,
      frontOverlap,
      sideOverlap,
      speedMps,
      pattern,
      direction,
      gimbalPitchDeg: -90, // Vertical for mapping
    };

    const validation = validateMappingParameters(params);
    if (!validation.valid) {
      alert(`Invalid parameters: ${validation.errors.join(', ')}`);
      return;
    }

    const waypoints = generateMappingWaypoints(params);
    
    // Calculate center for home location
    const centerLat = (selectedArea.north + selectedArea.south) / 2;
    const centerLng = (selectedArea.east + selectedArea.west) / 2;

    const mission: Mission = {
      id: '', // Will be set by database
      name: missionName,
      description: missionDescription || undefined,
      droneModel: 'DJI Air 3',
      missionType: 'mapping',
      homeLocation: {
        lat: centerLat,
        lng: centerLng,
      },
      defaultAltitudeM: altitudeM,
      defaultSpeedMps: speedMps,
      waypoints,
      mappingArea: selectedArea,
      overlap: {
        front: frontOverlap,
        side: sideOverlap,
      },
      gridSettings: {
        pattern,
        direction,
      },
      processingSettings: {
        gsdTarget: calculateGSD(altitudeM),
      },
    };

    onMissionCreate(mission);
  };

  if (!isLoaded) {
    return <div className="flex items-center justify-center h-96">Loading map...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">Create Mapping Mission</h2>
        
        {/* Mission Details */}
        <div className="mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mission Name *
            </label>
            <input
              type="text"
              value={missionName}
              onChange={(e) => setMissionName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Farm Mapping - March 2024"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={missionDescription}
              onChange={(e) => setMissionDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Optional description..."
            />
          </div>
        </div>

        {/* Map with Drawing Tool */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Select Mapping Area *
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (drawingManager) {
                    drawingManager.setDrawingMode(google.maps.drawing.OverlayType.RECTANGLE);
                    setIsDrawing(true);
                  }
                }}
                disabled={isDrawing}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
              >
                {isDrawing ? 'Draw Rectangle on Map' : 'Draw Area'}
              </button>
              {selectedRectangle && (
                <button
                  onClick={() => {
                    if (selectedRectangle) {
                      selectedRectangle.setMap(null);
                      setSelectedRectangle(null);
                      setSelectedArea(null);
                    }
                  }}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Clear Area
                </button>
              )}
              {isDrawing && (
                <button
                  onClick={() => {
                    if (drawingManager) {
                      drawingManager.setDrawingMode(null);
                      setIsDrawing(false);
                    }
                  }}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Cancel Drawing
                </button>
              )}
            </div>
          </div>
          {isDrawing && (
            <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              Click and drag on the map to draw a rectangle for your mapping area.
            </div>
          )}
          <div className="border border-gray-300 rounded-lg overflow-hidden relative" style={{ 
            width: '100%', 
            paddingBottom: '75%', // 4:3 aspect ratio (3/4 = 0.75)
          }}>
            <div className="absolute inset-0">
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={mapCenter}
                zoom={mapZoom}
                onLoad={onMapLoad}
                options={{
                  mapTypeId: 'satellite',
                  mapTypeControl: true,
                  streetViewControl: false,
                }}
              />
            </div>
          </div>
          {selectedArea && (
            <p className="mt-2 text-sm text-gray-600">
              Area selected: {((selectedArea.north - selectedArea.south) * 111000).toFixed(0)}m ×{' '}
              {((selectedArea.east - selectedArea.west) * 111000 * Math.cos((selectedArea.north + selectedArea.south) / 2 * Math.PI / 180)).toFixed(0)}m
            </p>
          )}
        </div>

        {/* Mapping Parameters */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Altitude (m)
            </label>
            <input
              type="number"
              value={altitudeM}
              onChange={(e) => setAltitudeM(Number(e.target.value))}
              min="10"
              max="500"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {estimatedStats && (
              <p className="mt-1 text-xs text-gray-500">
                GSD: {estimatedStats.gsd.toFixed(2)} cm/pixel
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Speed (m/s)
            </label>
            <input
              type="number"
              value={speedMps}
              onChange={(e) => setSpeedMps(Number(e.target.value))}
              min="1"
              max="15"
              step="0.5"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Front Overlap (%)
            </label>
            <input
              type="number"
              value={frontOverlap}
              onChange={(e) => setFrontOverlap(Number(e.target.value))}
              min="50"
              max="95"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Side Overlap (%)
            </label>
            <input
              type="number"
              value={sideOverlap}
              onChange={(e) => setSideOverlap(Number(e.target.value))}
              min="50"
              max="95"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pattern
            </label>
            <select
              value={pattern}
              onChange={(e) => setPattern(e.target.value as 'parallel_lines' | 'zigzag')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="parallel_lines">Parallel Lines</option>
              <option value="zigzag">Zigzag</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Flight Direction
            </label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'north_south' | 'east_west')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="north_south">North-South</option>
              <option value="east_west">East-West</option>
            </select>
          </div>
        </div>

        {/* Estimated Stats */}
        {estimatedStats && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Estimated Mission Stats</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Waypoints:</span>
                <span className="ml-2 font-medium">{estimatedStats.waypointCount}</span>
              </div>
              <div>
                <span className="text-gray-600">Estimated Flight Time:</span>
                <span className="ml-2 font-medium">{Math.round(estimatedStats.flightTime / 60)} min</span>
              </div>
              <div>
                <span className="text-gray-600">Photo Footprint:</span>
                <span className="ml-2 font-medium">
                  {estimatedStats.footprint.widthM.toFixed(1)}m × {estimatedStats.footprint.heightM.toFixed(1)}m
                </span>
              </div>
              <div>
                <span className="text-gray-600">Ground Sample Distance:</span>
                <span className="ml-2 font-medium">{estimatedStats.gsd.toFixed(2)} cm/pixel</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={handleCreate}
            disabled={!selectedArea || !missionName.trim()}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Create Mapping Mission
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

