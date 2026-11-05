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
}
// 中心だけの指定は従来の半径3km検索。
export type SearchArea = MapPoint | MapViewport

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
  return (
    validPoint(view.center) &&
    Number.isFinite(view.zoom) &&
    validPoint({ lat: north, lng: east }) &&
    validPoint({ lat: south, lng: west }) &&
    north > south &&
    longitudeWidth(view.bounds) > 0
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
      ].join(':')
    : ['radius', coordinate(center.lat), coordinate(center.lng), 3000].join(':')
}
