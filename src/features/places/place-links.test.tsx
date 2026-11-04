import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/lib/query-client'
import { createTestStores } from '../../../tests/fixtures/stores'
import { INITIAL_CENTER } from '../map/map-config'
import { usePlaceLinks } from './place-links'

const state = vi.hoisted(() => ({ registered: false, read: vi.fn() }))
vi.mock('@/lib/firebase', () => ({
  usesFirebaseEmulators: true,
  getFirebaseServices: () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  getDocFromServer: (...args: unknown[]) => state.read(...args),
}))
const store = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  id: 'registered',
  googlePlaceId: 'ChIJ_test',
}
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
  state.registered = false
  state.read.mockReset().mockImplementation(async (path: string) =>
    path.startsWith('placeLinks/')
      ? {
          exists: () => state.registered,
          data: () => ({ storeId: store.id }),
        }
      : { exists: () => true, id: store.id, data: () => store },
  )
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
  state.registered = true
  rerender({ search: 2 })
  await waitFor(() => expect(result.current.data?.ChIJ_test?.id).toBe(store.id))
  expect(state.read).toHaveBeenCalledTimes(3)
  unmount()
  client.clear()
})
