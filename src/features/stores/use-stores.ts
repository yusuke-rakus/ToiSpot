import { useEffect, useState } from 'react'
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { firebaseEnabled, firebaseQueryScope } from '@/lib/firebase'
import { fetchStores } from './store-repository'
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
    queryKey: ['stores', ...firebaseQueryScope, key],
    queryFn: ({ signal }) => fetchStores(area, signal),
    enabled: firebaseEnabled && !suspended,
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
        queryKey: ['stores', ...firebaseQueryScope, key],
        exact: true,
      })
  }, [client, key, suspended])
  return {
    ...query,
    data: isViewport(area) ? (query.data ?? lastResult) : query.data,
    enabled: firebaseEnabled,
  }
}
