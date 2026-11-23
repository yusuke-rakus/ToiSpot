import { StrictMode, type ReactNode } from 'react'
import {
  act,
  fireEvent,
  render as renderUI,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MapPage } from './map-page'
import {
  INITIAL_CENTER,
  DEFAULT_PLACES_CONFIG,
  getMapConfig,
  type MapPoint,
} from './map-config'
import { createTestStores } from '../../../tests/fixtures/stores'
import { chooseSelectOption } from '../../../tests/select'
import type { StoreListResult } from '../stores/store-schema'
import type { ConveniencePlace } from '../places/nearby-places'
import type { PlaceLinks } from '../places/place-links'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, THEME_STORAGE_KEY } from '@/components/theme-provider'
import { Timestamp } from 'firebase/firestore'

function render(ui: ReactNode) {
  return renderUI(ui, { wrapper: ThemeProvider })
}

const admin = vi.hoisted(() => ({
  status: 'signedOut',
  enabled: false,
  busy: false,
  message: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshAccess: vi.fn(),
}))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('../store-requests/use-store-requests', () => ({
  storeRequestKeys: { all: ['storeRequests'] },
  usePendingStoreRequestCount: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    isError: false,
  }),
}))
const requests = vi.hoisted(() => ({
  allocate: vi.fn(() => 'request-fixed'),
  readStore: vi.fn(),
  submit: vi.fn(),
}))
vi.mock('../store-requests/store-request-repository', () => ({
  allocateStoreRequestId: () => requests.allocate(),
  readStoreForRequest: (...args: unknown[]) => requests.readStore(...args),
  submitStoreRequest: (...args: unknown[]) => requests.submit(...args),
}))
const writer = vi.hoisted(() => ({
  allocate: vi.fn(() => 'new-fixed'),
  save: vi.fn(),
}))
vi.mock('../auth/admin-provider', () => ({ useAdmin: () => admin }))
vi.mock('../stores/store-writer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stores/store-writer')>()),
  allocateStoreId: () => writer.allocate(),
  saveConfiguredStore: (...args: unknown[]) => writer.save(...args),
}))

const storeQuery = vi.hoisted(() => ({
  data: { stores: [], invalidCount: 0, truncated: false } as
    StoreListResult | undefined,
  enabled: true,
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}))
const useStoresMock = vi.fn<(...args: unknown[]) => typeof storeQuery>(
  () => storeQuery,
)
vi.mock('../stores/use-stores', () => ({
  useStores: (...args: unknown[]) => useStoresMock(...args),
}))

const placesQuery = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'loading' | 'success' | 'error',
  places: [] as ConveniencePlace[],
  limited: false,
  search: vi.fn(),
  cancel: vi.fn(),
}))
const linksQuery = vi.hoisted(() => ({
  data: {} as PlaceLinks | undefined,
  enabled: true,
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: vi.fn(),
}))
vi.mock('../places/nearby-places', () => ({
  useNearbyPlaces: () => placesQuery,
}))
vi.mock('../places/place-links', () => ({ usePlaceLinks: () => linksQuery }))

const maps = vi.hoisted(() => ({
  status: 'LOADED',
  panTo: vi.fn(),
  setZoom: vi.fn(),
  getZoom: vi.fn(() => 14),
  getCenter: vi.fn(() => ({ toJSON: () => ({ lat: 35.7, lng: 139.8 }) })),
  getBounds: vi.fn(() => ({
    toJSON: () => ({ north: 35.72, south: 35.68, east: 139.82, west: 139.78 }),
  })),
}))
const mapInstance = vi.hoisted(() => ({ current: maps }))
const startMaps = vi.hoisted(() => vi.fn())

// 通信・課金を発生させず、SDKとの境界と利用者の操作を検証する。
vi.mock('@vis.gl/react-google-maps', () => ({
  APILoadingStatus: {
    NOT_LOADED: 'NOT_LOADED',
    LOADING: 'LOADING',
    LOADED: 'LOADED',
    FAILED: 'FAILED',
    AUTH_FAILURE: 'AUTH_FAILURE',
  },
  APIProvider: ({
    apiKey,
    children,
  }: {
    apiKey: string
    children: ReactNode
  }) => {
    startMaps(apiKey)
    return children
  },
  useApiLoadingStatus: () => maps.status,
  useMap: () => mapInstance.current,
  Map: ({
    children,
    onClick,
    onDblclick,
    onTilesLoaded,
    onIdle,
    center,
    zoom,
    heading,
    tilt,
    onCameraChanged,
    onDragstart,
  }: {
    children: ReactNode
    onClick?: (event: unknown) => void
    onDblclick?: (event: unknown) => void
    onTilesLoaded: (event: { map: typeof maps }) => void
    onIdle: () => void
    center: { lat: number; lng: number }
    zoom: number
    heading: number
    tilt: number
    onDragstart: () => void
    onCameraChanged: (event: {
      detail: {
        center: { lat: number; lng: number }
        zoom: number
        heading: number
        tilt: number
        bounds: { north: number; south: number; east: number; west: number }
      }
    }) => void
  }) => (
    <div
      data-testid="map"
      data-camera={JSON.stringify({ center, zoom, heading, tilt })}
    >
      <button
        onClick={() =>
          onCameraChanged({
            detail: {
              center: { lat: 35.8, lng: 139.9 },
              zoom: 17.5,
              heading: 20,
              tilt: 30,
              bounds: maps.getBounds().toJSON(),
            },
          })
        }
      >
        地図カメラを移動
      </button>
      <button onClick={() => onTilesLoaded({ map: mapInstance.current })}>
        地図の描画を完了
      </button>
      <button onClick={onIdle}>地図を移動</button>
      <button onClick={onDragstart}>地図のドラッグを開始</button>
      {[12, 13].map((level) => (
        <button
          key={level}
          onClick={() => {
            maps.getZoom.mockReturnValue(level)
            onCameraChanged({
              detail: {
                center: maps.getCenter().toJSON(),
                zoom: level,
                heading: 0,
                tilt: 0,
                bounds: maps.getBounds().toJSON(),
              },
            })
            onIdle()
          }}
        >
          ズーム{level}
        </button>
      ))}
      <button
        onClick={() => onClick?.(mapClickEvent({ lat: 35.68, lng: 139.76 }))}
      >
        地図上の地点を選択
      </button>
      {[
        { name: '中心地点', latLng: { lat: 35, lng: 139 } },
        { name: '半径内の地点', latLng: { lat: 35.0008, lng: 139 } },
        { name: '半径外の地点', latLng: { lat: 35.001, lng: 139 } },
      ].map(({ name, latLng }) => (
        <button
          key={name}
          onClick={() => onClick?.(mapClickEvent(latLng))}
          onDoubleClick={() => onDblclick?.(mapClickEvent(latLng))}
        >
          {name}を選択
        </button>
      ))}
      {children}
    </div>
  ),
  AdvancedMarker: ({
    children,
    title,
    onClick,
  }: {
    children: ReactNode
    title: string
    onClick?: () => void
  }) =>
    onClick ? (
      <button aria-label={title} onClick={onClick}>
        {children}
      </button>
    ) : (
      <div aria-label={title}>{children}</div>
    ),
}))

