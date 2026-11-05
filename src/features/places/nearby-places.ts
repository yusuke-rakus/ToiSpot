import { useCallback, useEffect, useRef, useState } from 'react'
import { googlePlaceIdSchema } from '../stores/store-schema'
import {
  DEFAULT_PLACES_CONFIG,
  type MapPoint,
  type PlacesConfig,
} from '../map/map-config'
import {
  boundsCenter,
  containsPoint,
  coveringRadius,
  isViewport,
  pointDistance,
  searchAreaKey,
  splitBounds,
  validPoint,
  validViewport,
  type MapBounds,
  type MapViewport,
  type SearchArea,
} from '../map/search-area'

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
  partialError: boolean
}

// 世代をまたいでも送信済み通信は枠を保持する。中断済みの待機要求は送らない。
let runningRequests = 0
const waitingRequests: (() => void)[] = []
function nearbyRequest(
  center: MapPoint,
  radius: number,
  signal?: AbortSignal,
): Promise<google.maps.places.Place[]> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      const index = waitingRequests.indexOf(start)
      if (index >= 0) waitingRequests.splice(index, 1)
      reject(new DOMException('Search cancelled', 'AbortError'))
    }
    const start = () => {
      if (signal?.aborted) {
        signal.removeEventListener('abort', abort)
        abort()
        return
      }
      runningRequests += 1
      void (async () => {
        try {
          const { Place } = (await google.maps.importLibrary(
            'places',
          )) as google.maps.PlacesLibrary
          signal?.throwIfAborted()
          const result = await Place.searchNearby({
            fields: [
              'id',
              'displayName',
              'formattedAddress',
              'location',
              'attributions',
            ],
            includedTypes: ['convenience_store'],
            locationRestriction: { center, radius },
            rankPreference: 'DISTANCE',
            maxResultCount: PLACE_DISPLAY_LIMIT,
            language: 'ja',
            region: 'jp',
          })
          signal?.throwIfAborted()
          resolve(result.places.slice(0, PLACE_DISPLAY_LIMIT))
        } catch (error) {
          reject(error)
        } finally {
          signal?.removeEventListener('abort', abort)
          runningRequests -= 1
          waitingRequests.shift()?.()
        }
      })()
    }
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (runningRequests < 2) start()
    else waitingRequests.push(start)
  })
}

