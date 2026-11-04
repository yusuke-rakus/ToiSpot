import { expect, it, vi } from 'vitest'

const firebase = vi.hoisted(() => ({ getFirebaseServices: vi.fn() }))
vi.mock('@/lib/firebase', () => ({ ...firebase, usesFirebaseEmulators: false }))

it('クラウドモードではSDK初期化・取得の前に拒否する', async () => {
  const { fetchLocalStores } = await import('./store-repository')
  await expect(fetchLocalStores()).rejects.toThrow('local emulator')
  expect(firebase.getFirebaseServices).not.toHaveBeenCalled()
})
