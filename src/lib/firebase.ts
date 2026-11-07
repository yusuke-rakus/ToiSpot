import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { resolveFirebaseConnection } from './firebase-config'

export const firebaseConnection = resolveFirebaseConnection(import.meta.env)
export const firebaseEnabled = firebaseConnection.enabled
export const usesFirebaseEmulators = firebaseConnection.mode === 'emulator'
export const firebaseQueryScope = [
  firebaseConnection.mode,
  firebaseConnection.projectId,
] as const

function createFirebaseServices() {
  if (!firebaseConnection.enabled)
    throw new Error(firebaseConnection.error ?? 'Firebase接続は無効です。')
  const config = firebaseConnection.config
  const existingApp = getApps().find((app) => app.name === 'toilet-map-client')
  const app = existingApp ?? initializeApp(config, 'toilet-map-client')
  const auth = getAuth(app)
  const db = getFirestore(app)

  if (usesFirebaseEmulators && !existingApp) {
    connectAuthEmulator(auth, 'http://127.0.0.1:19090', {
      disableWarnings: true,
    })
    connectFirestoreEmulator(db, '127.0.0.1', 18081)
  }

  return { app, auth, db }
}

let services: ReturnType<typeof createFirebaseServices> | undefined

// 店舗取得などで呼び出すまで初期化しない。
export function getFirebaseServices() {
  services ??= createFirebaseServices()
  return services
}
