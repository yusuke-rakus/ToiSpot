export type MapPoint = { lat: number; lng: number }

export type AdminLoginArea = {
  center: MapPoint
  radiusMeters: number
}

export type PlacesConfig = {
  autoSearch: boolean
  expandedSearch: boolean
  minZoom: number
  maxResults: number
  maxRequests: number
}

export const DEFAULT_PLACES_CONFIG: PlacesConfig = {
  autoSearch: false,
  expandedSearch: true,
  minZoom: 13,
  maxResults: 100,
  maxRequests: 9,
}

export type MapConfig = {
  apiKey: string
  mapId: string
  places?: PlacesConfig
  adminLoginArea?: AdminLoginArea
}

// 現在地の取得前・拒否・失敗時は東京駅周辺を表示する。
export const INITIAL_CENTER: MapPoint = { lat: 35.681236, lng: 139.767125 }
export const INITIAL_ZOOM = 14

export function getMapConfig(env: Record<string, unknown>): MapConfig {
  return {
    apiKey:
      typeof env.VITE_GOOGLE_MAPS_API_KEY === 'string'
        ? env.VITE_GOOGLE_MAPS_API_KEY.trim()
        : '',
    mapId:
      (typeof env.VITE_GOOGLE_MAPS_MAP_ID === 'string'
        ? env.VITE_GOOGLE_MAPS_MAP_ID.trim()
        : '') || 'DEMO_MAP_ID',
    adminLoginArea: getAdminLoginArea(env),
    places: {
      autoSearch: booleanSetting(env.VITE_PLACES_AUTO_SEARCH, false),
      expandedSearch: booleanSetting(env.VITE_PLACES_EXPANDED_SEARCH, true),
      minZoom: integerSetting(env.VITE_PLACES_MIN_ZOOM, 13, 0, 22),
      maxResults: integerSetting(env.VITE_PLACES_MAX_RESULTS, 100, 1),
      maxRequests: integerSetting(env.VITE_PLACES_MAX_REQUESTS, 9, 1),
    },
  }
}

function getAdminLoginArea(
  env: Record<string, unknown>,
): AdminLoginArea | undefined {
  const lat = numberSetting(env.VITE_ADMIN_LOGIN_LAT)
  const lng = numberSetting(env.VITE_ADMIN_LOGIN_LNG)
  const radiusMeters = numberSetting(env.VITE_ADMIN_LOGIN_RADIUS_METERS)
  if (
    lat === undefined ||
    Math.abs(lat) > 90 ||
    lng === undefined ||
    Math.abs(lng) > 180 ||
    radiusMeters === undefined ||
    radiusMeters <= 0
  )
    return undefined
  return { center: { lat, lng }, radiusMeters }
}

function numberSetting(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function booleanSetting(value: unknown, fallback: boolean) {
  if (typeof value !== 'string') return fallback
  if (value.trim() === 'true') return true
  if (value.trim() === 'false') return false
  return fallback
}

function integerSetting(
  value: unknown,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  if (typeof value !== 'string' || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback
}

export function locationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return '位置情報の利用が許可されていません。ブラウザの設定を確認するか、地図を移動して「この周辺を検索」を押してください。'
    case 3:
      return '現在地の取得に時間がかかっています。もう一度試すか、地図を移動して「この周辺を検索」を押してください。'
    default:
      return '現在地を取得できませんでした。地図を移動して「この周辺を検索」を押してください。'
  }
}
