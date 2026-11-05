import { useCallback, useEffect, useRef } from 'react'
import type { MapPoint } from './map-config'
import { searchAreaKey, validViewport, type MapViewport } from './search-area'

export function useViewportSearch({
  map,
  enabled,
  ready,
  minZoom,
  onSearch,
  onSuspend,
}: {
  map: google.maps.Map | null
  enabled: boolean
  ready: boolean
  minZoom: number
  onSearch: (viewport: MapViewport) => void
  // nullはプログラム移動の完了、falseは操作中、trueは縮小による停止。
  onSuspend: (paused: boolean | null) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRequested = useRef<string | null>(null)
  const lastViewport = useRef<MapViewport | null>(null)
  const suppressed = useRef<{ center: MapPoint; zoom: number } | null>(null)
  const previousMap = useRef(map)
  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const readViewport = useCallback((): MapViewport | null => {
    const center = map?.getCenter()?.toJSON()
    const bounds = map?.getBounds()?.toJSON()
    const zoom = map?.getZoom()
    if (!center || !bounds || zoom === undefined) return null
    const viewport = { center, bounds, zoom }
    return validViewport(viewport) ? viewport : null
  }, [map])

  useEffect(() => {
    if (
      map &&
      previousMap.current &&
      map !== previousMap.current &&
      lastRequested.current !== null
    )
      suppressed.current = lastViewport.current
    previousMap.current = map
  }, [map])

  const onChange = useCallback(
    (viewport: MapViewport) => {
      if (!enabled || !ready) return
      clearTimer()
      if (suppressed.current) return
      if (
        viewport.zoom >= minZoom &&
        searchAreaKey(viewport) === lastRequested.current
      )
        return
      lastRequested.current = null
      onSuspend(viewport.zoom < minZoom)
    },
    [enabled, ready, clearTimer, minZoom, onSuspend],
  )

  const onIdle = useCallback(() => {
    if (!enabled || !ready) return
    const viewport = readViewport()
    if (!viewport) {
      clearTimer()
      onSuspend(false)
      return
    }
    lastViewport.current = viewport
    const expected = suppressed.current
    suppressed.current = null
    if (
      expected &&
      Math.abs(viewport.center.lat - expected.center.lat) < 0.00001 &&
      Math.abs(viewport.center.lng - expected.center.lng) < 0.00001 &&
      Math.abs(viewport.zoom - expected.zoom) < 0.001
    ) {
      clearTimer()
      lastRequested.current = searchAreaKey(viewport)
      onSuspend(viewport.zoom < minZoom ? true : null)
      return
    }
    if (viewport.zoom < minZoom) {
      clearTimer()
      lastRequested.current = null
      onSuspend(true)
      return
    }
    const key = searchAreaKey(viewport)
    if (lastRequested.current === key) return
    clearTimer()
    onSuspend(false)
    timer.current = setTimeout(() => {
      timer.current = null
      lastRequested.current = key
      onSearch(viewport)
    }, 300)
  }, [enabled, ready, readViewport, clearTimer, minZoom, onSearch, onSuspend])

  useEffect(() => {
    onIdle()
    return clearTimer
  }, [onIdle, clearTimer])

  const searchNow = useCallback(() => {
    if (!enabled || !ready) return
    const viewport = readViewport()
    if (!viewport || viewport.zoom < minZoom) return
    clearTimer()
    suppressed.current = null
    lastViewport.current = viewport
    lastRequested.current = searchAreaKey(viewport)
    onSearch(viewport)
  }, [enabled, ready, readViewport, minZoom, clearTimer, onSearch])

  const suppressPan = useCallback(
    (center: MapPoint, zoom: number) => {
      if (!enabled) return
      clearTimer()
      suppressed.current = { center, zoom }
    },
    [enabled, clearTimer],
  )
  const onDragStart = useCallback(() => {
    suppressed.current = null
    const viewport = readViewport()
    if (viewport) onChange(viewport)
  }, [readViewport, onChange])
  return { onChange, onIdle, searchNow, suppressPan, onDragStart }
}
