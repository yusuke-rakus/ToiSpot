import { useCallback, useEffect, useRef, useState } from 'react'
import { googlePlaceIdSchema } from '../stores/store-schema'
import type { MapPoint } from '../map/map-config'

export const PLACE_DISPLAY_LIMIT = 20
export type ConveniencePlace = {
  id: string
  name: string
  address: string
  location: MapPoint
  attributions: { provider: string; uri?: string }[]
}
export type PlacesSearchState = {
  requestId: number
  status: 'idle' | 'loading' | 'success' | 'error'
  places: ConveniencePlace[]
  limited: boolean
}

// 検索結果は画面内で保持し、管理者が選択した店舗だけを登録フォームへ渡す。
export async function searchConveniencePlaces(center: MapPoint) {
  const { Place } = (await google.maps.importLibrary(
    'places',
  )) as google.maps.PlacesLibrary
  const { places } = await Place.searchNearby({
    fields: [
      'id',
      'displayName',
      'formattedAddress',
      'location',
      'attributions',
    ],
    includedTypes: ['convenience_store'],
    locationRestriction: { center, radius: 3000 },
    rankPreference: 'DISTANCE',
    maxResultCount: PLACE_DISPLAY_LIMIT,
    language: 'ja',
    region: 'jp',
  })
  const unique = new Map<string, ConveniencePlace>()
  for (const place of places.slice(0, PLACE_DISPLAY_LIMIT)) {
    if (!googlePlaceIdSchema.safeParse(place.id).success || !place.location)
      continue
    const location = place.location.toJSON()
    if (
      !Number.isFinite(location.lat) ||
      !Number.isFinite(location.lng) ||
      Math.abs(location.lat) > 90 ||
      Math.abs(location.lng) > 180
    )
      continue
    unique.set(place.id, {
      id: place.id,
      name: place.displayName || '名称不明のコンビニ',
      address: place.formattedAddress || '住所の情報はありません',
      location,
      attributions: (place.attributions ?? []).map(
        ({ provider, providerURI }) => ({
          provider: provider ?? '情報提供元',
          ...(providerURI ? { uri: providerURI } : {}),
        }),
      ),
    })
  }
  return {
    places: [...unique.values()],
    limited: places.length >= PLACE_DISPLAY_LIMIT,
  }
}

export function useNearbyPlaces() {
  const [state, setState] = useState<PlacesSearchState>({
    requestId: 0,
    status: 'idle',
    places: [],
    limited: false,
  })
  const generation = useRef(0)
  const active = useRef<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      active.current = null
    }
  }, [])
  const search = useCallback(async (center: MapPoint) => {
    const key = `${center.lat},${center.lng}`
    if (active.current === key) return
    active.current = key
    const request = ++generation.current
    setState({
      requestId: request,
      status: 'loading',
      places: [],
      limited: false,
    })
    try {
      const result = await searchConveniencePlaces(center)
      if (mounted.current && request === generation.current)
        setState({ requestId: request, status: 'success', ...result })
    } catch {
      // APIエラー本文やURLはキーを含み得るため表示・記録しない。
      if (mounted.current && request === generation.current)
        setState({
          requestId: request,
          status: 'error',
          places: [],
          limited: false,
        })
    } finally {
      if (request === generation.current) active.current = null
    }
  }, [])
  return { ...state, search }
}
