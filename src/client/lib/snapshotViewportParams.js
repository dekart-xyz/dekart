import { updateMap } from '@kepler.gl/actions'
import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

const minZoom = 0
const maxZoom = 24

function parseNumberParam (params, name) {
  const rawValue = params.get(name)
  if (rawValue == null || rawValue.trim() === '') {
    return null
  }
  const value = Number(rawValue)
  return Number.isFinite(value) ? value : null
}

function validZoom (zoom) {
  return zoom >= minZoom && zoom <= maxZoom
}

function validLat (lat) {
  return lat >= -90 && lat <= 90
}

function validLon (lon) {
  return lon >= -180 && lon <= 180
}

// getSnapshotViewportParams returns valid transient map overrides from URL params.
export function getSnapshotViewportParams (search = window.location.search) {
  const params = new URLSearchParams(search)
  const viewport = {}
  const zoom = parseNumberParam(params, 'zoom')
  if (zoom != null && validZoom(zoom)) {
    viewport.zoom = zoom
  }

  const lat = parseNumberParam(params, 'lat')
  const lon = parseNumberParam(params, 'lon')
  if (lat != null && lon != null && validLat(lat) && validLon(lon)) {
    viewport.latitude = lat
    viewport.longitude = lon
  }

  return Object.keys(viewport).length > 0 ? viewport : null
}

// getSnapshotViewportMapUpdate returns only the map fields that still need to move.
export function getSnapshotViewportMapUpdate (currentMapState, snapshotViewportParams) {
  const mapUpdate = {}
  if (snapshotViewportParams.zoom != null && currentMapState.zoom !== snapshotViewportParams.zoom) {
    mapUpdate.zoom = snapshotViewportParams.zoom
  }
  if (
    snapshotViewportParams.latitude != null &&
    snapshotViewportParams.longitude != null &&
    (
      currentMapState.latitude !== snapshotViewportParams.latitude ||
      currentMapState.longitude !== snapshotViewportParams.longitude
    )
  ) {
    mapUpdate.latitude = snapshotViewportParams.latitude
    mapUpdate.longitude = snapshotViewportParams.longitude
  }
  return mapUpdate
}

// useSnapshotViewportOverride applies URL viewport params once and reports when snapshots may render.
export function useSnapshotViewportOverride (snapshot, reportId, setSnapshotBasemapReady) {
  const dispatch = useDispatch()
  const report = useSelector(state => state.report)
  const keplerMapState = useSelector(state => state.keplerGl.kepler?.mapState)
  const snapshotViewportParams = useMemo(() => snapshot ? getSnapshotViewportParams() : null, [snapshot])
  const [snapshotViewportApplied, setSnapshotViewportApplied] = useState(!snapshotViewportParams)

  useEffect(() => {
    if (!snapshot || !snapshotViewportParams || report?.id !== reportId || !keplerMapState) {
      setSnapshotViewportApplied(!snapshot || !snapshotViewportParams)
      return
    }

    const mapUpdate = getSnapshotViewportMapUpdate(keplerMapState, snapshotViewportParams)
    if (Object.keys(mapUpdate).length > 0) {
      // why: Browserless should wait for map idle after the viewport override moves the basemap.
      setSnapshotViewportApplied(false)
      setSnapshotBasemapReady(false)
      dispatch(updateMap(mapUpdate))
      return
    }

    setSnapshotViewportApplied(true)
  }, [dispatch, keplerMapState, report?.id, reportId, setSnapshotBasemapReady, snapshot, snapshotViewportParams])

  return snapshotViewportApplied
}
