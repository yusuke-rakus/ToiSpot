import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  type MapCameraProps,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps'
import { useNavigate } from '@tanstack/react-router'
import { List, LocateFixed, MapPin, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { AppHeaderActions } from '@/components/app-header'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DestinationSearch } from '@/features/search/destination-search'
import type { SearchDestination } from '@/features/search/use-destination-search'
import { FilterControls } from '@/features/search/filter-controls'
import {
  EMPTY_SEARCH_FILTERS,
  activeFilterCount,
  filterMapEntries,
  type SearchFilters,
} from '@/features/search/search-filters'
import { useTheme } from '@/components/theme-provider'
import { firebaseConnection, usesFirebaseEmulators } from '@/lib/firebase'
import { useStores } from '@/features/stores/use-stores'
import { SelectedStoreDetails, StorePanel } from '@/features/stores/store-panel'
import { StoreMarkers } from '@/features/stores/store-markers'
import type { Store } from '@/features/stores/store-schema'
import { useAdmin } from '@/features/auth/admin-provider'
import { StoreEditor } from '@/features/stores/store-editor'
import {
  allocateStoreId,
  type StoreWriteTarget,
} from '@/features/stores/store-writer'
import {
  allocateStoreRequestId,
  readStoreForRequest,
} from '@/features/store-requests/store-request-repository'
import type { StoreRequestTarget } from '@/features/store-requests/store-request-schema'
import {
  getMapConfig,
  DEFAULT_PLACES_CONFIG,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  locationErrorMessage,
  type AdminLoginArea,
  type MapConfig,
  type MapPoint,
  type PlacesConfig,
} from './map-config'
import {
  areaCenter,
  isViewport,
  MAX_NEARBY_RADIUS_METERS,
  pointDistance,
  viewportSearchRadius,
  type MapViewport,
  type SearchArea,
} from './search-area'
import { useViewportSearch } from './use-viewport-search'
import { StoreDirectionsLink } from './store-directions-link'
import {
  useMapNotice,
  useMapSearchNotifications,
} from './use-map-notifications'

import { useNearbyPlaces, type ConveniencePlace } from '../places/nearby-places'
import { usePlaceLinks } from '../places/place-links'
import { mergeMapEntries, type MapEntry } from '../places/map-entries'
import { PlaceDetails } from '../places/place-details'
import { PlaceMarkers } from '../places/place-markers'

const configFromEnv = getMapConfig(import.meta.env)
const libraries = ['marker']
const adminLoginClickIntervalMs = 1000
const renderedMaps = new WeakSet<google.maps.Map>()
// Tailwind の lg と同じ境界で、デスクトップではポータルを開かない。
const mobileQuery = '(width < 64rem)'

