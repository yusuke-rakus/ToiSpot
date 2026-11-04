import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { storeDocumentSchema } from '../../src/features/stores/store-schema.ts'
import stores from '../data/stores.json' with { type: 'json' }

// Emulatorに登録済みの万願寺周辺のテストデータ。トイレ情報は実地未確認。
export const seedStoreDocuments = stores.map(({ id, data }) => ({
  id,
  data: storeDocumentSchema.parse(data),
}))

export async function seedStores(db: Firestore) {
  return db.runTransaction(async (transaction) => {
    const references = seedStoreDocuments.map(({ id, data }) => ({
      store: db.doc(`stores/${id}`),
      link: db.doc(`placeLinks/${data.googlePlaceId}`),
    }))
    const snapshots = await transaction.getAll(
      ...references.flatMap(({ store, link }) => [store, link]),
    )
    const result = { created: 0, skipped: 0, linksCreated: 0, conflicts: 0 }
    for (const [index, { id, data }] of seedStoreDocuments.entries()) {
      const store = snapshots[index * 2]
      const link = snapshots[index * 2 + 1]
      // 手動登録・編集された店舗や、別店舗への紐付けは上書きしない。
      if (
        (store.exists && store.data()?.googlePlaceId !== data.googlePlaceId) ||
        (link.exists && link.data()?.storeId !== id)
      ) {
        result.conflicts += 1
        continue
      }
      if (store.exists) result.skipped += 1
      else {
        transaction.create(references[index].store, {
          ...data,
          createdAt: Timestamp.fromDate(new Date(data.createdAt)),
          updatedAt: Timestamp.fromDate(new Date(data.updatedAt)),
          lastConfirmedAt: data.lastConfirmedAt
            ? Timestamp.fromDate(new Date(data.lastConfirmedAt))
            : null,
        })
        result.created += 1
      }
      if (!link.exists) {
        transaction.create(references[index].link, { storeId: id })
        result.linksCreated += 1
      }
    }
    return result
  })
}