const config = { apiKey: 'test-key-not-a-real-key', mapId: 'DEMO_MAP_ID' }

function selectedDirectionsPlaceId() {
  const link = screen.getByRole<HTMLAnchorElement>('link', {
    name: 'Google マップで経路を見る',
  })
  return new URL(link.href).searchParams.get('destination_place_id')
}

function mapClickEvent(latLng: MapPoint) {
  return {
    detail: { latLng },
    stop: vi.fn(),
  }
}

function setMapViewport(center: MapPoint, zoom = 15) {
  maps.getCenter.mockReturnValue({ toJSON: () => center })
  maps.getBounds.mockReturnValue({
    toJSON: () => ({
      north: center.lat + 0.01,
      south: center.lat - 0.01,
      east: center.lng + 0.01,
      west: center.lng - 0.01,
    }),
  })
  maps.getZoom.mockReturnValue(zoom)
}

function finishMapMove(center: MapPoint) {
  setMapViewport(center)
  fireEvent.click(screen.getByRole('button', { name: '地図を移動' }))
  act(() => vi.advanceTimersByTime(300))
}

beforeEach(() => {
  vi.clearAllMocks()
  mapInstance.current = { ...maps }
  maps.getZoom.mockReset().mockReturnValue(14)
  maps.getCenter
    .mockReset()
    .mockReturnValue({ toJSON: () => ({ lat: 35.7, lng: 139.8 }) })
  maps.getBounds.mockReset().mockReturnValue({
    toJSON: () => ({
      north: 35.72,
      south: 35.68,
      east: 139.82,
      west: 139.78,
    }),
  })
  localStorage.clear()
  writer.save.mockReset().mockResolvedValue('new-fixed')
  requests.readStore.mockReset()
  requests.submit.mockReset().mockResolvedValue('request-fixed')
  storeQuery.refetch.mockImplementation(async () => ({
    data: storeQuery.data,
    isError: false,
  }))
  Object.assign(placesQuery, { status: 'idle', places: [], limited: false })
  Object.assign(linksQuery, {
    data: {},
    enabled: true,
    isPending: false,
    isFetching: false,
    isError: false,
  })
  linksQuery.refetch.mockResolvedValue({ data: {}, isError: false })
  maps.status = 'LOADED'
  admin.status = 'signedOut'
  admin.enabled = false
  Object.assign(storeQuery, {
    data: { stores: [], invalidCount: 0, truncated: false },
    enabled: true,
    isPending: false,
    isFetching: false,
    isError: false,
  })
})

