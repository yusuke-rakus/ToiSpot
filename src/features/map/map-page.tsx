import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  type MapCameraProps,
} from '@vis.gl/react-google-maps'
import { CircleAlert, LocateFixed, MapPin, RotateCcw, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { ScrollArea } from '@/components/ui/scroll-area'
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
import { useStores } from '@/features/stores/use-stores'
import { StorePanel } from '@/features/stores/store-panel'
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
  INITIAL_CENTER,
  INITIAL_ZOOM,
  locationErrorMessage,
  type MapConfig,
  type MapPoint,
} from './map-config'

import { useNearbyPlaces, type ConveniencePlace } from '../places/nearby-places'
import { usePlaceLinks } from '../places/place-links'
import { mergeMapEntries, type MapEntry } from '../places/map-entries'
import { PlaceDetails } from '../places/place-details'
import { PlaceMarkers } from '../places/place-markers'

const configFromEnv = getMapConfig(import.meta.env)
const libraries = ['marker']

export function MapPage({ config = configFromEnv }: { config?: MapConfig }) {
  const [searchCenter, setSearchCenter] = useState(INITIAL_CENTER)
  const [area, setArea] = useState<'initial' | 'location' | 'map'>('initial')
  const places = useNearbyPlaces()
  const links = usePlaceLinks(places.places, places.requestId)
  const storesQuery = useStores(searchCenter)
  const admin = useAdmin()
  const [editor, setEditor] = useState<{
    target: StoreWriteTarget
    place?: ConveniencePlace
  } | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
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
  const selectPlace = (id: string) => setSelection({ kind: 'place', id })
  const selectStore = (id: string) => setSelection({ kind: 'store', id })
  const search = places.search
  const searchArea = useCallback(
    (point: MapPoint, source: 'initial' | 'location' | 'map') => {
      setSearchCenter(point)
      setArea(source)
      setSelection(null)
      void search(point)
    },
    [search],
  )
  const located = useCallback(
    (point: MapPoint) => searchArea(point, 'location'),
    [searchArea],
  )
  const fallback = useCallback(
    () => searchArea(INITIAL_CENTER, 'initial'),
    [searchArea],
  )
  const searchMap = (point: MapPoint) => searchArea(point, 'map')
  async function refreshRegistration() {
    const result = await storesQuery.refetch()
    const linked =
      places.places.length > 0 && links.enabled ? await links.refetch() : null
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
        '登録の準備ができませんでした。Emulatorの接続を確認してください。',
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

  return (
    <div className="flex h-svh min-h-[480px] flex-col bg-background text-foreground">
      <header className="z-10 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b bg-background px-4 py-2 sm:px-7">
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
        <aside
          aria-label="店舗と選択した場所の情報"
          className="order-2 max-h-[42svh] min-h-0 shrink-0 border-t bg-background lg:order-1 lg:max-h-none lg:w-96 lg:border-t-0 lg:border-r"
        >
          <ScrollArea
            viewportRef={panelRef}
            className="h-full max-lg:[&_[data-slot=scroll-area-viewport]]:max-h-[42svh]"
          >
            <div className="p-5 sm:p-7">
              {saveNotice && (
                <p
                  role="status"
                  className="mb-4 text-sm leading-6 text-primary"
                >
                  {saveNotice}
                </p>
              )}
              <StorePanel
                areaLabel={
                  area === 'location'
                    ? '現在地から半径3km・近い順'
                    : area === 'map'
                      ? '検索した地点から半径3km・近い順'
                      : '東京駅から半径3km・近い順'
                }
                query={storesQuery}
                entries={entries}
                placesStatus={places.status}
                onSelectPlace={selectPlace}
                onRefresh={() => void refreshRegistration()}
                registrationFetching={links.isFetching}
                registrationError={links.isError}
                onRetryPlaces={() => void search(searchCenter)}
                selectedStore={selectedStore}
                onSelectStore={selectStore}
                onBack={() => setSelection(null)}
                onEdit={
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
                }
                pointContent={
                  selectedEntry && !selectedEntry.store ? (
                    <PlaceDetails
                      key={selectedEntry.key}
                      entry={selectedEntry}
                      canManage={admin.status === 'admin'}
                      onRegister={() => createStore(selectedEntry.place!)}
                    />
                  ) : null
                }
              />
            </div>
          </ScrollArea>
        </aside>

        <section
          aria-label="地図"
          className="relative order-1 min-h-[240px] flex-1 overflow-hidden bg-muted lg:order-2"
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
                searching={places.status === 'loading'}
                entries={entries}
                selectedPlace={selectedEntry}
                onPlaceSelect={selectPlace}
                mapId={config.mapId}
                stores={stores}
                selectedStore={selectedStore}
                onStoreSelect={selectStore}
              />
            </APIProvider>
          ) : (
            <MapNotice
              title="地図の設定が必要です"
              description=".envにVITE_GOOGLE_MAPS_API_KEYを設定し、開発サーバーを再起動してください。"
            />
          )}
        </section>
      </main>
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
  searching,
  entries,
  selectedPlace,
  onPlaceSelect,
  mapId,
  stores,
  selectedStore,
  onStoreSelect,
}: {
  onLocated: (point: MapPoint) => void
  onLocationFallback: () => void
  onSearchArea: (point: MapPoint) => void
  searching: boolean
  entries: MapEntry[]
  selectedPlace: MapEntry | null
  onPlaceSelect: (id: string) => void
  mapId: string
  stores: Store[]
  selectedStore: Store | null
  onStoreSelect: (id: string) => void
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
  const [slowLoading, setSlowLoading] = useState(false)
  const [locating, setLocating] = useState(false)
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

  const fallbackIfNeeded = useCallback(() => {
    if (!initialSearchDone.current) {
      initialSearchDone.current = true
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
    map.panTo({ lat: focusLat, lng: focusLng })
    map.setZoom(Math.max(map.getZoom() ?? INITIAL_ZOOM, INITIAL_ZOOM))
  }, [map, focusId, focusLat, focusLng])

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
        onCameraChanged={({ detail: { center, zoom, heading, tilt } }) =>
          setCamera({ center, zoom, heading, tilt })
        }
        reuseMaps
        clickableIcons={false}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl
        onTilesLoaded={() => setTilesReady(true)}
        onIdle={() => {
          const center = map?.getCenter()
          if (center) setMapCenter(center.toJSON())
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

      <div className="absolute top-4 right-4 flex flex-col items-end gap-2 sm:top-5 sm:right-5">
        <Button
          variant="outline"
          className="h-11 rounded-xl bg-background shadow-sm"
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
      <div
        aria-label="ピンの凡例"
        className="absolute bottom-7 left-3 flex max-w-[calc(100%-4rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg border bg-background/95 px-3 py-2 text-[11px] shadow-sm"
      >
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-slate-900" />
          登録済み
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#9ca3af]" />
          データなし
        </span>
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
