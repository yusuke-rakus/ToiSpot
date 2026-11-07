import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/lib/query-client'
import { createTestStores } from '../../../tests/fixtures/stores'
import { INITIAL_CENTER } from '../map/map-config'
import { usePlaceLinks } from './place-links'

const state = vi.hoisted(() => ({
  enabled: true,
  registered: false,
  read: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({
  get firebaseEnabled() {
    return state.enabled
  },
  firebaseQueryScope: ['cloud', 'toilet-map-test'],
  getFirebaseServices: () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  getDocFromServer: (...args: unknown[]) => state.read(...args),
}))
const store = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  googlePlaceId: 'ChIJ_test',
}
const storeId = 'registered'
const places = [
  {
    id: 'ChIJ_test',
    name: 'コンビニ',
    address: '住所',
    location: INITIAL_CENTER,
    attributions: [],
  },
]

beforeEach(() => {
  state.enabled = true
  state.registered = false
  state.read.mockReset().mockImplementation(async (path: string) =>
    path.startsWith('placeLinks/')
      ? {
          exists: () => state.registered,
          data: () => ({ storeId }),
        }
      : { exists: () => true, id: storeId, data: () => store },
  )
})

it('停止中は登録照会を開始せず、前回取得した情報を保持する', async () => {
  const client = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, rerender, unmount } = renderHook(
    ({ suspended }) => usePlaceLinks(places, 1, suspended),
    { wrapper, initialProps: { suspended: true } },
  )
  expect(state.read).not.toHaveBeenCalled()
  rerender({ suspended: false })
  await waitFor(() => expect(result.current.data?.ChIJ_test).toBeNull())
  rerender({ suspended: true })
  expect(result.current.data?.ChIJ_test).toBeNull()
  rerender({ suspended: false })
  expect(state.read).toHaveBeenCalledOnce()
  unmount()
  client.clear()
})

it('照会中に停止すると、返ってきた紐付けから店舗の追加取得を開始しない', async () => {
  const client = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  let finish!: (value: {
    exists: () => boolean
    data: () => { storeId: string }
  }) => void
  state.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { rerender, unmount } = renderHook(
    ({ suspended }) => usePlaceLinks(places, 1, suspended),
    { wrapper, initialProps: { suspended: false } },
  )
  await waitFor(() => expect(state.read).toHaveBeenCalledOnce())
  rerender({ suspended: true })
  await act(async () => {
    finish({ exists: () => true, data: () => ({ storeId }) })
  })
  expect(state.read).toHaveBeenCalledOnce()
  unmount()
  client.clear()
})

it('同じ候補への再検索でも、以前の未登録判定を使わず新しい登録情報を取得する', async () => {
  const client = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, rerender, unmount } = renderHook(
    ({ search }) => usePlaceLinks(places, search),
    { wrapper, initialProps: { search: 1 } },
  )
  await waitFor(() => expect(result.current.data?.ChIJ_test).toBeNull())
  expect(
    client.getQueryData([
      'placeLinks',
      'cloud',
      'toilet-map-test',
      1,
      ['ChIJ_test'],
    ]),
  ).toBeDefined()
  state.registered = true
  rerender({ search: 2 })
  await waitFor(() => expect(result.current.data?.ChIJ_test?.id).toBe(storeId))
  expect(state.read).toHaveBeenCalledTimes(3)
  unmount()
  client.clear()
})

it('接続が無効なときはQueryからSDKを呼ばない', () => {
  state.enabled = false
  const client = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, unmount } = renderHook(() => usePlaceLinks(places), {
    wrapper,
  })
  expect(result.current.enabled).toBe(false)
  expect(state.read).not.toHaveBeenCalled()
  unmount()
  client.clear()
})
