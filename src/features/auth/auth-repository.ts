import {
  browserSessionPersistence,
  GoogleAuthProvider,
  onIdTokenChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { doc, getDocFromServer, type Firestore } from 'firebase/firestore'
import { z } from 'zod'
import { getFirebaseServices, usesFirebaseEmulators } from '@/lib/firebase'

export type AdminSession = {
  status: 'loading' | 'signedOut' | 'admin' | 'error'
  message: string | null
}
const settingsSchema = z.object({ email: z.email() })
const preparations = new WeakMap<Auth, Promise<void>>()

function localServices() {
  if (!usesFirebaseEmulators) throw new Error('Local authentication only')
  return getFirebaseServices()
}

export function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : ''
}

export async function checkAdminAccess(user: User, db: Firestore) {
  const token = await user.getIdTokenResult()
  if (
    !user.email ||
    token.claims.email_verified !== true ||
    token.signInProvider !== 'google.com'
  )
    return false
  try {
    const snapshot = await getDocFromServer(doc(db, '_settings', 'admin'))
    const parsed = settingsSchema.safeParse(snapshot.data())
    return parsed.success && parsed.data.email === user.email.toLowerCase()
  } catch (error) {
    if (errorCode(error) === 'permission-denied') return false
    throw error
  }
}

// 世代番号により、ログアウトやアカウント切替前の非同期判定を反映しない。
export function observeAdminSession(onChange: (state: AdminSession) => void) {
  if (!usesFirebaseEmulators) {
    onChange({ status: 'signedOut', message: null })
    return () => {}
  }
  let active = true
  let version = 0
  let unsubscribe: (() => void) | undefined
  let signedOutMessage: string | null = null
  const { auth, db } = localServices()
  let preparation = preparations.get(auth)
  if (!preparation) {
    preparation = setPersistence(auth, browserSessionPersistence)
    preparations.set(auth, preparation)
  }
  void preparation
    .then(() => {
      if (!active) return
      unsubscribe = onIdTokenChanged(
        auth,
        async (user) => {
          const current = ++version
          const emit = (state: AdminSession) => {
            if (active && current === version) onChange(state)
          }
          if (!user) {
            emit({ status: 'signedOut', message: signedOutMessage })
            signedOutMessage = null
            return
          }
          emit({ status: 'loading', message: null })
          try {
            const allowed = await checkAdminAccess(user, db)
            if (!active || current !== version) return
            if (allowed) emit({ status: 'admin', message: null })
            else {
              signedOutMessage =
                '管理者に登録されていないアカウントです。ADMIN_GOOGLE_EMAILの設定とシードを確認してください。'
              await signOut(auth)
            }
          } catch {
            emit({
              status: 'error',
              message:
                '管理者権限を確認できませんでした。Emulatorの接続を確認し、再ログインしてください。',
            })
          }
        },
        () => {
          if (active)
            onChange({
              status: 'error',
              message:
                '認証状態を確認できませんでした。再ログインしてください。',
            })
        },
      )
    })
    .catch(() => {
      preparations.delete(auth)
      if (active)
        onChange({
          status: 'error',
          message:
            'ログインの準備に失敗しました。ブラウザの保存設定を確認してください。',
        })
    })
  return () => {
    active = false
    version++
    unsubscribe?.()
  }
}

export function loginWithGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return signInWithPopup(localServices().auth, provider)
}

export function logoutAdmin() {
  return signOut(localServices().auth)
}

export function loginErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case 'auth/popup-closed-by-user':
      return 'ログインをキャンセルしました。'
    case 'auth/popup-blocked':
      return 'ポップアップがブロックされました。許可して再度お試しください。'
    case 'auth/cancelled-popup-request':
      return '別のログイン操作が開始されました。'
    default:
      return 'ログインに失敗しました。Auth Emulatorの起動・接続を確認してください。'
  }
}