describe('管理者操作と地図画面の連携', () => {
  const samples = createTestStores('2026-11-03T00:00:00.000Z').map(
    ({ id, data }) => ({ ...data, id }),
  )
  beforeEach(() => {
    admin.status = 'admin'
    admin.enabled = true
    storeQuery.data = { stores: samples, invalidCount: 0, truncated: false }
    storeQuery.refetch.mockImplementation(async () => ({
      data: storeQuery.data,
      isError: false,
    }))
  })
  function renderAdmin() {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MapPage config={config} />
      </QueryClientProvider>,
    )
    return userEvent.setup()
  }
  const place: ConveniencePlace = {
    id: 'ChIJ_new',
    name: 'セブン-イレブン 新規テスト店舗',
    address: 'テスト住所',
    location: { lat: 35.68, lng: 139.76 },
    attributions: [],
  }
  async function openRegistration() {
    placesQuery.status = 'success'
    placesQuery.places = [place]
    linksQuery.data = { [place.id]: null }
    const user = renderAdmin()
    await user.click(
      screen.getByRole('button', { name: `${place.name}・データなし` }),
    )
    await user.click(screen.getByRole('button', { name: 'トイレ情報を登録' }))
    return user
  }
  it('Placesの店舗から登録し、再取得した店舗を詳細と編集に使う', async () => {
    writer.save.mockImplementation(async (target, input) => {
      storeQuery.data = {
        stores: [
          ...samples,
          {
            ...samples[0],
            ...input,
            id: target.id,
            googlePlaceId: target.googlePlaceId,
          },
        ],
        invalidCount: 0,
        truncated: false,
      }
      return target.id
    })
    const user = await openRegistration()
    await chooseSelectOption(user, '貸出状況', '利用可')
    await user.click(screen.getByRole('button', { name: '保存する' }))
    expect(
      await screen.findByRole('article', { name: '店舗の詳細' }),
    ).toHaveTextContent(place.name)
    expect(writer.save).toHaveBeenCalledWith(
      { id: 'new-fixed', googlePlaceId: place.id },
      expect.objectContaining({
        name: place.name,
        address: place.address,
        location: place.location,
      }),
    )
    expect(storeQuery.refetch).toHaveBeenCalledOnce()
    expect(maps.panTo).toHaveBeenLastCalledWith(place.location)
    expect(selectedDirectionsPlaceId()).toBe(place.id)
    await user.click(screen.getByRole('button', { name: '店舗を編集' }))
    expect(screen.getByLabelText('店名')).toHaveValue(place.name)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('地図からの管理者ログイン', () => {
  const configWithAdminLogin = getMapConfig({
    VITE_GOOGLE_MAPS_API_KEY: config.apiKey,
    VITE_ADMIN_LOGIN_LAT: '35',
    VITE_ADMIN_LOGIN_LNG: '139',
    VITE_ADMIN_LOGIN_RADIUS_METERS: '100',
  })

  it('設定した半径内の地点だけダブルクリックでログイン画面を開く', () => {
    render(<MapPage config={configWithAdminLogin} />)
    fireEvent.doubleClick(
      screen.getByRole('button', { name: '半径外の地点を選択' }),
    )
    expect(navigate).not.toHaveBeenCalled()
    fireEvent.doubleClick(
      screen.getByRole('button', { name: '半径内の地点を選択' }),
    )
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/admin-login' })
  })

  it('環境変数が未設定なら地図のダブルクリックで遷移しない', () => {
    render(<MapPage config={config} />)
    fireEvent.doubleClick(
      screen.getByRole('button', { name: '中心地点を選択' }),
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it.each([0, 1, 2])(
    'ダブルクリックの前に届くclickが%i回でも1回だけ遷移する',
    (clicks) => {
      render(<MapPage config={configWithAdminLogin} />)
      const center = screen.getByRole('button', {
        name: '中心地点を選択',
      })
      if (clicks >= 1) fireEvent.click(center)
      expect(navigate).not.toHaveBeenCalled()
      if (clicks === 2) fireEvent.click(center)
      fireEvent.doubleClick(center)
      expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/admin-login' })
    },
  )

  it('半径外のクリックや1秒を超えた間隔で回数をリセットする', () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    render(<MapPage config={configWithAdminLogin} />)
    const center = screen.getByRole('button', {
      name: '中心地点を選択',
    })
    fireEvent.click(center)
    fireEvent.click(screen.getByRole('button', { name: '半径外の地点を選択' }))
    fireEvent.click(center)
    vi.advanceTimersByTime(1001)
    fireEvent.click(center)
    expect(navigate).not.toHaveBeenCalled()
    fireEvent.click(center)
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/admin-login' })
  })

  it('管理者としてログイン済みなら地図に留まる', () => {
    admin.status = 'admin'
    render(<MapPage config={configWithAdminLogin} />)
    const center = screen.getByRole('button', {
      name: '中心地点を選択',
    })
    fireEvent.click(center)
    fireEvent.click(center)
    expect(navigate).not.toHaveBeenCalled()
  })

  describe('スマホの標準ズームとログイン入口', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: query === '(width < 64rem)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      )
    })

    it('ダブルタップでは遷移せず、3回目のタップでログインを開く', () => {
      render(<MapPage config={configWithAdminLogin} />)
      const center = screen.getByRole('button', { name: '中心地点を選択' })
      fireEvent.click(center)
      fireEvent.click(center)
      fireEvent.doubleClick(center)
      expect(navigate).not.toHaveBeenCalled()
      fireEvent.click(center)
      expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/admin-login' })
    })

    it('ドラッグを挟んだタップをログイン操作として数えない', () => {
      render(<MapPage config={configWithAdminLogin} />)
      const center = screen.getByRole('button', { name: '中心地点を選択' })
      fireEvent.click(center)
      fireEvent.click(center)
      fireEvent.click(
        screen.getByRole('button', { name: '地図のドラッグを開始' }),
      )
      fireEvent.click(center)
      fireEvent.click(center)
      expect(navigate).not.toHaveBeenCalled()
      fireEvent.click(center)
      expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/admin-login' })
    })

    it('半径外の操作と1秒を超えた間隔でタップ回数をリセットする', () => {
      vi.useFakeTimers({ toFake: ['performance'] })
      render(<MapPage config={configWithAdminLogin} />)
      const center = screen.getByRole('button', { name: '中心地点を選択' })
      fireEvent.click(center)
      fireEvent.click(center)
      fireEvent.click(
        screen.getByRole('button', { name: '半径外の地点を選択' }),
      )
      fireEvent.click(center)
      fireEvent.click(center)
      expect(navigate).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1001)
      fireEvent.click(center)
      fireEvent.click(center)
      expect(navigate).not.toHaveBeenCalled()
      fireEvent.click(center)
      expect(navigate).toHaveBeenCalledExactlyOnceWith({ to: '/admin-login' })
    })
  })

  it.each([true, false])(
    'ログイン後の現在地取得は再利用する地図の描画済み状態に従う（再利用: %s）',
    (reuseRenderedMap) => {
      const getCurrentPosition = vi.fn()
      vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
      const { unmount } = render(<MapPage config={configWithAdminLogin} />)
      fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
      expect(getCurrentPosition).toHaveBeenCalledOnce()
      fireEvent.doubleClick(
        screen.getByRole('button', { name: '中心地点を選択' }),
      )
      expect(navigate).toHaveBeenCalledWith({ to: '/admin-login' })
      unmount()

      if (!reuseRenderedMap) mapInstance.current = { ...maps }
      admin.status = 'admin'
      render(<MapPage config={configWithAdminLogin} />)
      expect(getCurrentPosition).toHaveBeenCalledTimes(reuseRenderedMap ? 2 : 1)
    },
  )
})

describe('地図の接続', () => {
  it('キー未設定ではMaps SDKを初期化しない', () => {
    render(<MapPage config={{ ...config, apiKey: '' }} />)
    expect(startMaps).not.toHaveBeenCalled()
  })

  it('Mapsのキーを正規化し、Map IDが空なら開発用IDを使う', () => {
    expect(
      getMapConfig({
        VITE_GOOGLE_MAPS_API_KEY: ' test-key ',
        VITE_GOOGLE_MAPS_MAP_ID: ' ',
      }),
    ).toMatchObject({ apiKey: 'test-key', mapId: 'DEMO_MAP_ID' })
  })

  it.each(['FAILED', 'AUTH_FAILURE'])(
    'SDKが%sの場合は現在地取得とPlaces検索を開始しない',
    (status) => {
      vi.useFakeTimers()
      maps.status = status
      const getCurrentPosition = vi.fn()
      vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
      render(<MapPage config={config} />)
      act(() => vi.advanceTimersByTime(300))
      expect(startMaps).toHaveBeenCalledWith(config.apiKey)
      expect(getCurrentPosition).not.toHaveBeenCalled()
      expect(placesQuery.search).not.toHaveBeenCalled()
    },
  )
})

it('自動モードで縮小すると詳細を残して全検索を停止し、進行中の更新からも追加照会しない', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', {})
  const place: ConveniencePlace = {
    id: 'ChIJ_paused',
    name: '停止中のコンビニ',
    address: '住所',
    location: INITIAL_CENTER,
    attributions: [],
  }
  placesQuery.status = 'error'
  storeQuery.isError = true
  placesQuery.places = [place]
  linksQuery.data = { [place.id]: null }
  const placesConfig = { ...DEFAULT_PLACES_CONFIG, autoSearch: true }
  render(<MapPage config={{ ...config, places: placesConfig }} />)
  fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
  act(() => vi.advanceTimersByTime(300))
  expect(placesQuery.search).toHaveBeenCalledOnce()
  fireEvent.click(
    screen.getByRole('button', { name: `${place.name}・データなし` }),
  )
  expect(selectedDirectionsPlaceId()).toBe(place.id)
  let finish!: (value: {
    data: StoreListResult | undefined
    isError: boolean
  }) => void
  storeQuery.refetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: '店舗情報を再取得' }))
  expect(storeQuery.refetch).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'ズーム12' }))
  act(() => vi.advanceTimersByTime(0))
  expect(selectedDirectionsPlaceId()).toBe(place.id)
  fireEvent.click(screen.getByRole('button', { name: 'コンビニ検索を再試行' }))
  fireEvent.click(screen.getByRole('button', { name: '店舗情報を再取得' }))
  expect(storeQuery.refetch).toHaveBeenCalledOnce()
  await act(async () => {
    finish({ data: storeQuery.data, isError: false })
    vi.advanceTimersByTime(1000)
  })
  expect(linksQuery.refetch).not.toHaveBeenCalled()
  expect(placesQuery.search).toHaveBeenCalledOnce()
  expect(useStoresMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ zoom: 14 }),
    true,
  )
  fireEvent.click(screen.getByRole('button', { name: 'ズーム13' }))
  act(() => vi.advanceTimersByTime(300))
  expect(placesQuery.search).toHaveBeenCalledTimes(2)
  expect(placesQuery.search).toHaveBeenLastCalledWith(
    expect.objectContaining({ zoom: 13 }),
    placesConfig,
  )
})

