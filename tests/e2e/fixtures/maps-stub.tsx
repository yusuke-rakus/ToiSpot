// E2Eだけで差し替えるMapsの境界。実Google SDKやネットワークへ接続しない。
import { useEffect, type CSSProperties, type ReactNode } from 'react'

export const APILoadingStatus = {
  LOADED: 'LOADED',
  AUTH_FAILURE: 'AUTH_FAILURE',
  FAILED: 'FAILED',
}
export const useApiLoadingStatus = () => 'LOADED'
let center = { lat: 35.681236, lng: 139.767125 }
let mapZoom = 15
let notifyCamera: (() => void) | null = null
function bounds() {
  const extent = 0.02 * 2 ** (14 - mapZoom)
  return {
    north: center.lat + extent,
    south: center.lat - extent,
    east: center.lng + extent,
    west: center.lng - extent,
  }
}
const map = {
  panTo: (point: typeof center) => {
    center = point
    queueMicrotask(() => notifyCamera?.())
  },
  setZoom: (zoom: number) => {
    mapZoom = zoom
    queueMicrotask(() => notifyCamera?.())
  },
  getZoom: () => mapZoom,
  getCenter: () => ({ toJSON: () => center }),
  getBounds: () => ({ toJSON: bounds }),
}
export const useMap = () => map
export const APIProvider = ({ children }: { children: ReactNode }) => children
export function Map({
  children,
  onTilesLoaded,
  onIdle,
  style,
  colorScheme,
  center: cameraCenter,
  zoom,
  onCameraChanged,
  onDragstart,
}: {
  children: ReactNode
  onTilesLoaded: (event: { map: typeof map }) => void
  onIdle: () => void
  style: CSSProperties
  colorScheme: string
  center: typeof center
  zoom: number
  onCameraChanged: (event: {
    detail: {
      center: typeof center
      zoom: number
      heading: number
      tilt: number
      bounds: ReturnType<typeof bounds>
    }
  }) => void
  onDragstart?: () => void
}) {
  useEffect(() => {
    const notify = () => {
      onCameraChanged({
        detail: {
          center,
          zoom: mapZoom,
          heading: 0,
          tilt: 0,
          bounds: bounds(),
        },
      })
      onIdle()
    }
    notifyCamera = notify
    return () => {
      if (notifyCamera === notify) notifyCamera = null
    }
  }, [onCameraChanged, onIdle])
  useEffect(() => {
    onTilesLoaded({ map })
  }, [onTilesLoaded])
  return (
    <div
      aria-label="周辺の地図"
      data-color-scheme={colorScheme}
      data-center={JSON.stringify(cameraCenter)}
      data-zoom={zoom}
      style={{
        ...style,
        position: 'relative',
        backgroundColor: colorScheme === 'DARK' ? '#202a25' : '#e8eee8',
        backgroundImage: `linear-gradient(25deg, transparent 44%, ${colorScheme === 'DARK' ? '#3a4941' : '#fff'} 45%, ${colorScheme === 'DARK' ? '#3a4941' : '#fff'} 48%, transparent 49%),linear-gradient(90deg, transparent 45%, ${colorScheme === 'DARK' ? '#3a4941' : '#fff'} 46%, ${colorScheme === 'DARK' ? '#3a4941' : '#fff'} 49%, transparent 50%)`,
        backgroundSize: '130px 150px',
      }}
    >
      {children}
      <button
        style={{
          position: 'absolute',
          top: 128,
          right: 12,
          background: 'var(--background)',
          color: 'var(--foreground)',
          padding: 8,
          fontSize: 12,
        }}
        onClick={() => {
          onDragstart?.()
          center = { lat: center.lat + 0.01, lng: center.lng + 0.01 }
          mapZoom = 17
          notifyCamera?.()
        }}
      >
        地図を移動
      </button>
      <button
        style={{
          position: 'absolute',
          top: 168,
          right: 12,
          background: 'var(--background)',
          color: 'var(--foreground)',
          padding: 8,
          fontSize: 12,
        }}
        onClick={() => {
          mapZoom = 12
          notifyCamera?.()
        }}
      >
        地図を縮小
      </button>
      <button
        style={{
          position: 'absolute',
          top: 208,
          right: 12,
          background: 'var(--background)',
          color: 'var(--foreground)',
          padding: 8,
          fontSize: 12,
        }}
        onClick={() => {
          mapZoom = 13
          notifyCamera?.()
        }}
      >
        地図を拡大
      </button>
      <span style={{ position: 'absolute', bottom: 4, right: 8, fontSize: 10 }}>
        Google Maps（テスト表示）
      </span>
    </div>
  )
}
export function AdvancedMarker({
  children,
  position,
  title,
  onClick,
  zIndex = 1,
}: {
  children: ReactNode
  position: typeof center
  title: string
  onClick?: () => void
  zIndex?: number
}) {
  const style: CSSProperties = {
    position: 'absolute',
    left: `${50 + (position.lng - 139.767125) * 1000}%`,
    top: `${50 - (position.lat - 35.681236) * 1800}%`,
    transform: 'translate(-50%, -100%)',
    zIndex,
  }
  return onClick ? (
    <button aria-label={title} style={style} onClick={onClick}>
      {children}
    </button>
  ) : (
    <div aria-label={title} style={style}>
      {children}
    </div>
  )
}
