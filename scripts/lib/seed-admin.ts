import type { Firestore } from 'firebase-admin/firestore'

export async function seedAdminSettings(db: Firestore, email: string | null) {
  if (!email) return 'skipped' as const
  const ref = db.doc('_settings/admin')
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    if (existing.data()?.email === email) return 'unchanged' as const
    transaction.set(ref, { email })
    return existing.exists ? ('updated' as const) : ('created' as const)
  })
}
