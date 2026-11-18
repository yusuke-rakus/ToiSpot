import { useEffect } from 'react'
import { toast } from 'sonner'
import type { PlacesSearchState } from '../places/nearby-places'
import type { useStores } from '../stores/use-stores'

type SearchNotice = 'info' | 'warning' | 'error' | 'loading'

export function useMapNotice(
  type: SearchNotice,
  message: string | false | null | undefined,
  description?: string | false,
) {
  useEffect(() => {
    if (!message) return
    const id = toast[type](message, { description: description || undefined })
    return () => {
      toast.dismiss(id)
    }
  }, [type, message, description])
}

export function useMapSearchNotifications({
  stores,
  places,
  registrationError,
  searchPaused,
  searchSuspended,
  viewportSearch,
  onRetryPlaces,
}: {
  stores: ReturnType<typeof useStores>
  places: PlacesSearchState
  registrationError: boolean
  searchPaused: boolean
  searchSuspended: boolean
  viewportSearch: boolean
  onRetryPlaces: () => void
}) {
  const result = stores.data
  const invalidCount = result?.invalidCount ?? 0

  useMapNotice('warning', !stores.enabled && '登録情報を利用できません。')
  useMapNotice('info', searchPaused && '地図を拡大すると検索を再開します')
  useMapNotice(
    'loading',
    stores.enabled &&
      stores.isPending &&
      !searchSuspended &&
      '店舗情報を読み込み中',
  )
  useMapNotice(
    'error',
    stores.isError && '店舗情報を読み込めませんでした。更新してください。',
    Boolean(result) && '表示中の情報は前回取得した内容です。',
  )
  useMapNotice(
    'warning',
    invalidCount > 0 &&
      `形式が正しくない${invalidCount}件を表示できませんでした。`,
  )
  useMapNotice(
    'warning',
    result?.truncated && '取得上限に達したため、一部の店舗を表示しています。',
  )
  useMapNotice(
    'error',
    registrationError && '登録情報を確認できません。更新してください。',
  )

  const { status, limited, partialError, requestId } = places
  const hasPlaces = places.places.length > 0
  const viewportLimited = viewportSearch && limited
  const requestsFailed = status === 'error' || (viewportSearch && partialError)
  useMapNotice(
    'loading',
    status === 'loading' && !searchSuspended && '周辺のコンビニを検索中',
  )
  useEffect(() => {
    if (
      status !== 'success' ||
      searchSuspended ||
      viewportLimited ||
      hasPlaces ||
      requestsFailed
    )
      return
    const id = toast.info('周辺にコンビニが見つかりません。')
    return () => {
      toast.dismiss(id)
    }
  }, [
    status,
    searchSuspended,
    viewportLimited,
    hasPlaces,
    requestsFailed,
    requestId,
  ])

  useEffect(() => {
    if (!requestsFailed || status === 'loading' || searchSuspended) return
    const failed = status === 'error'
    const id = toast.error(
      failed
        ? 'コンビニを検索できませんでした。'
        : '一部の範囲のコンビニを取得できませんでした。',
      {
        description:
          failed && viewportSearch && hasPlaces
            ? '前回取得したコンビニを表示しています。'
            : undefined,
        action: { label: 'コンビニ検索を再試行', onClick: onRetryPlaces },
      },
    )
    return () => {
      toast.dismiss(id)
    }
  }, [
    requestsFailed,
    status,
    searchSuspended,
    viewportSearch,
    hasPlaces,
    requestId,
    onRetryPlaces,
  ])
}
