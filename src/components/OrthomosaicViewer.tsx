'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { OrthomosaicProject } from '@/lib/types';
import { GOOGLE_MAPS_LOADER_CONFIG } from '@/lib/google-maps-config';

interface OrthomosaicViewerProps {
  project: OrthomosaicProject;
  height?: string;
}

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export default function OrthomosaicViewer({ 
  project, 
  height = '600px' 
}: OrthomosaicViewerProps) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_CONFIG);

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [orthomosaicUrl, setOrthomosaicUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<google.maps.GroundOverlay | null>(null);

  useEffect(() => {
    if (project.orthomosaicUrl && project.area) {
      // For now, we'll use the orthomosaic URL directly
      // In a full implementation, you'd convert GeoTIFF to map tiles
      setOrthomosaicUrl(project.orthomosaicUrl);
      setLoading(false);
    } else if (!project.orthomosaicUrl) {
      setError('Orthomosaic file not available');
      setLoading(false);
    }
  }, [project]);

  const onMapLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    
    if (project.area) {
      const areaBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(project.area.south, project.area.west),
        new google.maps.LatLng(project.area.north, project.area.east)
      );
      setBounds(areaBounds);
      mapInstance.fitBounds(areaBounds);
      mapInstance.setMapTypeId('satellite');
    }

    // Add orthomosaic overlay if available
    if (orthomosaicUrl && project.area) {
      const areaBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(project.area.south, project.area.west),
        new google.maps.LatLng(project.area.north, project.area.east)
      );

      // Create GroundOverlay for orthomosaic
      const overlay = new google.maps.GroundOverlay(orthomosaicUrl, areaBounds, {
        opacity: 0.7,
      });
      overlay.setMap(mapInstance);
      overlayRef.current = overlay;
    }
  }, [project.area, orthomosaicUrl]);

  // Update overlay when orthomosaic URL changes
  useEffect(() => {
    if (map && orthomosaicUrl && project.area && !overlayRef.current) {
      const areaBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(project.area.south, project.area.west),
        new google.maps.LatLng(project.area.north, project.area.east)
      );

      const overlay = new google.maps.GroundOverlay(orthomosaicUrl, areaBounds, {
        opacity: 0.7,
      });
      overlay.setMap(map);
      overlayRef.current = overlay;
    }
  }, [map, orthomosaicUrl, project.area]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 border border-red-200 rounded" style={{ height }}>
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!project.area) {
    return (
      <div className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded" style={{ height }}>
        <p className="text-gray-600">No area information available</p>
      </div>
    );
  }

  const center = {
    lat: (project.area.north + project.area.south) / 2,
    lng: (project.area.east + project.area.west) / 2,
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-2">{project.name}</h3>
        {project.description && (
          <p className="text-gray-600 text-sm mb-4">{project.description}</p>
        )}
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          {project.photoCount && (
            <div>
              <span className="text-gray-500">Photos:</span>
              <span className="ml-2 font-medium">{project.photoCount}</span>
            </div>
          )}
          {project.area && (
            <div>
              <span className="text-gray-500">Area:</span>
              <span className="ml-2 font-medium">
                {((project.area.north - project.area.south) * 111000).toFixed(0)}m ×{' '}
                {((project.area.east - project.area.west) * 111000 * 
                  Math.cos((project.area.north + project.area.south) / 2 * Math.PI / 180)).toFixed(0)}m
              </span>
            </div>
          )}
          {project.processingCompletedAt && (
            <div>
              <span className="text-gray-500">Completed:</span>
              <span className="ml-2 font-medium">
                {new Date(project.processingCompletedAt).toLocaleDateString()}
              </span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Status:</span>
            <span className={`ml-2 font-medium ${
              project.status === 'completed' ? 'text-green-600' :
              project.status === 'processing' ? 'text-blue-600' :
              project.status === 'failed' ? 'text-red-600' :
              'text-gray-600'
            }`}>
              {project.status}
            </span>
          </div>
        </div>

        {project.orthomosaicUrl && (
          <div className="mb-4">
            <a
              href={project.orthomosaicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Download Orthomosaic (GeoTIFF)
            </a>
            {project.demUrl && (
              <a
                href={project.demUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block ml-2 bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
              >
                Download DEM
              </a>
            )}
          </div>
        )}
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ height }}>
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={center}
          zoom={17}
          onLoad={onMapLoad}
          options={{
            mapTypeId: 'satellite',
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
          }}
        />
      </div>

      {project.processingError && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <h4 className="font-semibold text-red-900 mb-2">Processing Error</h4>
          <p className="text-red-800 text-sm">{project.processingError}</p>
        </div>
      )}

      {project.status === 'processing' && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
            <p className="text-blue-800">Processing orthomosaic... This may take 30-60 minutes for large areas.</p>
          </div>
        </div>
      )}
    </div>
  );
}

