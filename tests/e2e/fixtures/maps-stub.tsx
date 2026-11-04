// E2Eだけで差し替えるMapsの境界。実Google SDKやネットワークへ接続しない。
import { useEffect, type CSSProperties, type ReactNode } from 'react'

export const APILoadingStatus = {
  LOADED: 'LOADED',
  AUTH_FAILURE: 'AUTH_FAILURE',
  FAILED: 'FAILED',
}
export const useApiLoadingStatus = () => 'LOADED'
let center = { lat: 35.681236, lng: 139.767125 }
const map = {
  panTo: (point: typeof center) => {
    center = point
  },
  setZoom: () => {},
  getZoom: () => 15,
  getCenter: () => ({ toJSON: () => center }),
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
}: {
  children: ReactNode
  onTilesLoaded: () => void
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
    }
  }) => void
}) {
  useEffect(() => {
    onTilesLoaded()
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
          bottom: 64,
          right: 12,
          background: 'var(--background)',
          color: 'var(--foreground)',
          padding: 8,
          fontSize: 12,
        }}
        onClick={() => {
          center = { lat: 35.69, lng: 139.78 }
          onCameraChanged({ detail: { center, zoom: 17, heading: 0, tilt: 0 } })
          onIdle()
        }}
      >
        地図を移動
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
export function Pin({
  background,
  borderColor,
  glyphColor,
  scale = 1,
}: {
  background: string
  borderColor: string
  glyphColor: string
  scale?: number
}) {
  return (
    <svg
      width={28 * scale}
      height={38 * scale}
      viewBox="0 0 28 38"
      aria-hidden="true"
    >
      <path
        d="M14 37C11 30 1 24 1 14a13 13 0 0 1 26 0c0 10-10 16-13 23Z"
        fill={background}
        stroke={borderColor}
      />
      <circle cx="14" cy="14" r="5" fill={glyphColor} />
    </svg>
  )
}
