export type MapPoint = { lat: number; lng: number }

export type MapConfig = { apiKey: string; mapId: string }

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
  }
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