it('テーマでSDKの地図が交換されてもカメラ・選択を保ち、再移動・再検索しない', async () => {
  const store = {
    ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
    id: 'selected',
  }
  storeQuery.data = { stores: [store], invalidCount: 0, truncated: false }
  const getCurrentPosition = vi.fn((success: PositionCallback) =>
    success({
      coords: { latitude: 35.68, longitude: 139.76 },
    } as GeolocationPosition),
  )
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: { getCurrentPosition },
  })
  const user = userEvent.setup()
  render(<MapPage config={config} />)
  await user.click(screen.getByRole('button', { name: '地図の描画を完了' }))
  await user.click(
    screen.getByRole('button', { name: `${store.name}の詳細を見る` }),
  )
  await user.click(screen.getByRole('button', { name: '地図カメラを移動' }))
  const camera = screen.getByTestId('map').getAttribute('data-camera')
  expect(JSON.parse(camera!).zoom).toBe(17.5)
  const searchCount = placesQuery.search.mock.calls.length
  const nextMap = { ...maps, panTo: vi.fn(), setZoom: vi.fn() }
  mapInstance.current = nextMap
  await user.click(screen.getByRole('button', { name: /テーマを変更/ }))
  await user.click(screen.getByRole('menuitemradio', { name: 'ダーク' }))
  expect(screen.getByTestId('map')).toHaveAttribute('data-camera', camera)
  expect(selectedDirectionsPlaceId()).toBe(store.googlePlaceId)
  expect(nextMap.panTo).not.toHaveBeenCalled()
  expect(nextMap.setZoom).not.toHaveBeenCalled()
  expect(placesQuery.search).toHaveBeenCalledTimes(searchCount)
  expect(storeQuery.refetch).not.toHaveBeenCalled()
  expect(getCurrentPosition).toHaveBeenCalledTimes(1)
})