function normalizePlaces(places: google.maps.places.Place[]) {
  const unique = new Map<string, ConveniencePlace>()
  for (const place of places) {
    if (!googlePlaceIdSchema.safeParse(place.id).success || !place.location)
      continue
    const location = place.location.toJSON()
    if (!validPoint(location)) continue
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
  return [...unique.values()]
}

// 検索結果は画面内で保持し、管理者が選択した店舗だけを登録フォームへ渡す。
export async function searchConveniencePlaces(
  center: MapPoint,
  signal?: AbortSignal,
) {
  const places = await nearbyRequest(center, 3000, signal)
  return {
    places: normalizePlaces(places),
    limited: places.length >= PLACE_DISPLAY_LIMIT,
    partialError: false,
  }
}

export async function searchViewportPlaces(
  viewport: MapViewport,
  config: PlacesConfig = DEFAULT_PLACES_CONFIG,
  signal?: AbortSignal,
) {
  if (!validViewport(viewport)) throw new Error('Invalid search viewport')
  const maxRequests = config.expandedSearch ? config.maxRequests : 1
  const maxResults = config.expandedSearch
    ? config.maxResults
    : PLACE_DISPLAY_LIMIT
  type Cell = { bounds: MapBounds; depth: number; center: MapPoint }
  const queue: Cell[] = [
    { bounds: viewport.bounds, center: viewport.center, depth: 0 },
  ]
  const unique = new Map<string, ConveniencePlace>()
  let issued = 0
  let succeeded = 0
  let partialError = false
  let limited = false
  const children = (cell: Cell) =>
    splitBounds(cell.bounds, viewport.center).map((bounds) => ({
      bounds,
      center: boundsCenter(bounds),
      depth: cell.depth + 1,
    }))

  while (queue.length && issued < maxRequests && unique.size < maxResults) {
    signal?.throwIfAborted()
    const batch: Cell[] = []
    while (queue.length && batch.length < Math.min(2, maxRequests - issued)) {
      const cell = queue.shift()!
      const radius = coveringRadius(cell.bounds, cell.center)
      if (radius > 50_000) {
        // 巨大な表示範囲も、実際に検索するセルだけを遅延分割する。
        if (cell.depth < 24) queue.unshift(...children(cell))
        else limited = true
        continue
      }
      if (radius <= 0) {
        limited = true
        continue
      }
      batch.push(cell)
    }
    if (!batch.length) break
    issued += batch.length
    const responses = await Promise.allSettled(
      batch.map((cell) =>
        nearbyRequest(
          cell.center,
          coveringRadius(cell.bounds, cell.center),
          signal,
        ),
      ),
    )
    signal?.throwIfAborted()
    responses.forEach((response, index) => {
      if (response.status === 'rejected') {
        partialError = true
        return
      }
      succeeded += 1
      for (const place of normalizePlaces(response.value)) {
        if (containsPoint(viewport.bounds, place.location))
          unique.set(place.id, place)
      }
      if (response.value.length >= PLACE_DISPLAY_LIMIT) {
        if (config.expandedSearch && batch[index].depth < 24)
          queue.push(...children(batch[index]))
        else limited = true
      }
    })
    queue.sort(
      (a, b) =>
        a.depth - b.depth ||
        pointDistance(a.center, viewport.center) -
          pointDistance(b.center, viewport.center),
    )
  }
  if (!succeeded) throw new Error('Places search failed')
  return {
    places: [...unique.values()]
      .sort(
        (a, b) =>
          pointDistance(a.location, viewport.center) -
            pointDistance(b.location, viewport.center) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, maxResults),
    limited: limited || queue.length > 0 || unique.size >= maxResults,
    partialError,
  }
}

const initialState: PlacesSearchState = {
  requestId: 0,
  status: 'idle',
  places: [],
  limited: false,
  partialError: false,
}

export function useNearbyPlaces() {
  const [state, setState] = useState(initialState)
  const completed = useRef(initialState)
  const generation = useRef(0)
  const active = useRef<{ key: string; controller: AbortController } | null>(
    null,
  )
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      active.current?.controller.abort()
      active.current = null
    }
  }, [])
  const cancel = useCallback(() => {
    if (!active.current) return
    generation.current += 1
    active.current.controller.abort()
    active.current = null
    setState(completed.current)
  }, [])
  const search = useCallback(
    async (area: SearchArea, config: PlacesConfig = DEFAULT_PLACES_CONFIG) => {
      const key =
        searchAreaKey(area) +
        ':' +
        config.expandedSearch +
        ':' +
        config.maxResults +
        ':' +
        config.maxRequests
      if (active.current?.key === key) return
      active.current?.controller.abort()
      const controller = new AbortController()
      active.current = { key, controller }
      const request = ++generation.current
      const retain = isViewport(area)
      setState((previous) => ({
        ...(retain ? previous : initialState),
        requestId: retain ? previous.requestId : request,
        status: 'loading',
      }))
      try {
        const result = isViewport(area)
          ? await searchViewportPlaces(area, config, controller.signal)
          : await searchConveniencePlaces(area, controller.signal)
        if (mounted.current && request === generation.current) {
          completed.current = {
            requestId: request,
            status: 'success',
            ...result,
          }
          setState(completed.current)
        }
      } catch {
        // APIエラー本文やURLはキーを含み得るため表示・記録しない。
        if (mounted.current && request === generation.current) {
          completed.current = {
            ...(retain ? completed.current : initialState),
            requestId: retain ? completed.current.requestId : request,
            status: 'error',
          }
          setState(completed.current)
        }
      } finally {
        if (request === generation.current) active.current = null
      }
    },
    [],
  )
  return { ...state, search, cancel }
}
