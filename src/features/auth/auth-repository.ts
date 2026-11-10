import {
  browserLocalPersistence,
  onIdTokenChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { doc, getDocFromServer, type Firestore } from 'firebase/firestore'
import { z } from 'zod'
import {
  getFirebaseServices,
  firebaseEnabled,
  firebaseConnection,
  usesFirebaseEmulators,
} from '@/lib/firebase'

export type AdminSession = {
  status: 'loading' | 'signedOut' | 'admin' | 'error'
  message: string | null
}
const settingsSchema = z.object({ uid: z.string().min(1) })
const preparations = new WeakMap<Auth, Promise<void>>()

export function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : ''
}

export async function checkAdminAccess(user: User, db: Firestore) {
  const token = await user.getIdTokenResult()
  if (token.signInProvider !== 'password') return false
  try {
    const snapshot = await getDocFromServer(doc(db, '_settings', 'admin'))
    const parsed = settingsSchema.safeParse(snapshot.data())
    return parsed.success && parsed.data.uid === user.uid
  } catch (error) {
    if (errorCode(error) === 'permission-denied') return false
    throw error
  }
}

// 世代番号により、ログアウトやアカウント切替前の非同期判定を反映しない。
export function observeAdminSession(onChange: (state: AdminSession) => void) {
  if (!firebaseEnabled) {
    onChange({ status: 'signedOut', message: firebaseConnection.error })
    return () => {}
  }
  let services: ReturnType<typeof getFirebaseServices>
  try {
    services = getFirebaseServices()
  } catch {
    onChange({
      status: 'error',
      message:
        '認証を開始できませんでした。管理者が接続設定を確認してください。',
    })
    return () => {}
  }
  let active = true
  let version = 0
  let unsubscribe: (() => void) | undefined
  let signedOutMessage: string | null = null
  const { auth, db } = services
  let preparation = preparations.get(auth)
  if (!preparation) {
    preparation = setPersistence(auth, browserLocalPersistence)
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
              signedOutMessage = usesFirebaseEmulators
                ? '管理者に登録されていないアカウントです。ADMIN_EMAIL・ADMIN_PASSWORDの設定とシードを確認してください。'
                : '管理者に登録されていないアカウントです。登録済みの管理者アカウントでログインしてください。'
              await signOut(auth)
            }
          } catch {
            emit({
              status: 'error',
              message: usesFirebaseEmulators
                ? '管理者権限を確認できませんでした。Emulatorの接続を確認し、再ログインしてください。'
                : '管理者権限を確認できませんでした。通信状態を確認し、再ログインしてください。',
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

export async function loginWithPassword(email: string, password: string) {
  const { auth } = getFirebaseServices()
  let preparation = preparations.get(auth)
  if (!preparation) {
    preparation = setPersistence(auth, browserLocalPersistence)
    preparations.set(auth, preparation)
  }
  try {
    await preparation
  } catch (error) {
    preparations.delete(auth)
    throw error
  }
  return signInWithEmailAndPassword(auth, email, password)
}

export function logoutAdmin() {
  return signOut(getFirebaseServices().auth)
}

export function loginErrorMessage(error: unknown) {
  switch (errorCode(error)) {
    case 'auth/invalid-email':
      return 'メールアドレスの形式を確認してください。'
    case 'auth/missing-password':
      return 'パスワードを入力してください。'
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'メールアドレスまたはパスワードが正しくありません。'
    case 'auth/too-many-requests':
      return 'ログインの試行回数が多すぎます。しばらく待ってから再度お試しください。'
    case 'auth/admin-restricted-operation':
      return '登録済みの管理者アカウントでログインしてください。'
    case 'auth/user-disabled':
      return 'このアカウントは無効になっています。管理者に確認してください。'
    case 'auth/unauthorized-domain':
      return 'このドメインからログインできません。管理者が認証のドメイン設定を確認してください。'
    case 'auth/network-request-failed':
      return '通信に失敗しました。接続を確認して再度お試しください。'
    default:
      return usesFirebaseEmulators
        ? 'ログインに失敗しました。Auth Emulatorの起動・接続を確認してください。'
        : 'ログインに失敗しました。通信状態を確認して再度お試しください。'
  }
}
