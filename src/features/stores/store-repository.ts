import {
  collection,
  documentId,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAt,
  endAt,
  type Firestore,
} from 'firebase/firestore'
import { getFirebaseServices, usesFirebaseEmulators } from '@/lib/firebase'
import { parseStoreDocuments, STORE_DISPLAY_LIMIT } from './store-schema'
import { geohashQueryBounds } from 'geofire-common'
import type { MapPoint } from '@/features/map/map-config'
import { collectNearbyStores, NEARBY_RADIUS_KM } from './nearby-stores'
export { NEARBY_RADIUS_KM } from './nearby-stores'

export async function readNearbyStores(db: Firestore, center: MapPoint) {
  const bounds = geohashQueryBounds(
    [center.lat, center.lng],
    NEARBY_RADIUS_KM * 1000,
  )
  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      getDocsFromServer(
        query(
          collection(db, 'stores'),
          orderBy('geohash'),
          startAt(start),
          endAt(end),
          limit(STORE_DISPLAY_LIMIT + 1),
        ),
      ),
    ),
  )
  return collectNearbyStores(
    snapshots.map((snapshot) =>
      snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      })),
    ),
    center,
  )
}

// dbを受け取り、テストでは専用プロジェクトのFirestoreで検証できるようにする。
export async function readStores(db: Firestore) {
  const snapshot = await getDocsFromServer(
    query(
      collection(db, 'stores'),
      orderBy(documentId()),
      limit(STORE_DISPLAY_LIMIT + 1),
    ),
  )
  return parseStoreDocuments(
    snapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    })),
  )
}

export async function fetchLocalStores(center?: MapPoint) {
  if (!usesFirebaseEmulators)
    throw new Error('Store browsing is restricted to the local emulator')
  const db = getFirebaseServices().db
  return center ? readNearbyStores(db, center) : readStores(db)
}
