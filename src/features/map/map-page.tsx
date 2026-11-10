import {
  useCallback,
  useEffect,
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
import { CircleAlert, LocateFixed, MapPin, RotateCcw, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Alert, AlertDescription, AlertAction } from '@/components/ui/alert'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { useTheme } from '@/components/theme-provider'
import { firebaseConnection, usesFirebaseEmulators } from '@/lib/firebase'
import { useStores } from '@/features/stores/use-stores'
import {
  SelectedStoreDetails,
  StorePanel,
  StorePanelFeedback,
} from '@/features/stores/store-panel'
import { StoreMarkers } from '@/features/stores/store-markers'
import type { Store } from '@/features/stores/store-schema'
import { useAdmin } from '@/features/auth/admin-provider'
import { StoreEditor } from '@/features/stores/store-editor'
import {
  allocateStoreId,
  type StoreWriteTarget,
} from '@/features/stores/store-writer'
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
  pointDistance,
  type MapViewport,
  type SearchArea,
} from './search-area'
import { useViewportSearch } from './use-viewport-search'

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
  const placesConfig = config.places ?? DEFAULT_PLACES_CONFIG
  const [searchTarget, setSearchTarget] = useState<SearchArea>(INITIAL_CENTER)
  const searchCenter = areaCenter(searchTarget)
  const [suspended, setSuspended] = useState(placesConfig.autoSearch)
  const [zoomPaused, setZoomPaused] = useState(false)
  const searchSuspended = useRef(placesConfig.autoSearch)
  const searchEpoch = useRef(0)
  const [area, setArea] = useState<'initial' | 'location' | 'map'>('initial')
  const places = useNearbyPlaces()
  const links = usePlaceLinks(
    places.places,
    places.requestId,
    placesConfig.autoSearch && (suspended || places.status === 'loading'),
  )
  const storesQuery = useStores(searchTarget, suspended)
  const admin = useAdmin()
  const navigate = useNavigate()
  const [editor, setEditor] = useState<{
    target: StoreWriteTarget
    place?: ConveniencePlace
  } | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const sheetTrigger = useRef<HTMLElement | null>(null)
  const isMobile = useSyncExternalStore(subscribeToMobileLayout, isMobileLayout)
  const [selection, setSelection] = useState<
    { kind: 'store'; id: string } | { kind: 'place'; id: string } | null
  >(null)
  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0
  }, [selection])
  const entries = mergeMapEntries(
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
  const stores = entries.flatMap((entry) => (entry.store ? [entry.store] : []))
  const selectedEntry =
    selection?.kind === 'place'
      ? (entries.find((entry) => entry.place?.id === selection.id) ?? null)
      : null
  const selectedStore =
    selection?.kind === 'store'
      ? (stores.find((store) => store.id === selection.id) ?? null)
      : (selectedEntry?.store ?? null)
  if (isMobile && selection && !selectedEntry && !selectedStore) {
    setSelection(null)
  }
  const clearSelection = () => setSelection(null)
  const selectPlace = (id: string) => setSelection({ kind: 'place', id })
  const selectStore = (id: string) => setSelection({ kind: 'store', id })
  const search = places.search
  const cancel = places.cancel
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
  const searchArea = useCallback(
    (target: SearchArea, source: 'initial' | 'location' | 'map') => {
      searchSuspended.current = false
      searchEpoch.current += 1
      setSearchTarget(target)
      setSuspended(false)
      setZoomPaused(false)
      setArea(source)
      if (isViewport(target)) void search(target, placesConfig)
      else {
        setSelection(null)
        void search(target)
      }
    },
    [
      search,
      placesConfig,
      setSearchTarget,
      setSuspended,
      setZoomPaused,
      setArea,
      setSelection,
    ],
  )
  const located = useCallback(
    (point: MapPoint) =>
      placesConfig.autoSearch
        ? setArea('location')
        : searchArea(point, 'location'),
    [searchArea, placesConfig.autoSearch, setArea],
  )
  const fallback = useCallback(
    () =>
      placesConfig.autoSearch
        ? setArea('initial')
        : searchArea(INITIAL_CENTER, 'initial'),
    [searchArea, placesConfig.autoSearch, setArea],
  )
  const searchMap = (point: MapPoint) => searchArea(point, 'map')
  const searchViewport = useCallback(
    (viewport: MapViewport) => searchArea(viewport, 'map'),
    [searchArea],
  )
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

  function createStore(place: ConveniencePlace) {
    if (admin.status !== 'admin') return
    try {
      setEditor({
        target: {
          id: allocateStoreId(),
          googlePlaceId: place.id,
        },
        place,
      })
    } catch {
      setSaveNotice(
        usesFirebaseEmulators
          ? '登録の準備ができませんでした。Emulatorの接続を確認してください。'
          : '登録の準備ができませんでした。通信状態を確認してください。',
      )
    }
  }
  async function saved(id: string) {
    const { result, linked } = await refreshRegistration()
    setEditor(null)
    if (result.isError || linked?.isError) {
      setSelection(null)
      setSaveNotice(
        '保存しました。一覧の再取得に失敗したため、更新ボタンで確認してください。',
      )
    } else if (
      result.data?.stores.some((store) => store.id === id) ||
      Object.values(linked?.data ?? {}).some((store) => store?.id === id)
    ) {
      setSelection({ kind: 'store', id })
      setSaveNotice('店舗情報を保存しました。')
    } else {
      setSelection(null)
      setSaveNotice(
        '保存しました。検索範囲・取得上限により一覧には表示されていません。',
      )
    }
  }

  const onEdit =
    admin.status === 'admin' && selectedStore
      ? () =>
          setEditor({
            target: {
              id: selectedStore.id,
              googlePlaceId: selectedStore.googlePlaceId,
              original: selectedStore,
            },
          })
      : undefined
  const pointContent =
    selectedEntry?.place && !selectedEntry.store ? (
      <PlaceDetails
        key={selectedEntry.key}
        entry={selectedEntry}
        canManage={admin.status === 'admin'}
        onRegister={() => createStore(selectedEntry.place!)}
      />
    ) : null
  const feedbackProps = {
    query: storesQuery,
    entries,
    placesStatus: places.status,
    searchPaused: zoomPaused,
    searchSuspended: suspended,
    viewportSearch: placesConfig.autoSearch,
    placesLimited: placesConfig.autoSearch && places.limited,
    placesPartialError: placesConfig.autoSearch && places.partialError,
    registrationError: links.isError,
    onRetryPlaces: () => {
      if (suspended) return
      if (isViewport(searchTarget)) void search(searchTarget, placesConfig)
      else void search(searchTarget)
    },
  }
  const notices = (
    <>
      {firebaseConnection.error && (
        <Alert className="mb-4" variant="destructive">
          <AlertDescription>{firebaseConnection.error}</AlertDescription>
        </Alert>
      )}
      {saveNotice && (
        <p role="status" className="mb-4 text-sm leading-6 text-primary">
          {saveNotice}
        </p>
      )}
    </>
  )

  return (
    <div className="flex h-svh min-h-[480px] flex-col bg-background text-foreground">
      <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-background px-4 py-1.5 sm:min-h-16 sm:px-7 sm:py-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MapPin className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight sm:text-base">
              コンビニトイレマップ
            </h1>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {admin.status === 'admin' && (
            <>
              <span className="hidden text-xs text-primary sm:inline">
                管理者
              </span>
              <Button
                variant="outline"
                disabled={admin.busy}
                onClick={() => void admin.logout()}
              >
                ログアウト
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {!isMobile && (
          <aside
            aria-label="店舗と選択した場所の情報"
            className="hidden min-h-0 w-96 shrink-0 border-r bg-background lg:block"
          >
            <ScrollArea viewportRef={panelRef} className="h-full">
              <div className="p-7">
                {notices}
                <StorePanel
                  {...feedbackProps}
                  areaLabel={
                    placesConfig.autoSearch
                      ? '地図の表示範囲・中心から近い順'
                      : area === 'location'
                        ? '現在地から半径3km・近い順'
                        : area === 'map'
                          ? '検索した地点から半径3km・近い順'
                          : '東京駅から半径3km・近い順'
                  }
                  onSelectPlace={selectPlace}
                  onRefresh={() => void refreshRegistration()}
                  registrationFetching={links.isFetching}
                  selectedStore={selectedStore}
                  onSelectStore={selectStore}
                  onBack={clearSelection}
                  onEdit={onEdit}
                  pointContent={pointContent}
                />
              </div>
            </ScrollArea>
          </aside>
        )}

        <section
          aria-label="地図"
          className="relative isolate min-h-[240px] flex-1 overflow-hidden bg-muted"
        >
          {config.apiKey ? (
            <APIProvider
              apiKey={config.apiKey}
              libraries={libraries}
              language="ja"
              region="JP"
              version="quarterly"
              onError={() => {
                // エラー本文やリクエストURLにキーが含まれる可能性があるため出力しない。
              }}
            >
              <MapCanvas
                onLocated={located}
                onLocationFallback={fallback}
                onSearchArea={searchMap}
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
                adminLogin={
                  config.adminLoginArea && admin.status !== 'admin'
                    ? {
                        ...config.adminLoginArea,
                        open: () => void navigate({ to: '/admin-login' }),
                      }
                    : undefined
                }
              />
            </APIProvider>
          ) : (
            <MapNotice
              title="地図の設定が必要です"
              description=".envにVITE_GOOGLE_MAPS_API_KEYを設定し、開発サーバーを再起動してください。"
            />
          )}
          {isMobile && (
            <div
              className={`absolute right-32 left-3 z-10 grid max-h-[20svh] max-w-xs gap-2 overflow-y-auto overscroll-contain rounded-lg border bg-background/95 p-2 shadow-sm empty:hidden [&>*]:m-0 [&>p]:py-0 ${placesConfig.autoSearch ? 'top-4' : 'top-32'}`}
            >
              {notices}
              <StorePanelFeedback {...feedbackProps} />
              {(storesQuery.isError || links.isError) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    !storesQuery.enabled ||
                    storesQuery.isFetching ||
                    links.isFetching ||
                    suspended
                  }
                  onClick={() => void refreshRegistration()}
                >
                  店舗情報を更新
                </Button>
              )}
            </div>
          )}
        </section>
      </main>
      {isMobile && (
        <Sheet
          modal={false}
          open={Boolean(selectedStore || pointContent)}
          onOpenChange={(open) => {
            if (!open) clearSelection()
          }}
        >
          <SheetContent
            className="max-h-[42dvh] pb-[env(safe-area-inset-bottom)]"
            aria-describedby={undefined}
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={() => {
              const active = document.activeElement
              sheetTrigger.current =
                active instanceof HTMLElement ? active : null
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
            <SheetTitle className="shrink-0 border-b px-5 py-4 pr-14 text-sm font-semibold">
              トイレ情報
            </SheetTitle>
            <div
              key={selection && `${selection.kind}:${selection.id}`}
              className="min-h-0 overflow-y-auto overscroll-contain p-5"
            >
              {pointContent ??
                (selectedStore && (
                  <SelectedStoreDetails store={selectedStore} onEdit={onEdit} />
                ))}
            </div>
          </SheetContent>
        </Sheet>
      )}
      {editor && (
        <StoreEditor
          target={editor.target}
          place={editor.place}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
    </div>
  )
}

function MapCanvas({
  onLocated,
  onLocationFallback,
  onSearchArea,
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
  adminLogin,
}: {
  onLocated: (point: MapPoint) => void
  onLocationFallback: () => void
  onSearchArea: (point: MapPoint) => void
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
  const [locationError, setLocationError] = useState<string | null>(null)
  const mounted = useRef(false)
  const initialLocationRequested = useRef(false)

  const authFailure = status === APILoadingStatus.AUTH_FAILURE
  const failed = authFailure || status === APILoadingStatus.FAILED
  const ready = status === APILoadingStatus.LOADED && tilesReady && !failed
  const focusId = selectedStore?.id ?? selectedPlace?.key
  const focusLat = selectedStore?.location.lat ?? selectedPlace?.location.lat
  const focusLng = selectedStore?.location.lng ?? selectedPlace?.location.lng
  const initialSearchDone = useRef(false)
  const locatingRef = useRef(false)
  const [mapCenter, setMapCenter] = useState(INITIAL_CENTER)
  const searchGuard = useRef(false)
  const adminLoginClickAt = useRef<number | null>(null)
  const adminLoginOpening = useRef(false)

  function handleAdminLoginClick(event: MapMouseEvent, doubleClick = false) {
    const previousClick = adminLoginClickAt.current
    adminLoginClickAt.current = null
    const point = event.detail.latLng
    if (
      !adminLogin ||
      adminLoginOpening.current ||
      !point ||
      pointDistance(adminLogin.center, point) > adminLogin.radiusMeters
    )
      return

    const now = performance.now()
    if (
      doubleClick ||
      (previousClick !== null &&
        now - previousClick <= adminLoginClickIntervalMs)
    ) {
      adminLoginOpening.current = true
      event.stop()
      adminLogin.open()
    } else {
      adminLoginClickAt.current = now
    }
  }

  const viewportSearch = useViewportSearch({
    map,
    enabled: placesConfig.autoSearch,
    ready: ready && locationResolved && !locating,
    minZoom: placesConfig.minZoom,
    onSearch: onViewportSearch,
    onSuspend: onSuspendSearch,
  })
  const suppressPan = viewportSearch.suppressPan
  const fallbackIfNeeded = useCallback(() => {
    if (!initialSearchDone.current) {
      initialSearchDone.current = true
      setLocationResolved(true)
      onLocationFallback()
    }
  }, [onLocationFallback])

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
    }
  }, [])

  useEffect(() => {
    if (ready || failed) return
    const timer = window.setTimeout(() => setSlowLoading(true), 20_000)
    return () => window.clearTimeout(timer)
  }, [ready, failed])

  const locate = useCallback(() => {
    if (!map || !ready || locatingRef.current) return
    setLocationError(null)
    if (!navigator.geolocation) {
      setLocationError(
        'このブラウザでは現在地を取得できません。地図を移動して「この周辺を検索」を押してください。',
      )
      fallbackIfNeeded()
      return
    }
    locatingRef.current = true
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!mounted.current) return
        const point = { lat: coords.latitude, lng: coords.longitude }
        setLocation(point)
        initialSearchDone.current = true
        setLocationResolved(true)
        onLocated(point)
        locatingRef.current = false
        setLocating(false)
        currentMap.current?.panTo(point)
        currentMap.current?.setZoom(
          Math.max(currentMap.current.getZoom() ?? 15, 15),
        )
      },
      (error) => {
        if (!mounted.current) return
        locatingRef.current = false
        setLocating(false)
        setLocationError(locationErrorMessage(error.code))
        fallbackIfNeeded()
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [map, ready, onLocated, fallbackIfNeeded])

  useEffect(() => {
    if (!map || !ready || initialLocationRequested.current) return
    initialLocationRequested.current = true
    locate()
  }, [map, ready, locate])

  if (failed) {
    return (
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
        onClick={adminLogin ? handleAdminLoginClick : undefined}
        // click の発火順に関わらず、dblclick 自体も判定する。
        onDblclick={
          adminLogin ? (event) => handleAdminLoginClick(event, true) : undefined
        }
        onDragstart={() => {
          adminLoginClickAt.current = null
          viewportSearch.onDragStart()
        }}
        reuseMaps
        clickableIcons={false}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={false}
        onTilesLoaded={({ map }) => {
          renderedMaps.add(map)
          setTilesReady(true)
        }}
        onIdle={() => {
          const center = map?.getCenter()
          if (center) setMapCenter(center.toJSON())
          viewportSearch.onIdle()
        }}
        aria-label="周辺の地図"
        style={{ width: '100%', height: '100%' }}
      >
        <StoreMarkers
          stores={stores}
          selectedId={selectedStore?.id ?? null}
          onSelect={onStoreSelect}
        />
        <PlaceMarkers
          entries={entries}
          selectedId={selectedPlace?.place?.id ?? null}
          onSelect={onPlaceSelect}
        />
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

      {!placesConfig.autoSearch && (
        <Button
          variant="outline"
          className="absolute top-4 left-1/2 h-11 -translate-x-1/2 rounded-xl bg-background shadow-sm sm:top-5"
          disabled={!ready || locating || searching}
          onClick={() => {
            if (searchGuard.current) return
            searchGuard.current = true
            onSearchArea(map?.getCenter()?.toJSON() ?? mapCenter)
            queueMicrotask(() => {
              searchGuard.current = false
            })
          }}
        >
          {searching ? 'コンビニを検索中' : 'この周辺を検索'}
        </Button>
      )}
      <div
        className={`absolute right-4 sm:top-5 sm:right-5 ${placesConfig.autoSearch ? 'top-4' : 'top-18'}`}
      >
        <Button
          variant="outline"
          size="lg"
          className="h-11 gap-2 rounded-xl bg-background px-4 shadow-sm hover:bg-muted"
          onClick={locate}
          disabled={!ready || locating}
          aria-label="現在地に移動"
          aria-busy={locating}
        >
          {locating ? (
            <Spinner
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <LocateFixed aria-hidden="true" />
          )}
          {locating ? '現在地を取得中' : '現在地'}
        </Button>
      </div>
      {locationError && (
        <Alert className="map-panel-enter absolute right-4 bottom-24 left-4 w-auto max-w-md p-4 shadow-sm sm:bottom-20">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{locationError}</AlertDescription>
          <AlertAction>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-1 -mr-1 shrink-0"
              aria-label="位置情報の案内を閉じる"
              onClick={() => setLocationError(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </AlertAction>
        </Alert>
      )}
    </>
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
