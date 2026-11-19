import { useId, type ReactNode } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  availabilityLabels,
  formatEquipmentCount,
  type Store,
} from './store-schema'
import { registrationLabels, type MapEntry } from '../places/map-entries'
import type { PlacesSearchState } from '../places/nearby-places'
import type { useStores } from './use-stores'
import type { MapPoint } from '../map/map-config'
import { pointDistance } from '../map/search-area'

type Props = {
  areaLabel?: string
  query: ReturnType<typeof useStores>
  selectedContent: ReactNode
  onSelectStore: (id: string) => void
  entries: MapEntry[]
  placesStatus: PlacesSearchState['status']
  onSelectPlace: (id: string) => void
  onRefresh: () => void
  registrationFetching: boolean
  registrationError: boolean
  onRetryPlaces: () => void
  searchSuspended?: boolean
  viewportSearch?: boolean
  placesPartialError?: boolean
  unfilteredEntries?: MapEntry[]
  hasFilters?: boolean
  searchCenter?: MapPoint
  onClearFilters?: () => void
}

export function StorePanel({
  areaLabel,
  query,
  selectedContent,
  onSelectStore,
  entries,
  placesStatus,
  onSelectPlace,
  onRefresh,
  registrationFetching,
  registrationError,
  onRetryPlaces,
  searchSuspended = false,
  viewportSearch = false,
  placesPartialError = false,
  unfilteredEntries = entries,
  hasFilters = false,
  searchCenter,
  onClearFilters,
}: Props) {
  const listId = useId()
  const result = query.data
  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        <span>
          {entries.length}件{hasFilters && 'が一致'}
        </span>
        <span>登録店舗 {entries.filter((entry) => entry.store).length}件</span>
        {areaLabel && <span>{areaLabel}</span>}
      </p>
      {(query.isError || registrationError) && (
        <Button
          variant="outline"
          className="mb-4 h-11"
          disabled={
            !query.enabled ||
            query.isFetching ||
            registrationFetching ||
            searchSuspended
          }
          onClick={onRefresh}
        >
          店舗情報を再取得
        </Button>
      )}

      {(placesStatus === 'error' || placesPartialError) && (
        <Button
          variant="outline"
          className="mb-4 h-11"
          disabled={searchSuspended || placesStatus === 'loading'}
          onClick={onRetryPlaces}
        >
          コンビニ検索を再試行
        </Button>
      )}

      {selectedContent ? (
        <div className="pt-5">{selectedContent}</div>
      ) : entries.length > 0 ? (
        <ul
          aria-label="周辺店舗一覧"
          className="-mx-5 divide-y border-b sm:-mx-7"
        >
          {entries.map((entry, index) => {
            const store = entry.store
            const statusId = `${listId}-${index}-status`
            const distanceId = `${listId}-${index}-distance`
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/65 sm:px-7"
                  onClick={() =>
                    store
                      ? onSelectStore(store.id)
                      : onSelectPlace(entry.place!.id)
                  }
                  aria-label={`${entry.name}の詳細を見る`}
                  aria-describedby={
                    searchCenter ? `${statusId} ${distanceId}` : statusId
                  }
                >
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                    <span
                      role="heading"
                      aria-level={3}
                      className="text-sm leading-5 font-semibold wrap-anywhere"
                    >
                      {entry.name}
                    </span>
                    <span className="flex max-w-full flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span id={statusId} className="inline-flex max-w-full">
                        {store ? (
                          <AvailabilityBadge store={store} />
                        ) : (
                          <Badge
                            variant="secondary"
                            className="h-auto min-h-6 max-w-full py-0.5 text-left whitespace-normal"
                          >
                            {registrationLabels[entry.registration]}
                          </Badge>
                        )}
                      </span>
                      {searchCenter && (
                        <span
                          id={distanceId}
                          className="text-xs font-medium text-foreground"
                        >
                          検索地点から約
                          {formatDistance(
                            pointDistance(searchCenter, entry.location),
                          )}
                          （直線距離）
                        </span>
                      )}
                    </span>
                    <span className="text-xs leading-5 wrap-anywhere text-muted-foreground">
                      {store?.address ?? entry.place?.address}
                    </span>
                    {!store && (
                      <span className="text-xs text-muted-foreground">
                        Google Maps の店舗情報
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      ) : hasFilters && unfilteredEntries.length > 0 ? (
        <Empty role="status" className="px-0">
          <EmptyDescription>
            取得できた店舗に、条件に一致する店舗はありません。
          </EmptyDescription>
          {onClearFilters && (
            <Button
              variant="outline"
              className="mt-3 h-11"
              onClick={onClearFilters}
            >
              検索条件を解除
            </Button>
          )}
        </Empty>
      ) : (
        result && (
          <Empty role="status" className="px-0">
            <EmptyDescription>
              {result.invalidCount
                ? '表示できる店舗情報がありません。'
                : result.truncated
                  ? '取得した候補に表示できる店舗がありません。'
                  : areaLabel
                    ? viewportSearch
                      ? '地図の表示範囲内に登録された店舗はありません。'
                      : '半径3km以内に登録された店舗はありません。'
                    : '登録された店舗はありません。'}
            </EmptyDescription>
          </Empty>
        )
      )}
    </>
  )
}

function formatDistance(meters: number) {
  return meters < 1000
    ? `${Math.round(meters / 10) * 10}m`
    : `${(meters / 1000).toFixed(1)}km`
}

export function SelectedStoreDetails({
  store,
  directionsAction,
  onEdit,
  editLabel = '店舗を編集',
  editDisabled = false,
}: {
  store: Store
  directionsAction?: ReactNode
  onEdit?: () => void
  editLabel?: string
  editDisabled?: boolean
}) {
  return (
    <>
      <StoreDetails store={store} directionsAction={directionsAction} />
      {onEdit && (
        <Button
          variant="outline"
          className="mt-5 w-full"
          onClick={onEdit}
          disabled={editDisabled}
        >
          {editLabel}
        </Button>
      )}
    </>
  )
}

export function AvailabilityBadge({ store }: { store: Store }) {
  const available = store.availability === 'available'
  const Icon = available ? Check : X
  const style = available
    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
    : 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
  return (
    <Badge variant="secondary" className={`h-6 font-semibold ${style}`}>
      <Icon aria-hidden="true" />
      {availabilityLabels[store.availability]}
    </Badge>
  )
}

export function StoreDetails({
  store,
  directionsAction,
}: {
  store: Store
  directionsAction?: ReactNode
}) {
  const equipment =
    store.availability === 'available'
      ? [
          {
            label: '共用個室',
            count: store.stalls.shared,
            unit: '室',
            icon: '🚻',
          },
          {
            label: '男性用個室',
            count: store.stalls.male,
            unit: '室',
            icon: '🚹',
          },
          {
            label: '女性用個室',
            count: store.stalls.female,
            unit: '室',
            icon: '🚺',
          },
          {
            label: '男性用小便器',
            count: store.urinals,
            unit: '基',
            icon: <UrinalIcon />,
          },
        ].filter(({ count }) => count !== 0)
      : []
  return (
    <article className="map-panel-enter" aria-label="店舗の詳細">
      <h3 className="text-lg leading-6 font-semibold tracking-tight wrap-anywhere max-lg:pr-10">
        {store.name}
      </h3>
      <p className="mt-1 text-xs leading-5 wrap-anywhere text-muted-foreground">
        {store.address}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">貸出状況</h4>
        <AvailabilityBadge store={store} />
      </div>
      {directionsAction}
      {equipment.length > 0 && (
        <dl
          aria-label="トイレ設備"
          className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3"
        >
          {equipment.map(({ label, count, unit, icon }) => (
            <div key={label} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center text-base"
                >
                  {icon}
                </span>
                {label}
              </dt>
              <dd className="pl-6.5 text-base font-semibold tabular-nums">
                {formatEquipmentCount(count, unit)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {store.notes.trim() && (
        <>
          <Separator className="mt-4" />
          <div className="pt-3">
            <h4 className="text-xs font-medium text-muted-foreground">備考</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
              {store.notes}
            </p>
          </div>
        </>
      )}
    </article>
  )
}

function UrinalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 3h10v10a5 5 0 0 1-10 0V3Z" />
      <path d="M10 7h4M9 11v2a3 3 0 0 0 6 0v-2M12 18v3m-2 0h4" />
    </svg>
  )
}
