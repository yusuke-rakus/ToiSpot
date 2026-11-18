import { distanceBetween } from 'geofire-common'
import type { MapPoint } from './map-config'

export type MapBounds = {
  north: number
  south: number
  east: number
  west: number
}
export type MapViewport = {
  center: MapPoint
  bounds: MapBounds
  zoom: number
  radiusMeters?: number
}
// 中心だけの指定は従来の半径3km検索。
export type SearchArea = MapPoint | MapViewport
export const MAX_NEARBY_RADIUS_METERS = 50_000

export function isViewport(area: SearchArea): area is MapViewport {
  return 'bounds' in area
}

export function areaCenter(area: SearchArea): MapPoint {
  return isViewport(area) ? area.center : area
}

export function validPoint(point: MapPoint) {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  )
}

export function validViewport(view: MapViewport) {
  const { north, south, east, west } = view.bounds
  const width = longitudeWidth(view.bounds)
  const centerOffset = (view.center.lng - west + 360) % 360
  return (
    validPoint(view.center) &&
    Number.isFinite(view.zoom) &&
    validPoint({ lat: north, lng: east }) &&
    validPoint({ lat: south, lng: west }) &&
    view.center.lat > south &&
    view.center.lat < north &&
    (width === 360 || (centerOffset > 0 && centerOffset < width)) &&
    (view.radiusMeters === undefined ||
      (view.radiusMeters > 0 && view.radiusMeters <= MAX_NEARBY_RADIUS_METERS))
  )
}

export function containsPoint(bounds: MapBounds, point: MapPoint) {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    (bounds.west <= bounds.east
      ? point.lng >= bounds.west && point.lng <= bounds.east
      : point.lng >= bounds.west || point.lng <= bounds.east)
  )
}

export function pointDistance(a: MapPoint, b: MapPoint) {
  return distanceBetween([a.lat, a.lng], [b.lat, b.lng]) * 1000
}

function longitudeWidth(bounds: MapBounds) {
  return bounds.east >= bounds.west
    ? bounds.east - bounds.west
    : bounds.east + 360 - bounds.west
}

function wrapLongitude(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

export function boundsCenter(bounds: MapBounds): MapPoint {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lng: wrapLongitude(bounds.west + longitudeWidth(bounds) / 2),
  }
}

export function coveringRadius(
  bounds: MapBounds,
  center = boundsCenter(bounds),
) {
  return Math.max(
    ...[bounds.north, bounds.south].flatMap((lat) =>
      [bounds.east, bounds.west].map((lng) =>
        pointDistance(center, { lat, lng }),
      ),
    ),
  )
}

export function viewportSearchRadius({ bounds, center }: MapViewport) {
  const radiansPerDegree = Math.PI / 180
  const latitude = center.lat * radiansPerDegree
  const distanceToMeridian = (lng: number) => {
    const longitudeCosine = Math.cos((lng - center.lng) * radiansPerDegree)
    // 経度差が90度以上なら、極に達する前に北端か南端に達する。
    if (longitudeCosine < 0) return Infinity
    // 東西の辺への最短点は、地図の中心と同じ緯度とは限らない。
    const lat =
      Math.atan2(Math.sin(latitude), Math.cos(latitude) * longitudeCosine) /
      radiansPerDegree
    return pointDistance(center, { lat, lng })
  }
  const distanceToSide =
    longitudeWidth(bounds) === 360
      ? Infinity
      : Math.min(
          distanceToMeridian(bounds.west),
          distanceToMeridian(bounds.east),
        )
  return Math.min(
    MAX_NEARBY_RADIUS_METERS,
    pointDistance(center, { lat: bounds.north, lng: center.lng }),
    pointDistance(center, { lat: bounds.south, lng: center.lng }),
    distanceToSide,
  )
}

export function splitBounds(bounds: MapBounds, origin: MapPoint): MapBounds[] {
  const middle = boundsCenter(bounds)
  return [
    { ...bounds, south: middle.lat, east: middle.lng },
    { ...bounds, south: middle.lat, west: middle.lng },
    { ...bounds, north: middle.lat, east: middle.lng },
    { ...bounds, north: middle.lat, west: middle.lng },
  ].sort(
    (a, b) =>
      pointDistance(boundsCenter(a), origin) -
      pointDistance(boundsCenter(b), origin),
  )
}

export function searchAreaKey(area: SearchArea) {
  const center = areaCenter(area)
  // SDKの浮動小数点の揺れだけで再取得しない（座標は約1m単位）。
  const coordinate = (value: number) => value.toFixed(5)
  return isViewport(area)
    ? [
        'viewport',
        coordinate(center.lat),
        coordinate(center.lng),
        ...[
          area.bounds.north,
          area.bounds.south,
          area.bounds.east,
          area.bounds.west,
        ].map(coordinate),
        area.zoom.toFixed(3),
        area.radiusMeters?.toFixed(2),
      ].join(':')
    : ['radius', coordinate(center.lat), coordinate(center.lng), 3000].join(':')
}
