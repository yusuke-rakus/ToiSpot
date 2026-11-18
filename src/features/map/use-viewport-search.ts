import { useCallback, useEffect, useRef } from 'react'
import type { MapPoint } from './map-config'
import { searchAreaKey, validViewport, type MapViewport } from './search-area'

export function useViewportSearch({
  map,
  autoSearch,
  ready,
  minZoom,
  onSearch,
  onSuspend,
}: {
  map: google.maps.Map | null
  autoSearch: boolean
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
  const panTarget = useRef<{ center: MapPoint; zoom: number } | null>(null)
  const pendingSearch = useRef(true)
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
      if (!ready || (!autoSearch && !pendingSearch.current)) return
      clearTimer()
      if (suppressed.current) return
      if (
        viewport.zoom >= minZoom &&
        searchAreaKey(viewport) === lastRequested.current
      )
        return
      lastRequested.current = null
      onSuspend(autoSearch && viewport.zoom < minZoom)
    },
    [autoSearch, ready, clearTimer, minZoom, onSuspend],
  )

  const onIdle = useCallback(() => {
    if (!ready || (!autoSearch && !pendingSearch.current)) return
    const viewport = readViewport()
    if (!viewport) {
      clearTimer()
      onSuspend(false)
      return
    }
    const target = panTarget.current
    if (target && !matchesCamera(viewport, target)) return
    panTarget.current = null
    const zoomPaused = autoSearch && viewport.zoom < minZoom
    lastViewport.current = viewport
    const expected = suppressed.current
    suppressed.current = null
    if (expected && matchesCamera(viewport, expected)) {
      clearTimer()
      lastRequested.current = searchAreaKey(viewport)
      onSuspend(zoomPaused ? true : null)
      return
    }
    if (zoomPaused) {
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
      pendingSearch.current = false
      lastRequested.current = key
      onSearch(viewport)
    }, 300)
  }, [
    autoSearch,
    ready,
    readViewport,
    clearTimer,
    minZoom,
    onSearch,
    onSuspend,
  ])

  useEffect(() => {
    onIdle()
    return clearTimer
  }, [onIdle, clearTimer])

  const searchNow = useCallback(() => {
    if (!ready) return
    const viewport = readViewport()
    if (!viewport || (autoSearch && viewport.zoom < minZoom)) return
    clearTimer()
    pendingSearch.current = false
    panTarget.current = null
    suppressed.current = null
    lastViewport.current = viewport
    lastRequested.current = searchAreaKey(viewport)
    onSearch(viewport)
  }, [autoSearch, ready, readViewport, minZoom, clearTimer, onSearch])

  const suppressPan = useCallback(
    (center: MapPoint, zoom: number) => {
      if (!autoSearch && !pendingSearch.current) return
      clearTimer()
      suppressed.current = { center, zoom }
    },
    [autoSearch, clearTimer],
  )
  // 目的地への移動は詳細表示の移動と異なり、移動先での検索を許可する。
  const preparePan = useCallback(
    (center: MapPoint, zoom: number) => {
      clearTimer()
      pendingSearch.current = true
      panTarget.current = { center, zoom }
      suppressed.current = null
      lastRequested.current = null
    },
    [clearTimer],
  )
  const onDragStart = useCallback(() => {
    suppressed.current = null
    panTarget.current = null
    const viewport = readViewport()
    if (viewport) onChange(viewport)
  }, [readViewport, onChange])
  return { onChange, onIdle, searchNow, suppressPan, preparePan, onDragStart }
}

function matchesCamera(
  viewport: MapViewport,
  { center, zoom }: { center: MapPoint; zoom: number },
) {
  return (
    Math.abs(viewport.center.lat - center.lat) < 0.00001 &&
    Math.abs(viewport.center.lng - center.lng) < 0.00001 &&
    Math.abs(viewport.zoom - zoom) < 0.001
  )
}