it('別タブのテーマ変更でも編集中の入力を保持する', async () => {
  admin.status = 'admin'
  const store = {
    ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
    id: 'editing',
  }
  storeQuery.data = { stores: [store], invalidCount: 0, truncated: false }
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MapPage config={config} />
    </QueryClientProvider>,
  )
  await user.click(
    screen.getByRole('button', { name: `${store.name}の詳細を見る` }),
  )
  await user.click(screen.getByRole('button', { name: '店舗を編集' }))
  await user.clear(screen.getByLabelText('店名'))
  await user.type(screen.getByLabelText('店名'), '編集中の店名')
  fireEvent(
    window,
    new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }),
  )
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() =>
    expect(writer.save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: store.id }),
      expect.objectContaining({ name: '編集中の店名' }),
    ),
  )
})

describe('Firestoreの店舗表示', () => {
  const stores = createTestStores('2026-11-03T00:00:00.000Z').map(
    ({ id, data }) => ({ ...data, id }),
  )
  beforeEach(() => {
    storeQuery.data = { stores, invalidCount: 0, truncated: false }
  })

  it('一覧とピンは同じ店舗を選択し、地図の余白で選択を解除する', async () => {
    const store = stores[1]
    const user = userEvent.setup()
    render(<MapPage config={config} />)
    await user.click(
      screen.getByRole('button', { name: `${store.name}の詳細を見る` }),
    )
    expect(selectedDirectionsPlaceId()).toBe(store.googlePlaceId)
    expect(maps.panTo).toHaveBeenLastCalledWith(store.location)

    await user.click(screen.getByRole('button', { name: '地図上の地点を選択' }))
    expect(
      screen.queryByRole('link', { name: 'Google マップで経路を見る' }),
    ).not.toBeInTheDocument()
    expect(maps.panTo).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole('button', { name: `${store.name}・利用可` }),
    )
    expect(selectedDirectionsPlaceId()).toBe(store.googlePlaceId)
    expect(placesQuery.search).not.toHaveBeenCalled()
  })
})

describe('現在地', () => {
  it('StrictModeでも取得中の要求を重複させず、画面を閉じた後の結果を無視する', () => {
    let complete: PositionCallback | undefined
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      complete = success
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    const { unmount } = render(
      <StrictMode>
        <MapPage config={config} />
      </StrictMode>,
    )
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    fireEvent.click(screen.getByRole('button', { name: '現在地に移動' }))
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    unmount()
    act(() =>
      complete!({
        coords: { latitude: 34.7, longitude: 135.5 },
      } as GeolocationPosition),
    )
    expect(maps.panTo).not.toHaveBeenCalled()
  })

  it('初回描画後に自動取得し、現在地の周辺データへ切り替える', () => {
    vi.useFakeTimers()
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 34.7, longitude: 135.5 },
      } as GeolocationPosition)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<MapPage config={config} />)
    fireEvent.click(screen.getByRole('button', { name: '現在地に移動' }))
    expect(getCurrentPosition).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(maps.panTo).toHaveBeenCalledWith({ lat: 34.7, lng: 135.5 })
    expect(maps.setZoom).toHaveBeenCalledWith(15)
    finishMapMove({ lat: 34.7, lng: 135.5 })
    expect(useStoresMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: { lat: 34.7, lng: 135.5 } }),
      false,
    )
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ center: { lat: 34.7, lng: 135.5 }, zoom: 15 }),
      DEFAULT_PLACES_CONFIG,
    )
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '現在地に移動' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it.each([
    { reason: '非対応', errorCode: null },
    { reason: '拒否', errorCode: 1 },
    { reason: 'タイムアウト', errorCode: 3 },
  ])('位置情報が$reasonでも東京駅周辺を検索する', ({ errorCode }) => {
    vi.useFakeTimers()
    setMapViewport(INITIAL_CENTER, 14)
    const getCurrentPosition = vi.fn((_success, error: PositionErrorCallback) =>
      error({ code: errorCode } as GeolocationPositionError),
    )
    vi.stubGlobal(
      'navigator',
      errorCode === null ? {} : { geolocation: { getCurrentPosition } },
    )
    render(<MapPage config={config} />)
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    act(() => vi.advanceTimersByTime(300))
    expect(maps.panTo).not.toHaveBeenCalled()
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ center: INITIAL_CENTER, zoom: 14 }),
      DEFAULT_PLACES_CONFIG,
    )
  })
})

