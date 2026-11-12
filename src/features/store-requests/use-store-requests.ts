import { useEffect, useRef } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { useAdmin } from '@/features/auth/admin-provider'
import { firebaseEnabled, firebaseQueryScope } from '@/lib/firebase'
import {
  approveStoreRequest,
  fetchPendingStoreRequestCount,
  fetchPendingStoreRequests,
  readStoreForRequest,
  rejectStoreRequest,
} from './store-request-repository'
import type { StoreRequest } from './store-request-schema'

type PendingRequestPage = Awaited<ReturnType<typeof fetchPendingStoreRequests>>

export const storeRequestKeys = {
  all: ['storeRequests', ...firebaseQueryScope] as const,
  count: ['storeRequests', ...firebaseQueryScope, 'pendingCount'] as const,
  pending: ['storeRequests', ...firebaseQueryScope, 'pending'] as const,
  current: (id: string) =>
    ['storeRequests', ...firebaseQueryScope, 'current', id] as const,
}

function useRequestAccess() {
  const admin = useAdmin()
  const client = useQueryClient()
  const enabled = firebaseEnabled && admin.status === 'admin'
  useEffect(() => {
    if (enabled) return
    void client.cancelQueries({ queryKey: storeRequestKeys.all })
    client.removeQueries({ queryKey: storeRequestKeys.all })
  }, [client, enabled])
  return enabled
}

export function usePendingStoreRequestCount() {
  const enabled = useRequestAccess()
  return useQuery({
    queryKey: storeRequestKeys.count,
    queryFn: async ({ signal }) => {
      const count = await fetchPendingStoreRequestCount(signal)
      signal.throwIfAborted()
      return count
    },
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

async function refreshRequests(client: QueryClient) {
  client.setQueryData<InfiniteData<PendingRequestPage>>(
    storeRequestKeys.pending,
    (previous) =>
      previous && {
        pages: previous.pages.slice(0, 1),
        pageParams: previous.pageParams.slice(0, 1),
      },
  )
  await Promise.allSettled([
    client.invalidateQueries({
      queryKey: storeRequestKeys.pending,
      exact: true,
    }),
    client.invalidateQueries({ queryKey: storeRequestKeys.count, exact: true }),
    client.invalidateQueries({
      queryKey: [...storeRequestKeys.all, 'current'],
    }),
  ])
}

export function usePendingStoreRequests() {
  const enabled = useRequestAccess()
  const client = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: storeRequestKeys.pending,
    queryFn: async ({ pageParam, signal }) => {
      const result = await fetchPendingStoreRequests(pageParam, signal)
      signal.throwIfAborted()
      return result
    },
    initialPageParam: undefined as QueryDocumentSnapshot | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  return { ...query, refresh: () => refreshRequests(client) }
}

export function useStoreRequestCurrent(request: StoreRequest) {
  const enabled = useRequestAccess()
  return useQuery({
    queryKey: storeRequestKeys.current(request.id),
    queryFn: async ({ signal }) => {
      const result = await readStoreForRequest(request.targetStoreId, signal)
      signal.throwIfAborted()
      return result
    },
    enabled: enabled && request.kind === 'update',
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

export function useReviewStoreRequest() {
  const admin = useAdmin()
  const client = useQueryClient()
  const access = useRef(admin.status)
  useEffect(() => {
    access.current = admin.status
  }, [admin.status])
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: 'approve' | 'reject'
    }) => {
      if (access.current !== 'admin')
        throw new Error('管理者権限を確認できません。再ログインしてください。')
      if (action === 'approve') await approveStoreRequest(id)
      else await rejectStoreRequest(id)
    },
    onSuccess: async (_, { id, action }) => {
      if (access.current === 'admin')
        client.setQueryData<InfiniteData<PendingRequestPage>>(
          storeRequestKeys.pending,
          (previous) =>
            previous && {
              ...previous,
              pages: previous.pages.map((page) => ({
                ...page,
                requests: page.requests.filter((request) => request.id !== id),
              })),
            },
        )
      await Promise.allSettled([
        ...(action === 'approve'
          ? [
              client.resetQueries({
                queryKey: ['stores', ...firebaseQueryScope],
              }),
              client.invalidateQueries({
                queryKey: ['placeLinks', ...firebaseQueryScope],
              }),
            ]
          : []),
        ...(access.current === 'admin' ? [refreshRequests(client)] : []),
      ])
    },
  })
}
