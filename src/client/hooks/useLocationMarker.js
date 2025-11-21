import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

export function useLocationMarker (mapInstanceRef, location) {
  const markerRef = useRef(null)

  useEffect(() => {
    const map = mapInstanceRef?.current
    if (!map) {
      return
    }

    // Create marker if it doesn't exist
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker()
        .setLngLat([0, 0])
        .addTo(map)
    }

    // Update marker position if location is provided
    if (location && location.longitude !== null && location.latitude !== null) {
      markerRef.current.setLngLat([location.longitude, location.latitude])
    }

    // Cleanup function
    return () => {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
    }
  }, [mapInstanceRef, location])
}
