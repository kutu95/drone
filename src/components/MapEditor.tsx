'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import { Mission, Waypoint } from '@/lib/types';
import { GOOGLE_MAPS_LOADER_CONFIG } from '@/lib/google-maps-config';

interface MapEditorProps {
  mission: Mission;
  onMissionUpdate: (mission: Mission) => void;
}

export default function MapEditor({ mission, onMissionUpdate }: MapEditorProps) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [nextWaypointId, setNextWaypointId] = useState(1000);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);

  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_CONFIG);

  // Ask browser for user's current location if no mission data is available yet.
  useEffect(() => {
    if (mission.waypoints.length > 0 || mission.homeLocation || userLocation) {
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Unable to fetch browser location:', error);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [mission.homeLocation, mission.waypoints.length, userLocation]);

  const center = useMemo(() => {
    if (mission.waypoints.length > 0) {
      const avgLat = mission.waypoints.reduce((sum, wp) => sum + wp.lat, 0) / mission.waypoints.length;
      const avgLng = mission.waypoints.reduce((sum, wp) => sum + wp.lng, 0) / mission.waypoints.length;
      return { lat: avgLat, lng: avgLng };
    }
    return mission.homeLocation || userLocation || { lat: 37.7749, lng: -122.4194 }; // Default to San Francisco
  }, [mission.waypoints, mission.homeLocation, userLocation]);

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const newWaypoint: Waypoint = {
        id: `wp-${nextWaypointId}`,
        index: mission.waypoints.length,
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
        altitudeM: mission.defaultAltitudeM,
        speedMps: mission.defaultSpeedMps,
      };
      
      onMissionUpdate({
        ...mission,
        waypoints: [...mission.waypoints, newWaypoint],
      });
      
      setNextWaypointId(nextWaypointId + 1);
    }
  }, [mission, onMissionUpdate, nextWaypointId]);

  const onMarkerDragEnd = useCallback((waypointId: string, e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const updatedWaypoints = mission.waypoints.map(wp =>
        wp.id === waypointId
          ? { ...wp, lat: e.latLng!.lat(), lng: e.latLng!.lng() }
          : wp
      );
      onMissionUpdate({ ...mission, waypoints: updatedWaypoints });
    }
  }, [mission, onMissionUpdate]);

  const pathCoordinates = useMemo(() => {
    return mission.waypoints.map(wp => ({
      lat: wp.lat,
      lng: wp.lng,
    }));
  }, [mission.waypoints]);

  if (!isLoaded) {
    return <div className="w-full h-[600px] flex items-center justify-center">Loading map...</div>;
  }

  return (
    <div className="w-full h-[600px] border border-gray-300 rounded-lg overflow-hidden">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={mission.waypoints.length > 0 ? 15 : 10}
        onClick={onMapClick}
        onLoad={setMap}
        options={{
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        }}
      >
        {/* Home point marker */}
        {mission.homeLocation && (
          <Marker
            position={mission.homeLocation}
            label="H"
            icon={{
              url: 'http://maps.google.com/mapfiles/ms/icons/homegardenbusiness.png',
              scaledSize: new google.maps.Size(32, 32),
            }}
            draggable
            onDragEnd={(e) => {
              if (e.latLng) {
                onMissionUpdate({
                  ...mission,
                  homeLocation: { lat: e.latLng.lat(), lng: e.latLng.lng() },
                });
              }
            }}
          />
        )}

        {/* Waypoint markers */}
        {mission.waypoints.map((waypoint) => (
          <Marker
            key={waypoint.id}
            position={{ lat: waypoint.lat, lng: waypoint.lng }}
            label={(waypoint.index + 1).toString()}
            draggable
            onDragEnd={(e) => onMarkerDragEnd(waypoint.id, e)}
          />
        ))}

        {/* Mission path polyline */}
        {mission.waypoints.length > 1 && (
          <Polyline
            path={pathCoordinates}
            options={{
              strokeColor: '#FF0000',
              strokeOpacity: 0.8,
              strokeWeight: 3,
            }}
          />
        )}
      </GoogleMap>
    </div>
  );
}