describe('場所検索と絞り込みの地図連携', () => {
  const destination = { lat: 34.7025, lng: 135.4959 }
  function mockDestination() {
    const fetchFields = vi.fn().mockResolvedValue(undefined)
    const fetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
      suggestions: [
        {
          placePrediction: {
            placeId: 'osaka-station',
            mainText: { text: '大阪駅' },
            text: { text: '大阪駅 大阪市北区' },
            toPlace: () => ({
              location: { toJSON: () => destination },
              fetchFields,
            }),
          },
        },
      ],
    })
    vi.stubGlobal('google', {
      maps: {
        importLibrary: vi.fn().mockResolvedValue({
          AutocompleteSuggestion: { fetchAutocompleteSuggestions },
          AutocompleteSessionToken: class {},
        }),
      },
    })
    return { fetchFields, fetchAutocompleteSuggestions }
  }
  async function chooseOsaka() {
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '大阪' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: '大阪駅' }))
    })
  }

  it('目的地を一度検索し、遅い初回現在地より新しい目的地と明示的な現在地操作を優先する', async () => {
    vi.useFakeTimers()
    const completions: PositionCallback[] = []
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          completions.push(success),
      },
    })
    const { fetchFields } = mockDestination()
    render(<MapPage config={config} />)
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    expect(completions).toHaveLength(1)
    await chooseOsaka()
    expect(maps.panTo).toHaveBeenLastCalledWith(destination)
    expect(placesQuery.search).not.toHaveBeenCalled()
    finishMapMove(destination)
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ center: destination, zoom: 15 }),
      DEFAULT_PLACES_CONFIG,
    )
    expect(fetchFields).toHaveBeenCalledExactlyOnceWith({
      fields: ['location'],
    })
    fireEvent.click(screen.getByRole('button', { name: '現在地に移動' }))
    expect(completions).toHaveLength(2)
    act(() =>
      completions[1]({
        coords: { latitude: 35.1, longitude: 139.1 },
      } as GeolocationPosition),
    )
    act(() =>
      completions[0]({
        coords: { latitude: 35.9, longitude: 139.9 },
      } as GeolocationPosition),
    )
    expect(maps.panTo).toHaveBeenLastCalledWith({ lat: 35.1, lng: 139.1 })
    finishMapMove({ lat: 35.1, lng: 139.1 })
    expect(placesQuery.search).toHaveBeenCalledTimes(2)
    expect(placesQuery.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: { lat: 35.1, lng: 139.1 }, zoom: 15 }),
      DEFAULT_PLACES_CONFIG,
    )
  })

  it('自動モードは詳細移動の抑制を解除し、目的地の表示範囲を一度だけ検索する', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    mockDestination()
    const store = {
      ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
      id: 'selected-before-search',
    }
    storeQuery.data = { stores: [store], invalidCount: 0, truncated: false }
    const placesConfig = { ...DEFAULT_PLACES_CONFIG, autoSearch: true }
    render(<MapPage config={{ ...config, places: placesConfig }} />)
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    act(() => vi.advanceTimersByTime(300))
    expect(placesQuery.search).toHaveBeenCalledOnce()
    fireEvent.click(
      screen.getByRole('button', { name: `${store.name}・利用可` }),
    )
    await chooseOsaka()
    maps.getCenter.mockReturnValue({ toJSON: () => destination })
    maps.getBounds.mockReturnValue({
      toJSON: () => ({
        north: 34.72,
        south: 34.69,
        east: 135.51,
        west: 135.48,
      }),
    })
    maps.getZoom.mockReturnValue(15)
    fireEvent.click(screen.getByRole('button', { name: '地図を移動' }))
    act(() => vi.advanceTimersByTime(300))
    expect(placesQuery.search).toHaveBeenCalledTimes(2)
    expect(placesQuery.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: destination, zoom: 15 }),
      placesConfig,
    )
    act(() => vi.advanceTimersByTime(1000))
    expect(placesQuery.search).toHaveBeenCalledTimes(2)
  })

  it('同じ地点とズームの目的地を選んでも地図イベントなしで自動検索を完了する', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    mockDestination()
    setMapViewport(destination)
    const placesConfig = { ...DEFAULT_PLACES_CONFIG, autoSearch: true }
    render(<MapPage config={{ ...config, places: placesConfig }} />)
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    act(() => vi.advanceTimersByTime(300))
    expect(placesQuery.search).toHaveBeenCalledOnce()
    await chooseOsaka()
    // このSDKスタブのpanTo/setZoomはカメラ変更・idleイベントを発行しない。
    act(() => vi.advanceTimersByTime(300))
    expect(placesQuery.search).toHaveBeenCalledTimes(2)
    expect(placesQuery.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: destination, zoom: 15 }),
      placesConfig,
    )
    expect(useStoresMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: destination }),
      false,
    )
    act(() => vi.advanceTimersByTime(1000))
    expect(placesQuery.search).toHaveBeenCalledTimes(2)
  })

  it('現在地の再取得が失敗しても自動モードの同じ表示範囲を重複検索しない', () => {
    vi.useFakeTimers()
    const getCurrentPosition = vi.fn(
      (success: PositionCallback, error: PositionErrorCallback) => {
        void error
        success({
          coords: { latitude: 35.7, longitude: 139.8 },
        } as GeolocationPosition)
      },
    )
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(
      <MapPage
        config={{
          ...config,
          places: { ...DEFAULT_PLACES_CONFIG, autoSearch: true },
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    finishMapMove({ lat: 35.7, lng: 139.8 })
    expect(placesQuery.search).toHaveBeenCalledOnce()
    let fail!: PositionErrorCallback
    getCurrentPosition.mockImplementation((_success, error) => {
      fail = error
    })
    fireEvent.click(screen.getByRole('button', { name: '現在地に移動' }))
    act(() => fail({ code: 2 } as GeolocationPositionError))
    act(() => vi.advanceTimersByTime(1000))
    expect(placesQuery.search).toHaveBeenCalledOnce()
  })

  it('利用可のみへの変更で対象外の詳細を閉じ、ピンと一覧をそろえて追加取得しない', () => {
    const stores = createTestStores('2026-11-03T00:00:00.000Z').map(
      ({ id, data }) => ({ ...data, id }),
    )
    storeQuery.data = { stores, invalidCount: 0, truncated: false }
    render(<MapPage config={config} />)
    fireEvent.click(
      screen.getByRole('button', { name: `${stores[2].name}・利用不可` }),
    )
    expect(screen.getByRole('article', { name: '店舗の詳細' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '利用可のみ' }))
    expect(
      screen.queryByRole('article', { name: '店舗の詳細' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: '周辺店舗一覧' }).children,
    ).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: /・利用可$/ })).toHaveLength(4)
    expect(
      screen.queryByRole('button', { name: /・利用不可$/ }),
    ).not.toBeInTheDocument()
    expect(placesQuery.search).not.toHaveBeenCalled()
    expect(storeQuery.refetch).not.toHaveBeenCalled()
    expect(linksQuery.refetch).not.toHaveBeenCalled()
  })
})

