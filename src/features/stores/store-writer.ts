import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore'
import { geohashForLocation } from 'geofire-common'
import { getFirebaseServices, usesFirebaseEmulators } from '@/lib/firebase'
import {
  storeDocumentSchema,
  storeInputSchema,
  googlePlaceIdSchema,
  type Store,
  type StoreInput,
} from './store-schema'

export type StoreWriteTarget = {
  id: string
  original?: Store
  googlePlaceId: string
}
export class StoreConflictError extends Error {}

function localDb() {
  if (!usesFirebaseEmulators) throw new Error('Local writes only')
  return getFirebaseServices().db
}
export function allocateStoreId() {
  return doc(collection(localDb(), 'stores')).id
}

export async function saveStore(
  db: Firestore,
  target: StoreWriteTarget,
  input: StoreInput,
) {
  const parsed = storeInputSchema.parse(input)
  const placeId = googlePlaceIdSchema.parse(target.googlePlaceId)
  const payload = {
    ...parsed,
    googlePlaceId: placeId,
    geohash: geohashForLocation([parsed.location.lat, parsed.location.lng]),
    lastConfirmedAt: parsed.lastConfirmedAt
      ? Timestamp.fromDate(new Date(parsed.lastConfirmedAt))
      : null,
    updatedAt: serverTimestamp(),
  }
  const ref = doc(db, 'stores', target.id)
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref)
    const linkRef = doc(db, 'placeLinks', placeId)
    const link = await transaction.get(linkRef)
    if (
      (link?.exists() && link.data().storeId !== target.id) ||
      (existing.exists() &&
        existing.data().googlePlaceId &&
        existing.data().googlePlaceId !== placeId)
    )
      throw new StoreConflictError(
        '既に別の店舗と紐付いています。登録情報を更新してください。',
      )
    // 再試行でも同じ店舗・Place IDを使い、二重登録しない。
    if (!link.exists()) {
      transaction.set(linkRef, { storeId: target.id })
    }
    if (!target.original) {
      // フォームで確保したIDを再利用。通信結果が不明だった後も別IDを作らない。
      if (existing.exists()) {
        const savedInput = storeInputSchema.parse(existing.data())
        if (
          JSON.stringify(savedInput) === JSON.stringify(parsed) &&
          existing.data().googlePlaceId === placeId
        )
          return
        throw new StoreConflictError(
          'この登録は既に保存されています。一覧を更新して内容を確認し、編集してください。',
        )
      }
      transaction.set(ref, {
        ...payload,
        isSample: false,
        createdAt: serverTimestamp(),
      })
    } else {
      if (
        existing.exists() &&
        target.googlePlaceId &&
        existing.data().googlePlaceId === placeId &&
        JSON.stringify(storeInputSchema.parse(existing.data())) ===
          JSON.stringify(parsed)
      )
        return
      if (
        !existing.exists() ||
        storeDocumentSchema.parse(existing.data()).updatedAt !==
          target.original.updatedAt
      ) {
        throw new StoreConflictError(
          '他の操作で更新されています。一覧を更新してから編集し直してください。',
        )
      }
      // 作成日時とサンプル識別は更新対象に含めない。
      transaction.update(ref, payload)
    }
  })
  return target.id
}

export function saveLocalStore(target: StoreWriteTarget, input: StoreInput) {
  return saveStore(localDb(), target, input)
}
