import { distanceBetween } from 'geofire-common'
import type { MapPoint } from '@/features/map/map-config'
import {
  storeDocumentSchema,
  STORE_DISPLAY_LIMIT,
  type Store,
  type StoreListResult,
} from './store-schema'

export const NEARBY_RADIUS_KM = 3

// 各範囲の101件目は超過判定専用。重複と矩形検索の範囲外候補を除く。
export function collectNearbyStores(
  batches: ReadonlyArray<ReadonlyArray<{ id: string; data: unknown }>>,
  center: MapPoint,
): StoreListResult {
  const seen = new Set<string>()
  const matches: { store: Store; distance: number }[] = []
  let invalidCount = 0
  let truncated = false
  for (const batch of batches) {
    if (batch.length > STORE_DISPLAY_LIMIT) truncated = true
    for (const document of batch.slice(0, STORE_DISPLAY_LIMIT)) {
      if (seen.has(document.id)) continue
      seen.add(document.id)
      const parsed = storeDocumentSchema.safeParse(document.data)
      if (!parsed.success) {
        invalidCount += 1
        continue
      }
      const { lat, lng } = parsed.data.location
      const distance = distanceBetween([center.lat, center.lng], [lat, lng])
      if (distance <= NEARBY_RADIUS_KM)
        matches.push({ store: { ...parsed.data, id: document.id }, distance })
    }
  }
  matches.sort(
    (a, b) => a.distance - b.distance || a.store.id.localeCompare(b.store.id),
  )
  return {
    stores: matches.slice(0, STORE_DISPLAY_LIMIT).map(({ store }) => store),
    invalidCount,
    truncated: truncated || matches.length > STORE_DISPLAY_LIMIT,
  }
}
