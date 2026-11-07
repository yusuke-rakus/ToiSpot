import type { ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  RefreshCw,
  Store as StoreIcon,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from '@/components/ui/item'
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

type Props = {
  areaLabel?: string
  query: ReturnType<typeof useStores>
  selectedStore: Store | null
  pointContent: ReactNode
  onSelectStore: (id: string) => void
  onBack: () => void
  onEdit?: () => void
  entries: MapEntry[]
  placesStatus: PlacesSearchState['status']
  onSelectPlace: (id: string) => void
  onRefresh: () => void
  registrationFetching: boolean
  registrationError: boolean
  onRetryPlaces: () => void
  searchPaused?: boolean
  searchSuspended?: boolean
  viewportSearch?: boolean
  placesLimited?: boolean
  placesPartialError?: boolean
}

export function StorePanel({
  areaLabel,
  query,
  selectedStore,
  pointContent,
  onSelectStore,
  onBack,
  onEdit,
  entries,
  placesStatus,
  onSelectPlace,
  onRefresh,
  registrationFetching,
  registrationError,
  onRetryPlaces,
  searchPaused = false,
  searchSuspended = false,
  viewportSearch = false,
  placesLimited = false,
  placesPartialError = false,
}: Props) {
  const result = query.data
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">トイレ情報</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {result
              ? `登録店舗 ${entries.filter((entry) => entry.store).length}件`
              : '登録店舗を確認'}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-9 gap-1.5"
          disabled={
            !query.enabled ||
            query.isFetching ||
            registrationFetching ||
            searchSuspended
          }
          onClick={onRefresh}
          aria-label="店舗情報を更新"
        >
          {query.isFetching ? (
            <Spinner
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          更新
        </Button>
      </div>

      {areaLabel && (
        <p className="mb-4 text-xs text-muted-foreground">{areaLabel}</p>
      )}

      <StorePanelFeedback
        query={query}
        entries={entries}
        placesStatus={placesStatus}
        registrationError={registrationError}
        onRetryPlaces={onRetryPlaces}
        searchPaused={searchPaused}
        searchSuspended={searchSuspended}
        viewportSearch={viewportSearch}
        placesLimited={placesLimited}
        placesPartialError={placesPartialError}
      />

      {pointContent ? (
        <>
          <BackButton onClick={onBack} />
          {pointContent}
        </>
      ) : selectedStore ? (
        <>
          <BackButton onClick={onBack} />
          <SelectedStoreDetails store={selectedStore} onEdit={onEdit} />
        </>
      ) : entries.length > 0 ? (
        <ul
          aria-label="周辺店舗一覧"
          className="-mx-5 divide-y border-y sm:-mx-7"
        >
          {entries.map((entry) => {
            const store = entry.store
            return (
              <li key={entry.key}>
                <Item asChild className="rounded-none border-0 p-0">
                  <button
                    type="button"
                    className="group w-full px-5 py-4 text-left transition-colors hover:bg-muted/65 focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-7"
                    onClick={() =>
                      store
                        ? onSelectStore(store.id)
                        : onSelectPlace(entry.place!.id)
                    }
                    aria-label={`${entry.name}の詳細を見る`}
                  >
                    <ItemContent>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <ItemDescription className="text-[11px]">
                          {store ? store.chainName : 'Google Maps の店舗情報'}
                        </ItemDescription>
                        {store ? (
                          <AvailabilityBadge store={store} />
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">
                            {registrationLabels[entry.registration]}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <ItemTitle className="text-sm leading-6">
                          <h3>{entry.name}</h3>
                        </ItemTitle>
                        <ItemActions>
                          <ArrowUpRight
                            className="mt-1 size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </ItemActions>
                      </div>
                    </ItemContent>
                  </button>
                </Item>
              </li>
            )
          })}
        </ul>
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

export function StorePanelFeedback({
  query,
  entries,
  placesStatus,
  registrationError,
  onRetryPlaces,
  searchPaused = false,
  searchSuspended = false,
  viewportSearch = false,
  placesLimited = false,
  placesPartialError = false,
}: Pick<
  Props,
  | 'query'
  | 'entries'
  | 'placesStatus'
  | 'registrationError'
  | 'onRetryPlaces'
  | 'searchPaused'
  | 'searchSuspended'
  | 'viewportSearch'
  | 'placesLimited'
  | 'placesPartialError'
>) {
  const result = query.data
  return (
    <>
      {!query.enabled && <Notice>登録情報を利用できません。</Notice>}
      {searchPaused && <Notice>地図を拡大すると検索を再開します</Notice>}
      {query.enabled && query.isPending && !searchSuspended && (
        <p
          role="status"
          className="flex items-center gap-2 py-5 text-sm text-muted-foreground"
        >
          <Spinner
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          店舗情報を読み込み中
        </p>
      )}
      {query.isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            店舗情報を読み込めませんでした。更新してください。
            {result && '表示中の情報は前回取得した内容です。'}
          </AlertDescription>
        </Alert>
      )}
      {result && result.invalidCount > 0 && (
        <p
          role="status"
          className="mb-4 text-xs leading-5 text-muted-foreground"
        >
          形式が正しくない{result.invalidCount}件を表示できませんでした。
        </p>
      )}
      {result?.truncated && (
        <p
          role="status"
          className="mb-4 text-xs leading-5 text-muted-foreground"
        >
          取得上限に達したため、一部の店舗を表示しています。
        </p>
      )}

      {placesStatus === 'loading' && !searchSuspended && (
        <Notice>周辺のコンビニを検索中</Notice>
      )}
      {placesLimited && (
        <Notice>取得上限に達したため、一部のコンビニを表示しています。</Notice>
      )}
      {placesPartialError && placesStatus !== 'error' && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="space-y-2">
            <p>一部の範囲のコンビニを取得できませんでした。</p>
            <Button
              variant="outline"
              onClick={onRetryPlaces}
              disabled={searchSuspended || placesStatus === 'loading'}
            >
              コンビニ検索を再試行
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {placesStatus === 'error' && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="space-y-2">
            <p>コンビニを検索できませんでした。</p>
            {viewportSearch && entries.some((entry) => entry.place) && (
              <p>前回取得したコンビニを表示しています。</p>
            )}
            <Button
              variant="outline"
              onClick={onRetryPlaces}
              disabled={searchSuspended}
            >
              コンビニ検索を再試行
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {placesStatus === 'success' &&
        !placesPartialError &&
        !placesLimited &&
        entries.every((entry) => !entry.place) && (
          <Empty role="status" className="px-0">
            <EmptyDescription>
              周辺にコンビニが見つかりません。
            </EmptyDescription>
          </Empty>
        )}
      {registrationError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            登録情報を確認できません。更新してください。
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

export function SelectedStoreDetails({
  store,
  onEdit,
}: {
  store: Store
  onEdit?: () => void
}) {
  return (
    <>
      {onEdit && (
        <Button variant="outline" className="mb-5 w-full" onClick={onEdit}>
          店舗を編集
        </Button>
      )}
      <StoreDetails store={store} />
    </>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" className="mb-5 -ml-2" onClick={onClick}>
      <ArrowLeft aria-hidden="true" />
      一覧へ戻る
    </Button>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="py-4 text-sm leading-7 text-muted-foreground" role="status">
      {children}
    </p>
  )
}

export function AvailabilityBadge({ store }: { store: Store }) {
  const style =
    store.availability === 'available'
      ? 'bg-primary/10 text-primary'
      : 'bg-muted text-muted-foreground'
  return (
    <Badge
      variant="secondary"
      className={`shrink-0 px-2 py-1 text-[11px] ${style}`}
    >
      {availabilityLabels[store.availability]}
    </Badge>
  )
}

export function StoreDetails({ store }: { store: Store }) {
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
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <StoreIcon className="size-4" aria-hidden="true" />
        {store.chainName}
      </div>
      <h3 className="text-lg leading-7 font-semibold tracking-tight">
        {store.name}
      </h3>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        {store.address}
      </p>
      <Separator className="mt-6" />
      <div className="flex items-center justify-between gap-3 pt-5">
        <h4 className="text-xs font-medium text-muted-foreground">貸出状況</h4>
        <AvailabilityBadge store={store} />
      </div>
      {equipment.length > 0 && (
        <dl
          aria-label="トイレ設備"
          className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5"
        >
          {equipment.map(({ label, count, unit, icon }) => (
            <div key={label} className="min-w-0">
              <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center text-xl"
                >
                  {icon}
                </span>
                {label}
              </dt>
              <dd className="mt-1 pl-8 text-xl font-semibold tabular-nums">
                {formatEquipmentCount(count, unit)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {store.notes.trim() && (
        <>
          <Separator className="mt-6" />
          <div className="pt-5">
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
      className="size-6"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 3h10v10a5 5 0 0 1-10 0V3Z" />
      <path d="M10 7h4M9 11v2a3 3 0 0 0 6 0v-2M12 18v3m-2 0h4" />
    </svg>
  )
}
