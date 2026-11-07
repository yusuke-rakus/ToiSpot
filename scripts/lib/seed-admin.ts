import type { Firestore } from 'firebase-admin/firestore'
import type { Auth } from 'firebase-admin/auth'

export async function seedAdminSettings(db: Firestore, uid: string | null) {
  if (!uid) return 'skipped' as const
  const ref = db.doc('_settings/admin')
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    const data = existing.data()
    if (data?.uid === uid && Object.keys(data).length === 1)
      return 'unchanged' as const
    transaction.set(ref, { uid })
    return existing.exists ? ('updated' as const) : ('created' as const)
  })
}

export async function seedAdminUser(
  auth: Auth,
  credentials: { email: string; password: string },
) {
  const existing = await auth
    .getUserByEmail(credentials.email)
    .catch((error: unknown) => {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'auth/user-not-found'
      )
        return null
      throw error
    })
  if (!existing) return auth.createUser(credentials)
  if (existing.disabled)
    throw new Error(
      '無効化済みの管理者ユーザーは更新できません。Auth Emulatorで状態を確認してください。',
    )
  return auth.updateUser(existing.uid, { password: credentials.password })
}