function subscribeToMobileLayout(onChange: () => void) {
  const media = window.matchMedia?.(mobileQuery)
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

function isMobileLayout() {
  return window.matchMedia?.(mobileQuery).matches ?? false
}

export function MapPage({ config = configFromEnv }: { config?: MapConfig }) {
  const content = <MapPageContent config={config} />
  return config.apiKey ? (
    <APIProvider
      apiKey={config.apiKey}
      libraries={libraries}
      language="ja"
      region="JP"
      version="quarterly"
      onError={() => {
        // SDKのエラー本文にはAPIキーが含まれる可能性がある。
      }}
    >
      {content}
    </APIProvider>
  ) : (
    content
  )
}

function MapPageContent({ config }: { config: MapConfig }) {
  const placesConfig = config.places ?? DEFAULT_PLACES_CONFIG
  const [searchTarget, setSearchTarget] = useState<SearchArea>(INITIAL_CENTER)
  const searchCenter = areaCenter(searchTarget)
  const [suspended, setSuspended] = useState(placesConfig.autoSearch)
  const [zoomPaused, setZoomPaused] = useState(false)
  const searchSuspended = useRef(placesConfig.autoSearch)
  const searchEpoch = useRef(0)
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_SEARCH_FILTERS)
  const [destination, setDestination] = useState<
    (SearchDestination & { requestId: number }) | null
  >(null)
  const [locationRequest, setLocationRequest] = useState(0)
  const [searchCloseSignal, setSearchCloseSignal] = useState(0)
  const [mapControls, setMapControls] = useState({
    ready: false,
    locating: false,
  })
  const [mobileListOpen, setMobileListOpen] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [sheetElement, setSheetElement] = useState<HTMLDivElement | null>(null)
  const [sheetHeight, setSheetHeight] = useState(0)
  const floatingSearchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sheetElement) return
    const observer = new ResizeObserver(() =>
      setSheetHeight(sheetElement.getBoundingClientRect().height),
    )
    observer.observe(sheetElement)
    return () => observer.disconnect()
  }, [sheetElement])
  useEffect(() => {
    const resize = () => {
      const node = floatingSearchRef.current
      if (node)
        node.style.setProperty(
          '--search-available-height',
          `${Math.max(120, (window.visualViewport?.height ?? window.innerHeight) - node.getBoundingClientRect().top - 12)}px`,
        )
    }
    resize()
    window.visualViewport?.addEventListener('resize', resize)
    window.addEventListener('resize', resize)
    return () => {
      window.visualViewport?.removeEventListener('resize', resize)
      window.removeEventListener('resize', resize)
    }
  }, [])
  const places = useNearbyPlaces()
  const links = usePlaceLinks(
    places.places,
    places.requestId,
    suspended || places.status === 'loading',
  )
  const storesQuery = useStores(searchTarget, suspended)
  const admin = useAdmin()
  const navigate = useNavigate()
  const [editor, setEditor] = useState<{
    target: StoreWriteTarget
    place?: ConveniencePlace
    mode: 'direct' | 'request'
    requestTarget?: StoreRequestTarget
  } | null>(null)
  const [preparingRequest, setPreparingRequest] = useState(false)
  const requestPreparation = useRef<AbortController | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const listScrollTop = useRef(0)
  const listReturnLabel = useRef<string | null>(null)
  const focusDetail = useRef(false)
  const restoreListFocus = useRef(false)
  const sheetTrigger = useRef<HTMLElement | null>(null)
  const isMobile = useSyncExternalStore(subscribeToMobileLayout, isMobileLayout)
  const [selection, setSelection] = useState<
    { kind: 'store'; id: string } | { kind: 'place'; id: string } | null
  >(null)
  useEffect(
    () => () => requestPreparation.current?.abort(),
    [admin.status, selection?.kind, selection?.id],
  )
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0
  }, [selection])
  const allEntries = mergeMapEntries(
    storesQuery.data?.stores ?? [],
    places.places,
    links.data,
    !links.enabled || links.isError
      ? 'unavailable'
      : links.isPending || links.isFetching
        ? 'checking'
        : 'ready',
    searchCenter,
  )
  const entries = filterMapEntries(allEntries, filters)
  const hasFilters = activeFilterCount(filters) > 0
  const stores = entries.flatMap((entry) => (entry.store ? [entry.store] : []))
  const selectedEntry =
    selection?.kind === 'place'
      ? (entries.find((entry) => entry.place?.id === selection.id) ?? null)
      : null
  const selectedStore =
    selection?.kind === 'store'
      ? (stores.find((store) => store.id === selection.id) ?? null)
      : (selectedEntry?.store ?? null)
  if (selection && !selectedEntry && !selectedStore) {
    setSelection(null)
  }
  useLayoutEffect(() => {
    if (mobileScrollRef.current)
      mobileScrollRef.current.scrollTop = selection ? 0 : listScrollTop.current
    if (selection && focusDetail.current) {
      mobileScrollRef.current?.focus({ preventScroll: true })
      focusDetail.current = false
    } else if (
      !selection &&
      restoreListFocus.current &&
      mobileScrollRef.current
    ) {
      const buttons = [
        ...mobileScrollRef.current.querySelectorAll<HTMLButtonElement>(
          'button[aria-label]',
        ),
      ]
      const row =
        buttons.find(
          (button) =>
            button.getAttribute('aria-label') === listReturnLabel.current,
        ) ??
        buttons.find((button) =>
          button.getAttribute('aria-label')?.endsWith('の詳細を見る'),
        )
      row?.focus({ preventScroll: true })
      restoreListFocus.current = false
    }
  }, [selection, mobileListOpen])
  const clearSelection = () => setSelection(null)
  function rememberListFocus() {
    const active = document.activeElement
    const fromList =
      active instanceof HTMLElement &&
      Boolean(mobileScrollRef.current?.contains(active))
    listReturnLabel.current = fromList
      ? active.getAttribute('aria-label')
      : null
    focusDetail.current = fromList
  }
  const selectPlace = (id: string) => {
    rememberListFocus()
    setSelection({ kind: 'place', id })
  }
  const selectStore = (id: string) => {
    rememberListFocus()
    setSelection({ kind: 'store', id })
  }
  const search = places.search
  const cancel = places.cancel
  const viewportSearch = isViewport(searchTarget)
  const retryPlaces = useCallback(() => {
    if (searchSuspended.current) return
    if (viewportSearch) void search(searchTarget, placesConfig)
    else void search(searchTarget)
  }, [placesConfig, search, searchTarget, viewportSearch])
  useMapNotice('error', firebaseConnection.error)
  useMapSearchNotifications({
    stores: storesQuery,
    places,
    registrationError: links.isError,
    searchPaused: zoomPaused,
    searchSuspended: suspended,
    viewportSearch,
    onRetryPlaces: retryPlaces,
  })
  const suspendSearch = useCallback(
    (paused: boolean | null) => {
      searchSuspended.current = paused !== null
      if (paused !== null) searchEpoch.current += 1
      setSuspended(paused !== null)
      setZoomPaused(paused === true)
      if (paused !== null) cancel()
    },
    [cancel, setSuspended, setZoomPaused],
  )
  const searchViewport = useCallback(
    (viewport: MapViewport) => {
      const singleRequest =
        !placesConfig.autoSearch ||
        !placesConfig.expandedSearch ||
        placesConfig.maxRequests === 1
      const target = singleRequest
        ? { ...viewport, radiusMeters: viewportSearchRadius(viewport) }
        : viewport
      searchSuspended.current = false
      searchEpoch.current += 1
      setSearchTarget(target)
      setSuspended(false)
      setZoomPaused(false)
      if (!placesConfig.autoSearch) setSelection(null)
      void search(target, placesConfig)
    },
    [search, placesConfig, setSuspended, setZoomPaused, setSelection],
  )
  function closeResultPanel() {
    setMobileListOpen(false)
    setSelection(null)
  }
  function chooseDestination(point: SearchDestination) {
    closeResultPanel()
    listScrollTop.current = 0
    setDestination((previous) => ({
      ...point,
      requestId: (previous?.requestId ?? 0) + 1,
    }))
    suspendSearch(false)
  }
  const clearFilters = () => setFilters(EMPTY_SEARCH_FILTERS)
  async function refreshRegistration() {
    const epoch = searchEpoch.current
    if (searchSuspended.current)
      return {
        result: { data: storesQuery.data, isError: false },
        linked: { data: links.data, isError: false },
      }
    const result = await storesQuery.refetch()
    const linked =
      !searchSuspended.current &&
      epoch === searchEpoch.current &&
      places.places.length > 0 &&
      links.enabled
        ? await links.refetch()
        : null
    return { result, linked }
  }

  const canWrite =
    storesQuery.enabled &&
    !admin.busy &&
    (admin.status === 'admin' || admin.status === 'signedOut')
  function createStore(place: ConveniencePlace) {
    if (!canWrite || requestPreparation.current) return
    try {
      const direct = admin.status === 'admin'
      const id = direct ? allocateStoreId() : allocateStoreRequestId()
      setEditor({
        target: {
          id,
          googlePlaceId: place.id,
        },
        place,
        mode: direct ? 'direct' : 'request',
        requestTarget: direct
          ? undefined
          : {
              requestId: id,
              kind: 'create',
              targetStoreId: id,
              googlePlaceId: place.id,
              baseUpdatedAt: null,
            },
      })
    } catch {
      toast.error(
        usesFirebaseEmulators
          ? '登録の準備ができませんでした。Emulatorの接続を確認してください。'
          : '登録の準備ができませんでした。通信状態を確認してください。',
      )
    }
  }
  async function editStore(store: Store) {
    if (!canWrite || requestPreparation.current) return
    if (admin.status === 'admin') {
      setEditor({
        mode: 'direct',
        target: {
          id: store.id,
          googlePlaceId: store.googlePlaceId,
          original: store,
        },
      })
      return
    }
    const controller = new AbortController()
    requestPreparation.current = controller
    setPreparingRequest(true)
    try {
      const { store: current, baseUpdatedAt } = await readStoreForRequest(
        store.id,
        controller.signal,
      )
      controller.signal.throwIfAborted()
      setEditor({
        mode: 'request',
        target: {
          id: current.id,
          googlePlaceId: current.googlePlaceId,
          original: current,
        },
        requestTarget: {
          requestId: allocateStoreRequestId(),
          kind: 'update',
          targetStoreId: current.id,
          googlePlaceId: current.googlePlaceId,
          baseUpdatedAt,
        },
      })
    } catch {
      if (!controller.signal.aborted)
        toast.error(
          '修正申請の準備ができませんでした。通信状態と最新の店舗情報を確認し、「修正を申請」からもう一度お試しください。',
        )
    } finally {
      if (requestPreparation.current === controller) {
        requestPreparation.current = null
        setPreparingRequest(false)
      }
    }
  }
  async function requested() {
    setEditor(null)
    toast.success('申請を送信しました。')
  }
  async function saved(id: string) {
    const { result, linked } = await refreshRegistration()
    setEditor(null)
    if (result.isError || linked?.isError) {
      setSelection(null)
      toast.warning(
        '保存しました。一覧の再取得に失敗したため、更新ボタンで確認してください。',
      )
    } else if (
      result.data?.stores.some((store) => store.id === id) ||
      Object.values(linked?.data ?? {}).some((store) => store?.id === id)
    ) {
      setSelection({ kind: 'store', id })
      toast.success('店舗情報を保存しました。')
    } else {
      setSelection(null)
      toast.success(
        '保存しました。検索範囲・取得上限により一覧には表示されていません。',
      )
    }
  }

  const onEdit =
    canWrite && selectedStore ? () => void editStore(selectedStore) : undefined
  const editLabel = admin.status === 'admin' ? '店舗を編集' : '修正を申請'
  const selectedPlace = selectedEntry?.place
  const directionsLink = selectedStore ? (
    <StoreDirectionsLink
      location={selectedStore.location}
      placeId={selectedStore.googlePlaceId}
    />
  ) : selectedPlace ? (
    <StoreDirectionsLink
      location={selectedPlace.location}
      placeId={selectedPlace.id}
    />
  ) : null
  const inlineDirections =
    !isMobile && directionsLink ? (
      <div className="mt-3">{directionsLink}</div>
    ) : undefined
  const selectedContent = selectedStore ? (
    <SelectedStoreDetails
      store={selectedStore}
      directionsAction={inlineDirections}
      onEdit={onEdit}
      editLabel={editLabel}
      editDisabled={preparingRequest}
    />
  ) : selectedEntry && selectedPlace ? (
    <PlaceDetails
      key={selectedEntry.key}
      entry={selectedEntry}
      directionsAction={inlineDirections}
      canManage={admin.status === 'admin'}
      canRegister={canWrite}
      registering={preparingRequest}
      onRegister={() => createStore(selectedPlace)}
    />
  ) : null
  const areaLabel = viewportSearch
    ? searchTarget.radiusMeters === MAX_NEARBY_RADIUS_METERS
      ? '地図の中心から半径50km・近い順'
      : '地図の表示範囲・中心から近い順'
    : '東京駅から半径3km・近い順'
  const resultPanel = (
    <StorePanel
      query={storesQuery}
      entries={entries}
      unfilteredEntries={allEntries}
      hasFilters={hasFilters}
      searchCenter={searchCenter}
      onClearFilters={clearFilters}
      areaLabel={areaLabel}
      onSelectPlace={selectPlace}
      onRefresh={() => void refreshRegistration()}
      registrationFetching={links.isFetching}
      registrationError={links.isError}
      searchSuspended={suspended}
      viewportSearch={viewportSearch}
      placesStatus={places.status}
      placesPartialError={viewportSearch && places.partialError}
      onRetryPlaces={retryPlaces}
      selectedContent={selectedContent}
      onSelectStore={selectStore}
    />
  )

  return (
    <div className="flex h-svh min-h-[480px] flex-col bg-background text-foreground">
      <h1 className="sr-only">コンビニトイレマップ</h1>

      <main className="relative min-h-0 flex-1">
        <section
          aria-label="地図"
          className="absolute inset-0 isolate overflow-hidden bg-muted"
        >
          <div
            ref={floatingSearchRef}
            className={`pointer-events-auto absolute top-3 left-1/2 ${searchExpanded || filterOpen ? 'z-40' : 'z-20'} w-[calc(100%-24px)] max-w-md -translate-x-1/2 lg:top-4 lg:left-4 lg:w-96 lg:max-w-none lg:translate-x-0`}
            aria-label="場所検索と絞り込み"
          >
            <DestinationSearch
              center={searchCenter}
              disabled={!mapControls.ready}
              closeSignal={searchCloseSignal}
              filterOpen={filterOpen}
              filterCount={activeFilterCount(filters)}
              onSelect={chooseDestination}
              onOpenChange={(open) => {
                setSearchExpanded(open)
              }}
              controls={
                <FilterControls
                  filters={filters}
                  entries={allEntries}
                  onChange={setFilters}
                  onOpenChange={(open) => {
                    setFilterOpen(open)
                  }}
                />
              }
            >
              {!isMobile && (
                <aside
                  aria-label="店舗と選択した場所の情報"
                  className="flex min-h-0 flex-1 flex-col border-t"
                >
                  <ScrollArea
                    viewportRef={panelRef}
                    className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:max-h-[calc(var(--search-available-height,70dvh)-112px)]"
                  >
                    <div className="px-7 pb-7 pt-0">{resultPanel}</div>
                  </ScrollArea>
                </aside>
              )}
            </DestinationSearch>
          </div>
          <TooltipProvider delayDuration={300}>
            <div
              role="group"
              aria-label="地図の表示操作"
              className="absolute right-4 z-20 flex flex-col gap-3"
              style={{
                bottom:
                  isMobile && (mobileListOpen || selection)
                    ? `${sheetHeight + 12}px`
                    : 'calc(32px + env(safe-area-inset-bottom))',
              }}
            >
              {isMobile && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-12 rounded-full bg-background shadow-md"
                      aria-label={`店舗一覧を表示（${entries.length}件）`}
                      aria-pressed={mobileListOpen && !selection}
                      onClick={() => {
                        restoreListFocus.current = Boolean(
                          selection && listReturnLabel.current,
                        )
                        clearSelection()
                        setMobileListOpen(true)
                        setSearchCloseSignal((value) => value + 1)
                      }}
                    >
                      <List className="size-5" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">店舗一覧</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-12 rounded-full bg-background shadow-md"
                      disabled={!mapControls.ready || mapControls.locating}
                      aria-label="現在地に移動"
                      aria-busy={mapControls.locating}
                      onClick={() => {
                        closeResultPanel()
                        setSearchCloseSignal((value) => value + 1)
                        setLocationRequest((value) => value + 1)
                      }}
                    >
                      {mapControls.locating ? (
                        <Spinner aria-hidden="true" />
                      ) : (
                        <LocateFixed className="size-5" aria-hidden="true" />
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">現在地</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
          {config.apiKey ? (
            <MapCanvas
              isMobile={isMobile}
              hideSearchAction={searchExpanded || filterOpen}
              destination={destination}
              locationRequest={locationRequest}
              onControlsChange={setMapControls}
              onViewportSearch={searchViewport}
              onSuspendSearch={suspendSearch}
              placesConfig={placesConfig}
              searching={places.status === 'loading'}
              entries={entries}
              selectedPlace={selectedEntry}
              onPlaceSelect={selectPlace}
              mapId={config.mapId}
              stores={stores}
              selectedStore={selectedStore}
              onStoreSelect={selectStore}
              onClearSelection={closeResultPanel}
              adminLogin={
                config.adminLoginArea && admin.status !== 'admin'
                  ? {
                      ...config.adminLoginArea,
                      open: () => void navigate({ to: '/admin-login' }),
                    }
                  : undefined
              }
            />
          ) : (
            <>
              <MapTopControls />
              <MapNotice
                title="地図の設定が必要です"
                description=".envにVITE_GOOGLE_MAPS_API_KEYを設定し、開発サーバーを再起動してください。"
              />
            </>
          )}
        </section>
      </main>
      {isMobile && (
        <Sheet
          modal={false}
          open={mobileListOpen || Boolean(selectedContent)}
          onOpenChange={(open) => {
            if (!open) closeResultPanel()
          }}
        >
          <SheetContent
            ref={setSheetElement}
            className={`${selection ? 'max-h-[min(65dvh,calc(100svh-240px))]' : 'max-h-[65dvh]'} pb-[env(safe-area-inset-bottom)]`}
            aria-describedby={undefined}
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              const active = document.activeElement
              sheetTrigger.current =
                active instanceof HTMLElement ? active : null
              if (selection) {
                event.preventDefault()
                mobileScrollRef.current?.focus({ preventScroll: true })
              }
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              const trigger = sheetTrigger.current
              if (
                trigger?.isConnected &&
                document.activeElement === document.body
              )
                trigger.focus({ preventScroll: true })
            }}
          >
            <SheetTitle className="sr-only">
              {selection ? 'トイレ情報' : `周辺店舗一覧（${entries.length}件）`}
            </SheetTitle>
            <div
              ref={mobileScrollRef}
              tabIndex={selection ? -1 : undefined}
              role={selection ? 'region' : undefined}
              aria-label={selection ? '選択した店舗の情報' : undefined}
              key={selection && `${selection.kind}:${selection.id}`}
              className={`min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-7 ${selection ? 'pt-5' : 'pt-0'}`}
              onScroll={(event) => {
                if (!selection)
                  listScrollTop.current = event.currentTarget.scrollTop
              }}
            >
              {selection ? selectedContent : resultPanel}
            </div>
            {directionsLink && (
              <div className="shrink-0 border-t px-5 py-2.5 sm:px-7">
                {directionsLink}
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}
      {editor && (
        <StoreEditor
          target={editor.target}
          place={editor.place}
          mode={editor.mode}
          requestTarget={editor.requestTarget}
          onClose={() => setEditor(null)}
          onSaved={saved}
          onRequested={requested}
        />
      )}
    </div>
  )
}

function MapCanvas({
  hideSearchAction,
  isMobile,
  destination,
  locationRequest,
  onControlsChange,
  onViewportSearch,
  onSuspendSearch,
  placesConfig,
  searching,
  entries,
  selectedPlace,
  onPlaceSelect,
  mapId,
  stores,
  selectedStore,
  onStoreSelect,
  onClearSelection,
  adminLogin,
}: {
  isMobile: boolean
  hideSearchAction: boolean
  destination: (SearchDestination & { requestId: number }) | null
  locationRequest: number
  onControlsChange: (controls: { ready: boolean; locating: boolean }) => void
  onViewportSearch: (viewport: MapViewport) => void
  onSuspendSearch: (paused: boolean | null) => void
  placesConfig: PlacesConfig
  searching: boolean
  entries: MapEntry[]
  selectedPlace: MapEntry | null
  onPlaceSelect: (id: string) => void
  mapId: string
  stores: Store[]
  selectedStore: Store | null
  onStoreSelect: (id: string) => void
  onClearSelection: () => void
  adminLogin?: AdminLoginArea & { open: () => void }
}) {
  const { resolvedTheme } = useTheme()
  const status = useApiLoadingStatus()
  const map = useMap()
  const [camera, setCamera] = useState<MapCameraProps>({
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
    heading: 0,
    tilt: 0,
  })
  const focusedSelection = useRef<string | null>(null)
  const currentMap = useRef(map)
  useEffect(() => {
    currentMap.current = map
  }, [map])
  const [tilesReady, setTilesReady] = useState(false)
  // ログイン画面から戻ったとき、再利用した地図の描画完了通知は再発行されないことがある。
  if (!tilesReady && map && renderedMaps.has(map)) setTilesReady(true)
  const [slowLoading, setSlowLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationResolved, setLocationResolved] = useState(false)
  const [location, setLocation] = useState<MapPoint | null>(null)
  const locationNotice = useRef<ReturnType<typeof toast.warning>>(undefined)
  const mounted = useRef(false)
  const initialLocationRequested = useRef(false)
  const locationIntent = useRef(0)
  const handledDestination = useRef<number | null>(null)
  const handledLocationRequest = useRef(0)

  const authFailure = status === APILoadingStatus.AUTH_FAILURE
  const failed = authFailure || status === APILoadingStatus.FAILED
  const ready = status === APILoadingStatus.LOADED && tilesReady && !failed
  useEffect(() => {
    onControlsChange({ ready, locating })
  }, [ready, locating, onControlsChange])
  const focusId = selectedStore?.id ?? selectedPlace?.key
  const focusLat = selectedStore?.location.lat ?? selectedPlace?.location.lat
  const focusLng = selectedStore?.location.lng ?? selectedPlace?.location.lng
  const locatingRef = useRef(false)
  const searchGuard = useRef(false)
  const adminLoginClicks = useRef<{ at: number; count: number } | null>(null)
  const adminLoginOpening = useRef(false)

  function handleAdminLoginClick(event: MapMouseEvent, doubleClick = false) {
    const previousClicks = adminLoginClicks.current
    adminLoginClicks.current = null
    const point = event.detail.latLng
    if (
      !adminLogin ||
      adminLoginOpening.current ||
      !point ||
      pointDistance(adminLogin.center, point) > adminLogin.radiusMeters
    )
      return

    const now = performance.now()
    const count =
      previousClicks && now - previousClicks.at <= adminLoginClickIntervalMs
        ? previousClicks.count + 1
        : 1
    // スマホのダブルタップはSDKの拡大操作に譲り、ログインは3回タップにする。
    if (doubleClick || count >= (isMobile ? 3 : 2)) {
      adminLoginOpening.current = true
      event.stop()
      adminLogin.open()
    } else {
      adminLoginClicks.current = { at: now, count }
    }
  }

  const viewportSearch = useViewportSearch({
    map,
    autoSearch: placesConfig.autoSearch,
    ready: ready && locationResolved && !locating,
    minZoom: placesConfig.minZoom,
    onSearch: onViewportSearch,
    onSuspend: onSuspendSearch,
  })
  const suppressPan = viewportSearch.suppressPan
  const preparePan = viewportSearch.preparePan
  const onViewportIdle = viewportSearch.onIdle
  useEffect(() => {
    if (
      !map ||
      !ready ||
      !destination ||
      handledDestination.current === destination.requestId
    )
      return
    handledDestination.current = destination.requestId
    // 遅れて返る初回位置情報は、利用者が選んだ目的地を上書きしない。
    locationIntent.current += 1
    locatingRef.current = false
    initialLocationRequested.current = true
    setLocating(false)
    setLocationResolved(true)
    if (locationNotice.current !== undefined) {
      toast.dismiss(locationNotice.current)
      locationNotice.current = undefined
    }
    const zoom = Math.max(15, placesConfig.minZoom)
    preparePan(destination.location, zoom)
    const currentCenter = map.getCenter()?.toJSON()
    const unchanged =
      currentCenter &&
      pointDistance(currentCenter, destination.location) < 0.01 &&
      map.getZoom() === zoom
    map.panTo(destination.location)
    map.setZoom(zoom)
    // 同じ地点・ズームの再選択ではSDKがidleを発行しない場合がある。
    if (unchanged) onViewportIdle()
  }, [
    map,
    ready,
    destination,
    preparePan,
    onViewportIdle,
    placesConfig.minZoom,
  ])
  useEffect(() => {
    if (!focusId) {
      focusedSelection.current = null
      return
    }
    if (!map || !focusId || focusLat === undefined || focusLng === undefined)
      return
    const selection = `${focusId}:${focusLat}:${focusLng}`
    // テーマ変更によるSDK内部の地図交換では、選択店舗へ再移動しない。
    if (focusedSelection.current === selection) return
    focusedSelection.current = selection
    const center = { lat: focusLat, lng: focusLng }
    const zoom = Math.max(map.getZoom() ?? INITIAL_ZOOM, INITIAL_ZOOM)
    suppressPan(center, zoom)
    map.panTo(center)
    map.setZoom(zoom)
  }, [map, focusId, focusLat, focusLng, suppressPan])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (locationNotice.current !== undefined) {
        toast.dismiss(locationNotice.current)
        locationNotice.current = undefined
      }
    }
  }, [])

  useEffect(() => {
    if (ready || failed) return
    const timer = window.setTimeout(() => setSlowLoading(true), 20_000)
    return () => window.clearTimeout(timer)
  }, [ready, failed])

  const locate = useCallback(() => {
    if (!map || !ready || locatingRef.current) return
    if (locationNotice.current !== undefined) {
      toast.dismiss(locationNotice.current)
      locationNotice.current = undefined
    }
    if (!navigator.geolocation) {
      locationNotice.current = toast.warning(
        'このブラウザでは現在地を取得できません。地図を移動して「この周辺を検索」を押してください。',
      )
      setLocationResolved(true)
      return
    }
    locatingRef.current = true
    setLocating(true)
    const intent = ++locationIntent.current
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!mounted.current) return
        const point = { lat: coords.latitude, lng: coords.longitude }
        if (intent !== locationIntent.current) return
        setLocation(point)
        setLocationResolved(true)
        locatingRef.current = false
        setLocating(false)
        const activeMap = currentMap.current
        if (!activeMap) return
        const zoom = Math.max(
          activeMap.getZoom() ?? 15,
          15,
          placesConfig.minZoom,
        )
        const center = activeMap.getCenter()?.toJSON()
        const unchanged =
          center &&
          pointDistance(center, point) < 0.01 &&
          activeMap.getZoom() === zoom
        preparePan(point, zoom)
        activeMap.panTo(point)
        activeMap.setZoom(zoom)
        if (unchanged) onViewportIdle()
      },
      (error) => {
        if (!mounted.current || intent !== locationIntent.current) return
        locatingRef.current = false
        setLocating(false)
        locationNotice.current = toast.warning(locationErrorMessage(error.code))
        setLocationResolved(true)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [map, ready, preparePan, onViewportIdle, placesConfig.minZoom])

  useEffect(() => {
    if (locationRequest === handledLocationRequest.current || !ready) return
    handledLocationRequest.current = locationRequest
    locate()
  }, [locationRequest, ready, locate])

  useEffect(() => {
    if (!map || !ready || initialLocationRequested.current) return
    initialLocationRequested.current = true
    locate()
  }, [map, ready, locate])

  if (failed) {
    return (
      <>
        <MapTopControls />
        <MapNotice
          title={
            authFailure ? '地図を利用できません' : '地図を読み込めませんでした'
          }
          description={
            authFailure
              ? 'APIキーの有効性、Maps JavaScript APIの有効化、アクセス元の制限を確認してください。'
              : '通信状態やブラウザの設定を確認して、もう一度お試しください。'
          }
          action={<ReloadButton />}
        />
      </>
    )
  }

  return (
    <>
      <GoogleMap
        mapId={mapId}
        colorScheme={resolvedTheme === 'dark' ? 'DARK' : 'LIGHT'}
        {...camera}
        onCameraChanged={({
          detail: { center, zoom, heading, tilt, bounds },
        }) => {
          setCamera({ center, zoom, heading, tilt })
          viewportSearch.onChange({ center, zoom, bounds })
        }}
        onClick={(event) => {
          onClearSelection()
          if (adminLogin) handleAdminLoginClick(event)
        }}
        // PCではclickの発火順に関わらず、dblclick自体も判定する。
        onDblclick={
          adminLogin && !isMobile
            ? (event) => handleAdminLoginClick(event, true)
            : undefined
        }
        onDragstart={() => {
          adminLoginClicks.current = null
          // 地図の手動操作も、進行中の初回現在地取得より優先する。
          locationIntent.current += 1
          if (locatingRef.current) {
            locatingRef.current = false
            setLocating(false)
            setLocationResolved(true)
          }
          viewportSearch.onDragStart()
        }}
        reuseMaps
        clickableIcons={false}
        gestureHandling="greedy"
        draggableCursor="default"
        isFractionalZoomEnabled
        disableDoubleClickZoom={false}
        disableDefaultUI
        cameraControl={false}
        headingInteractionEnabled={false}
        tiltInteractionEnabled={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={false}
        onTilesLoaded={({ map }) => {
          renderedMaps.add(map)
          setTilesReady(true)
        }}
        onIdle={onViewportIdle}
        aria-label="周辺の地図"
        style={{ width: '100%', height: '100%' }}
      >
        <StoreMarkers stores={stores} onSelect={onStoreSelect} />
        <PlaceMarkers entries={entries} onSelect={onPlaceSelect} />
        {location && (
          <AdvancedMarker position={location} title="現在地" anchorTop="-50%">
            <span className="block size-5 rounded-full border-[3px] border-white bg-primary shadow-[0_0_0_7px_color-mix(in_oklch,var(--primary)_18%,transparent)]" />
          </AdvancedMarker>
        )}
      </GoogleMap>

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/95">
          {slowLoading ? (
            <MapNotice
              title="地図の読み込みに時間がかかっています"
              description="通信状態やAPIの設定を確認してください。読み込みが完了すると地図が表示されます。"
              action={<ReloadButton />}
            />
          ) : (
            <p
              role="status"
              className="flex items-center gap-3 text-sm text-muted-foreground"
            >
              <Spinner
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              地図を読み込んでいます
            </p>
          )}
        </div>
      )}

      <MapTopControls>
        {!placesConfig.autoSearch && !hideSearchAction && (
          <Button
            variant="outline"
            className="pointer-events-auto h-8 rounded-xl bg-background shadow-sm transition max-[360px]:px-1.5 max-[360px]:text-xs"
            disabled={!ready || locating || searching}
            onClick={() => {
              if (searchGuard.current) return
              searchGuard.current = true
              viewportSearch.searchNow()
              queueMicrotask(() => {
                searchGuard.current = false
              })
            }}
          >
            {searching ? 'コンビニを検索中' : 'この周辺を検索'}
          </Button>
        )}
      </MapTopControls>
    </>
  )
}

function MapTopControls({ children }: { children?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[68px] z-10 flex h-10 items-center justify-center lg:top-3 lg:z-30">
      {children}
      <div
        role="group"
        aria-label="マップのアプリ操作"
        className="pointer-events-auto absolute right-3 max-[360px]:right-2 lg:right-4"
      >
        <AppHeaderActions glass />
      </div>
    </div>
  )
}

function MapNotice({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center px-6 py-8">
      <Empty className="max-w-sm p-0" role="alert">
        <EmptyHeader>
          <EmptyMedia>
            <MapPin
              className="mx-auto mb-5 size-7 text-muted-foreground"
              aria-hidden="true"
            />
          </EmptyMedia>
          <EmptyTitle>
            <h2>{title}</h2>
          </EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        {action && <EmptyContent>{action}</EmptyContent>}
      </Empty>
    </div>
  )
}

function ReloadButton() {
  return (
    <Button variant="outline" onClick={() => window.location.reload()}>
      <RotateCcw aria-hidden="true" />
      再読み込み
    </Button>
  )
}
