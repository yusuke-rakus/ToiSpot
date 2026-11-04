import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { z } from 'zod'

const firebaseConfigSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  appId: z.string().min(1),
})

export const usesFirebaseEmulators =
  import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'false'

function createFirebaseServices() {
  const useEmulators = usesFirebaseEmulators
  const config = firebaseConfigSchema.parse(
    useEmulators
      ? {
          apiKey: 'demo-api-key',
          authDomain: 'demo-toilet-map.firebaseapp.com',
          projectId: 'demo-toilet-map',
          appId: 'demo-app-id',
        }
      : {
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          appId: import.meta.env.VITE_FIREBASE_APP_ID,
        },
  )
  const existingApp = getApps().find((app) => app.name === 'toilet-map-client')
  const app = existingApp ?? initializeApp(config, 'toilet-map-client')
  const auth = getAuth(app)
  const db = getFirestore(app)

  if (useEmulators && !existingApp) {
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
