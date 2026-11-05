import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/lib/query-client'
import { INITIAL_CENTER } from '../map/map-config'
import type { MapViewport } from '../map/search-area'
import { createTestStores } from '../../../tests/fixtures/stores'
import { readNearbyStores } from './store-repository'
import { useStores } from './use-stores'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  ranges: vi.fn<(...args: unknown[]) => string[][]>(() => [
    ['a', 'b'],
    ['c', 'd'],
  ]),
}))
vi.mock('@/lib/firebase', () => ({
  usesFirebaseEmulators: true,
  getFirebaseServices: () => ({ db: {} }),
}))
vi.mock('geofire-common', async (original) => ({
  ...(await original<typeof import('geofire-common')>()),
  geohashQueryBounds: (...args: unknown[]) => state.ranges(...args),
}))
vi.mock('firebase/firestore', () => ({
  collection: () => 'stores',
  documentId: () => 'id',
  query: (...args: unknown[]) => args,
  limit: (value: number) => ({ limit: value }),
  orderBy: (value: string) => ({ orderBy: value }),
  startAt: (value: string) => ({ startAt: value }),
  endAt: (value: string) => ({ endAt: value }),
  getDocsFromServer: (...args: unknown[]) => state.read(...args),
}))

const viewport: MapViewport = {
  center: INITIAL_CENTER,
  bounds: { north: 35.75, south: 35.65, east: 139.82, west: 139.72 },
  zoom: 13,
}
const sample = createTestStores('2026-11-03T00:00:00.000Z')[0].data
const document = (id: string, lat: number) => ({
  id,
  data: () => ({ ...sample, location: { lat, lng: INITIAL_CENTER.lng } }),
})
const snapshot = {
  docs: [
    document('near', INITIAL_CENTER.lat),
    document('beyond-3km', 35.73),
    document('outside', 35.76),
    { id: 'invalid', data: () => ({}) },
  ],
}
beforeEach(() => {
  state.read.mockReset().mockResolvedValue(snapshot)
  state.ranges.mockClear()
})

it('表示範囲を覆うgeohashで取得し、3kmより遠い店舗も含め、範囲外・重複・不正データを除く', async () => {
  const result = await readNearbyStores({} as never, viewport)
  expect(result.stores.map(({ id }) => id)).toEqual(['near', 'beyond-3km'])
  expect(result.invalidCount).toBe(1)
  expect(state.ranges.mock.calls[0][1]).toBeGreaterThan(5000)
  expect(state.read.mock.calls[0][0]).toContainEqual({ limit: 101 })
  const legacy = await readNearbyStores({} as never, INITIAL_CENTER)
  expect(legacy.stores.map(({ id }) => id)).toEqual(['near'])
  expect(state.ranges).toHaveBeenLastCalledWith(
    [INITIAL_CENTER.lat, INITIAL_CENTER.lng],
    3000,
  )
})

it('範囲ごとの候補上限と取得結果100件の上限を維持する', async () => {
  let batch = 0
  state.read.mockImplementation(async () => ({
    docs: Array.from({ length: 101 }, (_, i) =>
      document(`${batch++}_${i}`, INITIAL_CENTER.lat),
    ),
  }))
  const result = await readNearbyStores({} as never, viewport)
  expect(result.stores).toHaveLength(100)
  expect(result.truncated).toBe(true)
})

it('中断済みの要求はFirestoreへ送らない', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    readNearbyStores({} as never, viewport, controller.signal),
  ).rejects.toThrow()
  expect(state.read).not.toHaveBeenCalled()
})

it('停止中は取得せず、再検索中・停止中も前回結果を維持し、古い応答を反映しない', async () => {
  const client = createQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, rerender, unmount } = renderHook(
    ({ area, suspended }) => useStores(area, suspended),
    { wrapper, initialProps: { area: viewport, suspended: true } },
  )
  expect(state.read).not.toHaveBeenCalled()
  rerender({ area: viewport, suspended: false })
  await waitFor(() => expect(result.current.data?.stores).toHaveLength(2))
  const completions: ((value: typeof snapshot) => void)[] = []
  state.read.mockImplementation(
    () => new Promise((resolve) => completions.push(resolve)),
  )
  const next = { ...viewport, bounds: { ...viewport.bounds, north: 35.77 } }
  rerender({ area: next, suspended: false })
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(4))
  expect(result.current.data?.stores.map(({ id }) => id)).toEqual([
    'near',
    'beyond-3km',
  ])
  rerender({ area: next, suspended: true })
  await act(async () => {
    completions.forEach((finish) => finish({ docs: [] }))
  })
  expect(result.current.data?.stores).toHaveLength(2)
  expect(state.read).toHaveBeenCalledTimes(4)
  rerender({ area: next, suspended: false })
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(6))
  await act(async () => {
    completions.slice(2).forEach((finish) => finish(snapshot))
  })
  await waitFor(() => expect(result.current.isFetching).toBe(false))
  expect(result.current.data?.stores.map(({ id }) => id)).toEqual([
    'near',
    'beyond-3km',
    'outside',
  ])
  state.read.mockRejectedValue(new Error('Firestore unavailable'))
  rerender({ area: { ...next, zoom: 14 }, suspended: false })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.data?.stores.map(({ id }) => id)).toEqual([
    'near',
    'beyond-3km',
    'outside',
  ])
  unmount()
  client.clear()
})
