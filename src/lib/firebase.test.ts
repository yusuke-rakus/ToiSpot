import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  initialize: vi.fn(() => ({ name: 'toilet-map-client' })),
  apps: vi.fn<() => { name: string }[]>(() => []),
  auth: vi.fn(() => ({})),
  db: vi.fn(() => ({})),
  authEmulator: vi.fn(),
  firestoreEmulator: vi.fn(),
}))
vi.mock('firebase/app', () => ({
  initializeApp: sdk.initialize,
  getApps: sdk.apps,
}))
vi.mock('firebase/auth', () => ({
  getAuth: sdk.auth,
  connectAuthEmulator: sdk.authEmulator,
}))
vi.mock('firebase/firestore', () => ({
  getFirestore: sdk.db,
  connectFirestoreEmulator: sdk.firestoreEmulator,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  sdk.apps.mockReturnValue([])
  vi.stubEnv('MODE', 'development')
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false')
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-public-api-key')
  vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'toilet-map-test.firebaseapp.com')
  vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'toilet-map-test')
  vi.stubEnv('VITE_FIREBASE_APP_ID', 'test-app-id')
})
afterEach(() => vi.unstubAllEnvs())

it('クラウドは遅延初期化し、繰り返し利用してもEmulatorへ接続しない', async () => {
  const firebase = await import('./firebase')
  expect(sdk.initialize).not.toHaveBeenCalled()
  const services = firebase.getFirebaseServices()
  expect(firebase.getFirebaseServices()).toBe(services)
  expect(sdk.initialize).toHaveBeenCalledOnce()
  expect(sdk.initialize).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: 'toilet-map-test' }),
    'toilet-map-client',
  )
  expect(sdk.authEmulator).not.toHaveBeenCalled()
  expect(sdk.firestoreEmulator).not.toHaveBeenCalled()
  expect(firebase.firebaseQueryScope).toEqual(['cloud', 'toilet-map-test'])
})

it('Emulatorの接続先とデモプロジェクトを維持する', async () => {
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true')
  const firebase = await import('./firebase')
  firebase.getFirebaseServices()
  firebase.getFirebaseServices()
  expect(sdk.initialize).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: 'demo-toilet-map' }),
    'toilet-map-client',
  )
  expect(sdk.authEmulator).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    'http://127.0.0.1:19090',
    { disableWarnings: true },
  )
  expect(sdk.firestoreEmulator).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    '127.0.0.1',
    18081,
  )
  expect(firebase.firebaseQueryScope).toEqual(['emulator', 'demo-toilet-map'])
})

it.each(['e2e', 'incomplete'])(
  '無効状態（%s）はSDKを初期化しない',
  async (reason) => {
    if (reason === 'e2e') vi.stubEnv('MODE', 'e2e')
    else vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    const firebase = await import('./firebase')
    expect(firebase.firebaseEnabled).toBe(false)
    expect(() => firebase.getFirebaseServices()).toThrow()
    expect(sdk.initialize).not.toHaveBeenCalled()
    expect(sdk.auth).not.toHaveBeenCalled()
    expect(sdk.db).not.toHaveBeenCalled()
  },
)