describe('Placesのピンと登録情報', () => {
  const place: ConveniencePlace = {
    id: 'ChIJ_test',
    name: 'テストコンビニ',
    address: 'テスト住所',
    location: INITIAL_CENTER,
    attributions: [],
  }
  beforeEach(() => {
    placesQuery.status = 'success'
    placesQuery.places = [place]
    linksQuery.data = { [place.id]: null }
  })
  it('未ログインの登録申請は公開情報の保存や再取得を行わない', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MapPage config={config} />
      </QueryClientProvider>,
    )
    await user.click(
      screen.getByRole('button', { name: `${place.name}・データなし` }),
    )
    await user.click(screen.getByRole('button', { name: '登録を申請' }))
    await chooseSelectOption(user, '貸出状況', '利用不可')
    await user.click(screen.getByRole('button', { name: '申請する' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '登録を申請' }),
      ).not.toBeInTheDocument(),
    )
    expect(requests.submit).toHaveBeenCalledExactlyOnceWith(
      {
        requestId: 'request-fixed',
        kind: 'create',
        targetStoreId: 'request-fixed',
        googlePlaceId: place.id,
        baseUpdatedAt: null,
      },
      expect.objectContaining({ name: place.name, location: place.location }),
    )
    expect(writer.save).not.toHaveBeenCalled()
    expect(storeQuery.refetch).not.toHaveBeenCalled()
    expect(linksQuery.refetch).not.toHaveBeenCalled()
    expect(placesQuery.search).not.toHaveBeenCalled()
  })
  it('修正申請は最新の店舗情報と精度を保持した更新日時を使う', async () => {
    const store = {
      ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
      id: 'registered',
      googlePlaceId: place.id,
    }
    const current = { ...store, name: '最新の店名' }
    const baseUpdatedAt = new Timestamp(1000, 123456789)
    storeQuery.data = { stores: [store], invalidCount: 0, truncated: false }
    linksQuery.data = { [place.id]: store }
    requests.readStore.mockResolvedValue({ store: current, baseUpdatedAt })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MapPage config={config} />
      </QueryClientProvider>,
    )
    await user.click(
      screen.getByRole('button', { name: `${store.name}・利用可` }),
    )
    await user.click(screen.getByRole('button', { name: '修正を申請' }))
    await user.type(await screen.findByLabelText('備考'), '修正申請の追記')
    await user.click(screen.getByRole('button', { name: '申請する' }))
    await waitFor(() => expect(requests.submit).toHaveBeenCalledOnce())
    expect(requests.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'update',
        requestId: 'request-fixed',
        targetStoreId: store.id,
        baseUpdatedAt,
      }),
      expect.objectContaining({
        name: current.name,
        location: current.location,
      }),
    )
    expect(writer.save).not.toHaveBeenCalled()
  })
  it('修正申請の準備に失敗したら入力画面を開かず、同じ操作から再試行できる', async () => {
    const store = {
      ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
      id: 'registered',
      googlePlaceId: place.id,
    }
    linksQuery.data = { [place.id]: store }
    requests.readStore
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ store, baseUpdatedAt: new Timestamp(1000, 1) })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MapPage config={config} />
      </QueryClientProvider>,
    )
    await user.click(
      screen.getByRole('button', { name: `${store.name}・利用可` }),
    )
    await user.click(screen.getByRole('button', { name: '修正を申請' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '修正を申請' })).toBeEnabled(),
    )
    expect(requests.readStore).toHaveBeenCalledOnce()
    expect(requests.allocate).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '修正を申請' }))
    await waitFor(() => expect(requests.allocate).toHaveBeenCalledOnce())
    expect(requests.readStore).toHaveBeenCalledTimes(2)
  })
  it.each(['pending', 'error', 'disabled'])(
    '照会が%sの店舗は新規登録の対象にしない',
    async (state) => {
      admin.status = 'admin'
      linksQuery.data = undefined
      linksQuery.isPending = state === 'pending'
      linksQuery.isError = state === 'error'
      linksQuery.enabled = state !== 'disabled'
      render(<MapPage config={config} />)
      const pin = screen.getByRole('button', { name: /^テストコンビニ・/ })
      await userEvent.click(pin)
      expect(
        screen.queryByRole('button', { name: 'トイレ情報を登録' }),
      ).not.toBeInTheDocument()
    },
  )
  it('一覧取得の外にある紐付け済み店舗も、1本の登録ピンと詳細へ統合する', async () => {
    const store = {
      ...createTestStores('2026-11-03T00:00:00.000Z')[4].data,
      id: 'outside-limit',
      name: 'Ｆａｍｉｌｙ Ｍａｒｔ 京橋南店',
      googlePlaceId: place.id,
      isSample: false,
    }
    linksQuery.data = { [place.id]: store }
    render(<MapPage config={config} />)
    expect(
      screen.getByRole('list', { name: '周辺店舗一覧' }).children,
    ).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: `${place.name}・データなし` }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: `${store.name}・利用可` }),
    )
    expect(selectedDirectionsPlaceId()).toBe(store.googlePlaceId)
  })
  it('縮小しても手動検索でき、Placesと登録店舗の検索半径を50kmに制限する', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    render(<MapPage config={config} />)
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    act(() => vi.advanceTimersByTime(300))
    expect(placesQuery.search).toHaveBeenCalledOnce()
    placesQuery.search.mockClear()
    const center = { lat: 35.7, lng: 139.8 }
    finishMapMove(center)
    fireEvent.click(screen.getByRole('button', { name: '地図上の地点を選択' }))
    const bounds = { north: 36.3, south: 35.1, east: 140.5, west: 139.1 }
    maps.getBounds.mockReturnValue({ toJSON: () => bounds })
    const searchButton = screen.getByRole('button', { name: 'この周辺を検索' })
    fireEvent.click(screen.getByRole('button', { name: 'ズーム12' }))
    expect(searchButton).toBeEnabled()
    expect(placesQuery.search).not.toHaveBeenCalled()
    fireEvent.click(searchButton)
    const viewport = { center, bounds, zoom: 12, radiusMeters: 50_000 }
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith(
      viewport,
      DEFAULT_PLACES_CONFIG,
    )
    expect(useStoresMock).toHaveBeenLastCalledWith(viewport, false)
  })
  it('Places検索失敗でも登録店舗は残り、検索だけ再試行できる', async () => {
    placesQuery.status = 'error'
    placesQuery.places = []
    const store = {
      ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
      id: 'registered',
    }
    storeQuery.data = { stores: [store], invalidCount: 0, truncated: false }
    render(<MapPage config={config} />)
    await userEvent.click(
      screen.getByRole('button', { name: `${store.name}の詳細を見る` }),
    )
    expect(selectedDirectionsPlaceId()).toBe(store.googlePlaceId)
    fireEvent.click(
      screen.getByRole('button', { name: 'コンビニ検索を再試行' }),
    )
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith(INITIAL_CENTER)
    expect(storeQuery.refetch).not.toHaveBeenCalled()
  })
  it('新規保存後、一覧の上限外でも紐付け照会から登録済みに切り替え、Placesを再検索しない', async () => {
    admin.status = 'admin'
    storeQuery.data = { stores: [], invalidCount: 0, truncated: true }
    writer.save.mockImplementation(async (target, input) => {
      const store = {
        ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
        ...input,
        id: target.id,
        googlePlaceId: target.googlePlaceId,
        isSample: false,
      }
      linksQuery.data = { [place.id]: store }
      return target.id
    })
    linksQuery.refetch.mockImplementation(async () => ({
      data: linksQuery.data,
      isError: false,
    }))
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MapPage config={config} />
      </QueryClientProvider>,
    )
    await user.click(
      screen.getByRole('button', { name: `${place.name}・データなし` }),
    )
    await user.click(screen.getByRole('button', { name: 'トイレ情報を登録' }))
    for (const [label, value] of [
      ['店名', '独自に確認した店舗'],
      ['住所', '独自に確認した住所'],
    ]) {
      await user.clear(screen.getByLabelText(label))
      await user.type(screen.getByLabelText(label), value)
    }
    await chooseSelectOption(user, '貸出状況', '利用可')
    await user.click(screen.getByRole('button', { name: '保存する' }))
    expect(
      await screen.findByRole('article', { name: '店舗の詳細' }),
    ).toHaveTextContent('独自に確認した店舗')
    expect(writer.save).toHaveBeenCalledWith(
      { id: 'new-fixed', googlePlaceId: place.id },
      expect.objectContaining({ name: '独自に確認した店舗' }),
    )
    expect(linksQuery.refetch).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole('button', { name: `${place.name}・データなし` }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '独自に確認した店舗・利用可' }),
    ).toBeVisible()
    expect(placesQuery.search).not.toHaveBeenCalled()
  })
  it('周辺の検索中は再検索しても追加要求を送らない', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    placesQuery.status = 'loading'
    const { rerender } = render(<MapPage config={config} />)
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    fireEvent.click(screen.getByRole('button', { name: 'コンビニを検索中' }))
    expect(placesQuery.search).not.toHaveBeenCalled()
    placesQuery.status = 'success'
    rerender(<MapPage config={config} />)
    fireEvent.click(screen.getByRole('button', { name: 'この周辺を検索' }))
    expect(placesQuery.search).toHaveBeenCalledOnce()
  })
})
