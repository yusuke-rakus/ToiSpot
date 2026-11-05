import { useEffect, useState } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { usesFirebaseEmulators } from '@/lib/firebase'
import { fetchLocalStores } from './store-repository'
import type { StoreListResult } from './store-schema'
import {
  isViewport,
  searchAreaKey,
  type SearchArea,
} from '@/features/map/search-area'

export function useStores(area: SearchArea, suspended = false) {
  const client = useQueryClient()
  const [lastResult, setLastResult] = useState<StoreListResult>()
  const key = searchAreaKey(area)
  const query = useQuery({
    queryKey: ['stores', 'emulator', 'demo-toilet-map', key],
    queryFn: ({ signal }) => fetchLocalStores(area, signal),
    enabled: usesFirebaseEmulators && !suspended,
    placeholderData: isViewport(area) ? keepPreviousData : undefined,
  })
  // Queryのplaceholderは失敗時に消えるため、最後に成功した表示も保持する。
  if (
    isViewport(area) &&
    query.isSuccess &&
    !query.isPlaceholderData &&
    query.data !== lastResult
  )
    setLastResult(query.data)
  useEffect(() => {
    if (suspended)
      void client.cancelQueries({
        queryKey: ['stores', 'emulator', 'demo-toilet-map', key],
        exact: true,
      })
  }, [client, key, suspended])
  return {
    ...query,
    data: isViewport(area) ? (query.data ?? lastResult) : query.data,
    enabled: usesFirebaseEmulators,
  }
}
