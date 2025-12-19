import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'

// Default San Francisco center coordinates
const DEFAULT_MAP_STATE = {
  longitude: -122.4194,
  latitude: 37.7749,
  zoom: 10
}

function parseMapState (mapConfigStr) {
  try {
    const mapConfig = JSON.parse(mapConfigStr)
    return mapConfig?.config?.mapState
  } catch {
    return null
  }
}

function buildMapboxUrl (longitude, latitude, zoom, token) {
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${longitude},${latitude},${zoom}/320x240?access_token=${token}`
}

async function loadStaticMapboxPreview (mapState, mapboxToken, cancelledRef) {
  if (!mapState || mapState.longitude == null || mapState.latitude == null || mapState.zoom == null) {
    return null
  }

  if (!mapboxToken) {
    return null
  }

  const mapboxUrl = buildMapboxUrl(mapState.longitude, mapState.latitude, mapState.zoom, mapboxToken)
  const mapboxResponse = await fetch(mapboxUrl)

  if (cancelledRef.current) {
    return null
  }

  if (!mapboxResponse.ok) {
    return null
  }

  const mapboxImage = await mapboxResponse.blob()

  if (cancelledRef.current) {
    return null
  }

  return URL.createObjectURL(mapboxImage)
}

function buildAuthHeaders (token, claimEmailCookie) {
  const headers = new Headers()

  if (token) {
    headers.append('Authorization', `Bearer ${token.access_token}`)
  }

  if (claimEmailCookie) {
    headers.append('X-Dekart-Claim-Email', claimEmailCookie)
  }

  return headers
}

async function loadServerPreview (reportId, host, token, claimEmailCookie, cancelledRef) {
  const url = `${host}/map-preview/${reportId}.png`
  const headers = buildAuthHeaders(token, claimEmailCookie)

  const res = await fetch(url, {
    method: 'GET',
    headers,
    credentials: 'include'
  })

  if (cancelledRef.current) {
    return null
  }

  if (!res.ok) {
    throw new Error(`Failed to load preview: ${res.status}`)
  }

  const blob = await res.blob()

  if (cancelledRef.current) {
    return null
  }

  return URL.createObjectURL(blob)
}

export function useMapPreview (report, shouldLoad = true) {
  const reportId = report.id
  const token = useSelector(state => state.token)
  const claimEmailCookie = useSelector(state => state.user.claimEmailCookie)
  const env = useSelector(state => state.env)
  const { VITE_API_HOST } = import.meta.env
  const host = VITE_API_HOST || ''

  const [previewError, setPreviewError] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(shouldLoad)
  const [previewUrl, setPreviewUrl] = useState(null)
  const blobUrlRef = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!shouldLoad) {
      return
    }

    cancelledRef.current = false
    blobUrlRef.current = null

    async function loadPreview () {
      try {
        setPreviewLoading(true)
        setPreviewError(false)

        // If there's a server preview, load it
        if (report.hasMapPreview) {
          const serverPreviewUrl = await loadServerPreview(reportId, host, token, claimEmailCookie, cancelledRef)

          if (serverPreviewUrl) {
            blobUrlRef.current = serverPreviewUrl
            setPreviewUrl(serverPreviewUrl)
            setPreviewLoading(false)
            return
          }

          // Server preview failed to load
          setPreviewError(true)
          setPreviewLoading(false)
          return
        }

        // If no server preview but we have map config, try to load static base map image
        if (report.mapConfig) {
          const mapState = parseMapState(report.mapConfig)
          const mapboxToken = env.variables?.MAPBOX_TOKEN

          if (mapState && mapboxToken) {
            const staticPreviewUrl = await loadStaticMapboxPreview(mapState, mapboxToken, cancelledRef)

            if (staticPreviewUrl) {
              blobUrlRef.current = staticPreviewUrl
              setPreviewUrl(staticPreviewUrl)
              setPreviewLoading(false)
              return
            }
          }
        }

        // No map config - use San Francisco center as default
        const mapboxToken = env.variables?.MAPBOX_TOKEN
        if (mapboxToken) {
          const staticPreviewUrl = await loadStaticMapboxPreview(DEFAULT_MAP_STATE, mapboxToken, cancelledRef)

          if (staticPreviewUrl) {
            blobUrlRef.current = staticPreviewUrl
            setPreviewUrl(staticPreviewUrl)
            setPreviewLoading(false)
            return
          }
        }

        // Failed to load any preview
        setPreviewLoading(false)
        setPreviewError(true)
      } catch (err) {
        if (cancelledRef.current) {
          return
        }

        console.warn('Map preview failed to load:', err)
        setPreviewError(true)
        setPreviewLoading(false)
      }
    }

    loadPreview()

    return function cleanup () {
      cancelledRef.current = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [shouldLoad, reportId, token, claimEmailCookie, host, report.hasMapPreview, report.mapConfig, env])

  return {
    previewUrl,
    previewLoading,
    previewError,
    setPreviewLoading,
    setPreviewError
  }
}
