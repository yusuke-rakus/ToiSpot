import { expect, it } from 'vitest'
import {
  resolveFirebaseConnection,
  validateProductionConfig,
} from './firebase-config'

const production = {
  VITE_USE_FIREBASE_EMULATORS: 'false',
  VITE_FIREBASE_API_KEY: 'test-public-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'toilet-map-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'toilet-map-test',
  VITE_FIREBASE_APP_ID: 'test-app-id',
  VITE_GOOGLE_MAPS_API_KEY: 'test-maps-key',
  VITE_GOOGLE_MAPS_MAP_ID: 'test-map-id',
}

it('通常の開発では実設定があってもEmulatorを既定にする', () => {
  expect(
    resolveFirebaseConnection({
      ...production,
      VITE_USE_FIREBASE_EMULATORS: undefined,
    }),
  ).toMatchObject({
    mode: 'emulator',
    enabled: true,
    projectId: 'demo-toilet-map',
  })
  expect(
    resolveFirebaseConnection({
      ...production,
      VITE_USE_FIREBASE_EMULATORS: 'true',
    }).mode,
  ).toBe('emulator')
})

it('明示的なfalseと設定4項目が揃った場合だけクラウドを使う', () => {
  expect(
    resolveFirebaseConnection({
      ...production,
      VITE_FIREBASE_PROJECT_ID: ' toilet-map-test ',
    }),
  ).toMatchObject({
    mode: 'cloud',
    enabled: true,
    config: { projectId: 'toilet-map-test' },
    error: null,
  })
  for (const key of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
  ]) {
    for (const missing of [undefined, '', '   ']) {
      expect(
        resolveFirebaseConnection({ ...production, [key]: missing }),
      ).toMatchObject({ mode: 'disabled', enabled: false, config: null })
    }
  }
})

it('不正な接続指定とデモ用クラウド設定は値を表示せず無効にする', () => {
  for (const overrides of [
    { VITE_USE_FIREBASE_EMULATORS: 'secret-invalid-flag' },
    { VITE_FIREBASE_PROJECT_ID: 'demo-secret-project' },
  ]) {
    const connection = resolveFirebaseConnection({
      ...production,
      ...overrides,
    })
    expect(connection.mode).toBe('disabled')
    expect(connection.error).toBeTruthy()
    expect(connection.error).not.toContain('secret-')
  }
})

it('e2eは実設定・Emulator指定に関係なく無効にする', () => {
  for (const flag of ['true', 'false', undefined])
    expect(
      resolveFirebaseConnection({
        ...production,
        MODE: 'e2e',
        VITE_USE_FIREBASE_EMULATORS: flag,
      }),
    ).toEqual({
      mode: 'disabled',
      enabled: false,
      projectId: null,
      config: null,
      error: null,
    })
})

it('本番ビルドはクラウドと地図の必須設定を検査する', () => {
  expect(() => validateProductionConfig(production)).not.toThrow()
  for (const key of Object.keys(production))
    expect(() =>
      validateProductionConfig({ ...production, [key]: '' }),
    ).toThrow()
  for (const overrides of [
    { VITE_USE_FIREBASE_EMULATORS: undefined },
    { VITE_USE_FIREBASE_EMULATORS: 'true' },
    { VITE_FIREBASE_PROJECT_ID: 'demo-toilet-map' },
    { VITE_GOOGLE_MAPS_MAP_ID: ' DEMO_MAP_ID ' },
    { MODE: 'e2e' },
  ])
    expect(() =>
      validateProductionConfig({ ...production, ...overrides }),
    ).toThrow()
  expect(() =>
    validateProductionConfig({
      ...production,
      VITE_FIREBASE_PROJECT_ID: 'demo-private-value',
    }),
  ).toThrow(expect.not.stringContaining('private-value'))
})
