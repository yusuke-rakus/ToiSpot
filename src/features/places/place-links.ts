import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, getDocFromServer, type Firestore } from 'firebase/firestore'
import {
  getFirebaseServices,
  firebaseEnabled,
  firebaseQueryScope,
} from '@/lib/firebase'
import {
  googlePlaceIdSchema,
  storeDocumentSchema,
  type Store,
} from '../stores/store-schema'
import type { ConveniencePlace } from './nearby-places'

export type PlaceLinks = Record<string, Store | null>

// geohashや一覧の上限と独立して、候補の登録状況をサーバーで確認する。
export async function readPlaceLinks(
  db: Firestore,
  placeIds: string[],
  signal?: AbortSignal,
): Promise<PlaceLinks> {
  const entries = await Promise.all(
    [...new Set(placeIds)].map(async (id) => {
      signal?.throwIfAborted()
      googlePlaceIdSchema.parse(id)
      const link = await getDocFromServer(doc(db, 'placeLinks', id))
      signal?.throwIfAborted()
      if (!link.exists()) return [id, null] as const
      const storeId: unknown = link.data().storeId
      if (typeof storeId !== 'string' || !storeId || storeId.includes('/'))
        throw new Error('Invalid place link')
      const snapshot = await getDocFromServer(doc(db, 'stores', storeId))
      signal?.throwIfAborted()
      const result = storeDocumentSchema.safeParse(snapshot.data())
      if (
        !snapshot.exists() ||
        !result.success ||
        result.data.googlePlaceId !== id
      )
        throw new Error('Inconsistent place link')
      return [id, { ...result.data, id: snapshot.id }] as const
    }),
  )
  return Object.fromEntries(entries)
}

export async function fetchPlaceLinks(
  placeIds: string[],
  signal?: AbortSignal,
) {
  return readPlaceLinks(getFirebaseServices().db, placeIds, signal)
}

export function usePlaceLinks(
  places: ConveniencePlace[],
  requestId = 0,
  suspended = false,
) {
  const client = useQueryClient()
  const ids = places.map((place) => place.id).sort()
  const idsKey = JSON.stringify(ids)
  const query = useQuery({
    // 同じ候補が返る再検索でも、以前の「未登録」を再利用せず照会する。
    queryKey: ['placeLinks', ...firebaseQueryScope, requestId, ids],
    queryFn: ({ signal }) => fetchPlaceLinks(ids, signal),
    enabled: firebaseEnabled && ids.length > 0 && !suspended,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: 'always',
  })
  useEffect(() => {
    if (suspended)
      void client.cancelQueries({
        queryKey: [
          'placeLinks',
          ...firebaseQueryScope,
          requestId,
          JSON.parse(idsKey),
        ],
        exact: true,
      })
  }, [client, requestId, idsKey, suspended])
  return { ...query, enabled: firebaseEnabled && ids.length > 0 }
}
