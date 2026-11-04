import { distanceBetween } from 'geofire-common'
import type { MapPoint } from '../map/map-config'
import type { Store } from '../stores/store-schema'
import type { ConveniencePlace } from './nearby-places'
import type { PlaceLinks } from './place-links'

export type RegistrationState =
  'registered' | 'missing' | 'checking' | 'unavailable'
export const registrationLabels: Record<RegistrationState, string> = {
  registered: '登録済み',
  missing: 'データなし',
  checking: '登録情報を確認中',
  unavailable: '登録情報を確認できません',
}
export type MapEntry = {
  key: string
  name: string
  location: MapPoint
  registration: RegistrationState
  store?: Store
  place?: ConveniencePlace
}

export function mergeMapEntries(
  stores: Store[],
  places: ConveniencePlace[],
  links: PlaceLinks | undefined,
  linkState: 'ready' | 'checking' | 'unavailable',
  center: MapPoint,
): MapEntry[] {
  const entries = new Map<string, MapEntry>()
  const byPlace = new Map(
    stores
      .filter((store) => store.googlePlaceId)
      .map((store) => [store.googlePlaceId!, store]),
  )
  for (const store of stores)
    entries.set(`store:${store.id}`, {
      key: `store:${store.id}`,
      name: store.name,
      location: store.location,
      registration: 'registered',
      store,
    })
  for (const place of places) {
    const store = byPlace.get(place.id) ?? links?.[place.id]
    if (store) {
      entries.set(`store:${store.id}`, {
        key: `store:${store.id}`,
        name: store.name,
        location: store.location,
        registration: 'registered',
        store,
        place,
      })
    } else {
      const registration =
        linkState === 'ready' && links && Object.hasOwn(links, place.id)
          ? 'missing'
          : linkState === 'unavailable'
            ? 'unavailable'
            : 'checking'
      entries.set(`place:${place.id}`, {
        key: `place:${place.id}`,
        name: place.name,
        location: place.location,
        registration,
        place,
      })
    }
  }
  const distance = (entry: MapEntry) =>
    distanceBetween(
      [center.lat, center.lng],
      [entry.location.lat, entry.location.lng],
    )
  return [...entries.values()].sort(
    (a, b) => distance(a) - distance(b) || a.key.localeCompare(b.key),
  )
}
