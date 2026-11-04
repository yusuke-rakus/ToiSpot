import type { Firestore } from 'firebase-admin/firestore'
import { googlePlaceIdSchema } from '../../src/features/stores/store-schema.ts'

// リリース前の座標のみの店舗と架空サンプルだけを削除する。
export async function cleanupLegacyStores(db: Firestore, apply = false) {
  const snapshot = await db.collection('stores').get()
  let stores = 0
  let links = 0
  for (const document of snapshot.docs) {
    const removed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(document.ref)
      if (!current.exists) return null
      const data = current.data()!
      if (
        data.isSample !== true &&
        googlePlaceIdSchema.safeParse(data.googlePlaceId).success
      )
        return null
      const related = await transaction.get(
        db.collection('placeLinks').where('storeId', '==', document.id),
      )
      if (apply) {
        related.docs.forEach((link) => transaction.delete(link.ref))
        transaction.delete(document.ref)
      }
      return related.size
    })
    if (removed !== null) {
      stores += 1
      links += removed
    }
  }
  return { stores, links }
}
