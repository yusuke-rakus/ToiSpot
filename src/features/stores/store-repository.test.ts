import { beforeEach, expect, it, vi } from 'vitest'
import { createTestStores } from '../../../tests/fixtures/stores'
import { storeInputSchema } from './store-schema'
import { fetchStores } from './store-repository'
import { allocateStoreId, saveConfiguredStore } from './store-writer'
import { fetchPlaceLinks } from '../places/place-links'

const firebase = vi.hoisted(() => ({
  enabled: true,
  db: { project: 'configured-cloud-project' },
  read: vi.fn(),
  link: vi.fn(),
  collection: vi.fn((_db: unknown, path: string) => path),
  transaction: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({
  firebaseEnabled: true,
  firebaseQueryScope: ['cloud', 'configured-cloud-project'],
  getFirebaseServices: () => {
    if (!firebase.enabled) throw new Error('Firebase接続は無効です。')
    return { db: firebase.db }
  },
}))
vi.mock('firebase/firestore', () => ({
  collection: (...args: [unknown, string]) => firebase.collection(...args),
  documentId: () => 'id',
  query: (...args: unknown[]) => args,
  limit: (n: number) => n,
  orderBy: (key: string) => key,
  startAt: vi.fn(),
  endAt: vi.fn(),
  getDocsFromServer: (...args: unknown[]) => firebase.read(...args),
  getDocFromServer: (...args: unknown[]) => firebase.link(...args),
  doc: (_db: unknown, collection?: string, id?: string) => ({
    id: id ?? 'allocated',
    path: `${collection}/${id}`,
  }),
  serverTimestamp: () => 'server-time',
  runTransaction: (...args: unknown[]) => firebase.transaction(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  firebase.enabled = true
  firebase.read.mockResolvedValue({ docs: [] })
  firebase.link.mockResolvedValue({ exists: () => false })
  firebase.transaction.mockResolvedValue(undefined)
})

it('クラウドの公開読み取り・登録確認に設定されたFirestoreを使う', async () => {
  expect((await fetchStores()).stores).toEqual([])
  expect(firebase.collection).toHaveBeenCalledWith(firebase.db, 'stores')
  expect(firebase.read).toHaveBeenCalledOnce()
  expect(await fetchPlaceLinks(['ChIJ_test'])).toEqual({ ChIJ_test: null })
  expect(firebase.link).toHaveBeenCalledOnce()
})

it('ID確保と保存トランザクションに同じ接続先を使う', async () => {
  expect(allocateStoreId()).toBe('allocated')
  expect(firebase.collection).toHaveBeenCalledWith(firebase.db, 'stores')
  const input = storeInputSchema.parse(
    createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  )
  await expect(
    saveConfiguredStore({ id: 'new-store', googlePlaceId: 'ChIJ_test' }, input),
  ).resolves.toBe('new-store')
  expect(firebase.transaction).toHaveBeenCalledWith(
    firebase.db,
    expect.any(Function),
  )
})

it('接続が無効なら読み取り・ID確保・保存をSDKへ送らない', async () => {
  firebase.enabled = false
  await expect(fetchStores()).rejects.toThrow('Firebase接続は無効')
  await expect(fetchPlaceLinks(['ChIJ_test'])).rejects.toThrow(
    'Firebase接続は無効',
  )
  expect(() => allocateStoreId()).toThrow('Firebase接続は無効')
  expect(() =>
    saveConfiguredStore({ id: 'x', googlePlaceId: 'ChIJ_test' }, {} as never),
  ).toThrow('Firebase接続は無効')
  expect(firebase.read).not.toHaveBeenCalled()
  expect(firebase.link).not.toHaveBeenCalled()
  expect(firebase.transaction).not.toHaveBeenCalled()
})
