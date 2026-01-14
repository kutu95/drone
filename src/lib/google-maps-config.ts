/**
 * Shared Google Maps API loader configuration
 * All components should use this to ensure consistent loading and avoid conflicts
 */

export const GOOGLE_MAPS_LOADER_CONFIG = {
  id: 'google-maps-script',
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  libraries: ['maps', 'drawing', 'geometry'] as ('maps' | 'drawing' | 'geometry')[], // Include all commonly used libraries
};

