import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  storeRequestKeys,
  usePendingStoreRequestCount,
  usePendingStoreRequests,
  useReviewStoreRequest,
} from './use-store-requests'

const mock = vi.hoisted(() => ({
  status: 'admin',
  count: vi.fn(),
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({
  firebaseEnabled: true,
  firebaseQueryScope: ['test', 'requests'],
}))
vi.mock('../auth/admin-provider', () => ({
  useAdmin: () => ({ status: mock.status }),
}))
vi.mock('./store-request-repository', () => ({
  fetchPendingStoreRequestCount: (...args: unknown[]) => mock.count(...args),
  fetchPendingStoreRequests: (...args: unknown[]) => mock.list(...args),
  approveStoreRequest: (...args: unknown[]) => mock.approve(...args),
  rejectStoreRequest: (...args: unknown[]) => mock.reject(...args),
  readStoreForRequest: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mock.status = 'admin'
  mock.count.mockResolvedValue(2)
  mock.list.mockResolvedValue({ requests: [], nextCursor: null })
  mock.approve.mockResolvedValue(undefined)
  mock.reject.mockResolvedValue(undefined)
})

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  })
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { client, wrapper }
}

it('未ログイン時は申請一覧・件数を取得しない', () => {
  mock.status = 'signedOut'
  const { wrapper } = setup()
  renderHook(() => [usePendingStoreRequestCount(), usePendingStoreRequests()], {
    wrapper,
  })
  expect(mock.count).not.toHaveBeenCalled()
  expect(mock.list).not.toHaveBeenCalled()
})

it('件数は既存の共通キャッシュ設定によらず表示開始時に再取得する', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(storeRequestKeys.count, 99)
  const hook = renderHook(() => usePendingStoreRequestCount(), { wrapper })
  await waitFor(() => expect(hook.result.current.data).toBe(2))
  expect(mock.count).toHaveBeenCalledOnce()
  hook.unmount()
  mock.count.mockResolvedValue(3)
  const next = renderHook(() => usePendingStoreRequestCount(), { wrapper })
  await waitFor(() => expect(next.result.current.data).toBe(3))
  expect(mock.count).toHaveBeenCalledTimes(2)
})

it('ログアウトで非公開キャッシュを消し、取得中だった応答も破棄する', async () => {
  let finish: ((value: number) => void) | undefined
  mock.count.mockImplementation(
    () =>
      new Promise<number>((resolve) => {
        finish = resolve
      }),
  )
  const { client, wrapper } = setup()
  client.setQueryData(storeRequestKeys.count, 5)
  const hook = renderHook(() => usePendingStoreRequestCount(), { wrapper })
  await waitFor(() => expect(mock.count).toHaveBeenCalledOnce())
  mock.status = 'signedOut'
  hook.rerender()
  await waitFor(() =>
    expect(client.getQueryData(storeRequestKeys.count)).toBeUndefined(),
  )
  await act(async () => {
    finish?.(12)
  })
  expect(client.getQueryData(storeRequestKeys.count)).toBeUndefined()
  expect(hook.result.current.data).toBeUndefined()
})

it('手動更新で追加読み込みを先頭へ戻す', async () => {
  const cursor = { id: 'last' } as QueryDocumentSnapshot
  mock.list.mockImplementation(async (after?: QueryDocumentSnapshot) => ({
    requests: [],
    nextCursor: after ? null : cursor,
  }))
  const { wrapper } = setup()
  const hook = renderHook(() => usePendingStoreRequests(), { wrapper })
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  await act(async () => {
    await hook.result.current.fetchNextPage()
  })
  await waitFor(() => expect(hook.result.current.data?.pages).toHaveLength(2))
  await act(async () => {
    await hook.result.current.refresh()
  })
  await waitFor(() => expect(hook.result.current.data?.pages).toHaveLength(1))
  expect(mock.list.mock.calls.map(([after]) => after)).toEqual([
    undefined,
    cursor,
    undefined,
  ])
})

it('手動更新に失敗しても前回の申請を消さない', async () => {
  mock.list
    .mockResolvedValueOnce({
      requests: [{ id: 'request-1' }],
      nextCursor: null,
    })
    .mockRejectedValueOnce(new Error('offline'))
  const { wrapper } = setup()
  const hook = renderHook(() => usePendingStoreRequests(), { wrapper })
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
  await act(async () => {
    await hook.result.current.refresh()
  })
  await waitFor(() => expect(hook.result.current.isError).toBe(true))
  expect(hook.result.current.data?.pages[0].requests).toEqual([
    { id: 'request-1' },
  ])
})

it('審査成功で公開店舗を再取得可能にし、処理済み申請を一覧から取り除く', async () => {
  const { client, wrapper } = setup()
  const stores = ['stores', 'test', 'requests', 'area']
  const links = ['placeLinks', 'test', 'requests', 'place']
  client.setQueryData(stores, ['old'])
  client.setQueryData(links, ['old'])
  client.setQueryData(storeRequestKeys.count, 2)
  client.setQueryData(storeRequestKeys.pending, {
    pages: [
      {
        requests: [{ id: 'request-1' }, { id: 'request-2' }],
        nextCursor: null,
      },
    ],
    pageParams: [undefined],
  })
  const hook = renderHook(() => useReviewStoreRequest(), { wrapper })
  await act(async () => {
    await hook.result.current.mutateAsync({
      id: 'request-1',
      action: 'approve',
    })
  })
  expect(mock.approve).toHaveBeenCalledWith('request-1')
  expect(client.getQueryData(stores)).toBeUndefined()
  expect(client.getQueryState(stores)?.status).toBe('pending')
  expect(client.getQueryState(links)?.isInvalidated).toBe(true)
  expect(client.getQueryState(storeRequestKeys.count)?.isInvalidated).toBe(true)
  expect(
    client.getQueryData<{ pages: { requests: { id: string }[] }[] }>(
      storeRequestKeys.pending,
    )?.pages[0].requests,
  ).toEqual([{ id: 'request-2' }])
  expect(client.getQueryState(storeRequestKeys.pending)?.isInvalidated).toBe(
    true,
  )
})
