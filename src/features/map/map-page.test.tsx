import { StrictMode, type ReactNode } from 'react'
import {
  act,
  fireEvent,
  render as renderUI,
  screen,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MapPage } from './map-page'
import {
  INITIAL_CENTER,
  DEFAULT_PLACES_CONFIG,
  getMapConfig,
  locationErrorMessage,
} from './map-config'
import { createTestStores } from '../../../tests/fixtures/stores'
import type { StoreListResult } from '../stores/store-schema'
import type { ConveniencePlace } from '../places/nearby-places'
import type { PlaceLinks } from '../places/place-links'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/theme-provider'

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
const writer = vi.hoisted(() => ({
  allocate: vi.fn(() => 'new-fixed'),
  save: vi.fn(),
}))
vi.mock('../auth/admin-provider', () => ({ useAdmin: () => admin }))
vi.mock('../stores/store-writer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../stores/store-writer')>()),
  allocateStoreId: () => writer.allocate(),
  saveLocalStore: (...args: unknown[]) => writer.save(...args),
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

// 通信・課金を発生させず、SDKとの境界と利用者の操作を検証する。
vi.mock('@vis.gl/react-google-maps', () => ({
  APILoadingStatus: {
    NOT_LOADED: 'NOT_LOADED',
    LOADING: 'LOADING',
    LOADED: 'LOADED',
    FAILED: 'FAILED',
    AUTH_FAILURE: 'AUTH_FAILURE',
  },
  APIProvider: ({ children }: { children: ReactNode }) => children,
  useApiLoadingStatus: () => maps.status,
  useMap: () => mapInstance.current,
  Map: ({
    children,
    onClick,
    onTilesLoaded,
    onIdle,
    center,
    zoom,
    heading,
    tilt,
    colorScheme,
    onCameraChanged,
  }: {
    children: ReactNode
    onClick?: (event: unknown) => void
    onTilesLoaded: () => void
    onIdle: () => void
    center: { lat: number; lng: number }
    zoom: number
    heading: number
    tilt: number
    colorScheme: string
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
      data-color-scheme={colorScheme}
      data-camera={JSON.stringify({ center, zoom, heading, tilt })}
    >
      <button
        onClick={() =>
          onCameraChanged({
            detail: {
              center: { lat: 35.8, lng: 139.9 },
              zoom: 17,
              heading: 20,
              tilt: 30,
              bounds: maps.getBounds().toJSON(),
            },
          })
        }
      >
        地図カメラを移動
      </button>
      <button onClick={onTilesLoaded}>地図の描画を完了</button>
      <button onClick={onIdle}>地図を移動</button>
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
        onClick={() =>
          onClick?.({
            detail: { latLng: { lat: 35.68, lng: 139.76 } },
            stoppable: false,
          })
        }
      >
        地図上の地点を選択
      </button>
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

beforeEach(() => {
  vi.clearAllMocks()
  mapInstance.current = maps
  maps.getZoom.mockReset().mockReturnValue(14)
  localStorage.clear()
  writer.save.mockReset().mockResolvedValue('new-fixed')
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
    name: '新規テスト店舗',
    address: 'テスト住所',
    location: { lat: 35.68, lng: 139.76 },
    attributions: [],
  }
  async function openRegistration() {
    placesQuery.status = 'success'
    placesQuery.places = [place]
    linksQuery.data = { [place.id]: null }
    const user = renderAdmin()
    expect(
      screen.queryByRole('button', { name: '店舗を登録' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: `${place.name}・データなし` }),
    )
    await user.click(screen.getByRole('button', { name: 'トイレ情報を登録' }))
    return user
  }
  it('Placesの店舗から登録し、保存後に一覧・詳細・ピンを更新する', async () => {
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
    expect(screen.queryByLabelText('緯度')).not.toBeInTheDocument()
    expect(screen.getByLabelText('店名')).toHaveValue(place.name)
    expect(screen.getByLabelText('住所')).toHaveValue(place.address)
    await user.selectOptions(
      screen.getByLabelText('コンビニの種類'),
      'セブン-イレブン',
    )
    await user.selectOptions(screen.getByLabelText('貸出状況'), 'available')
    await user.click(screen.getByRole('button', { name: '保存する' }))
    expect(
      await screen.findByRole('article', { name: '店舗の詳細' }),
    ).toHaveTextContent(place.name)
    expect(writer.save).toHaveBeenCalledWith(
      { id: 'new-fixed', googlePlaceId: place.id },
      expect.objectContaining({ location: place.location }),
    )
    expect(screen.getByText('登録店舗 7件')).toBeVisible()
    expect(maps.panTo).toHaveBeenLastCalledWith(place.location)
    expect(
      screen.getByRole('button', { name: `${place.name}・利用可` }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: '店舗を編集' }))
    expect(screen.getByLabelText('店名')).toHaveValue(place.name)
    expect(screen.getByLabelText('コンビニの種類')).toHaveValue(
      'セブン-イレブン',
    )
    expect(screen.getByLabelText('貸出状況')).toHaveValue('available')
  })
  it('取得上限外でも保存成功と省略理由を伝える', async () => {
    writer.save.mockResolvedValue('new-fixed')
    storeQuery.data!.truncated = true
    const user = await openRegistration()
    await user.selectOptions(screen.getByLabelText('コンビニの種類'), 'その他')
    await user.selectOptions(screen.getByLabelText('貸出状況'), 'available')
    await user.click(screen.getByRole('button', { name: '保存する' }))
    expect(
      await screen.findByText(
        /検索範囲・取得上限により一覧には表示されていません/,
      ),
    ).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('一般利用者には登録・編集・ログイン入口を表示しない', async () => {
    admin.status = 'signedOut'
    const user = renderAdmin()
    expect(
      screen.queryByRole('button', { name: '店舗を登録' }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: `${samples[0].name}の詳細を見る` }),
    )
    expect(
      screen.queryByRole('button', { name: '店舗を編集' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '管理者ログイン' }),
    ).not.toBeInTheDocument()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('地図の設定と失敗時の表示', () => {
  it('キー未設定ではAPIを起動する代わりに設定案内を表示する', () => {
    render(<MapPage config={{ ...config, apiKey: '' }} />)
    expect(
      screen.getByRole('heading', { name: '地図の設定が必要です' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '地図の描画を完了' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['FAILED', '地図を読み込めませんでした'],
    ['AUTH_FAILURE', '地図を利用できません'],
  ])('%s時に再読み込みできるエラーを表示する', (status, title) => {
    maps.status = status
    render(<MapPage config={config} />)
    expect(screen.getByRole('heading', { name: title })).toBeVisible()
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: '地図の描画を完了' }),
    ).not.toBeInTheDocument()
  })

  it('Map IDが空なら開発用IDを使用し、余分な空白を除く', () => {
    expect(
      getMapConfig({
        VITE_GOOGLE_MAPS_API_KEY: ' test-key ',
        VITE_GOOGLE_MAPS_MAP_ID: ' ',
      }),
    ).toEqual({ ...configWithKey('test-key'), places: DEFAULT_PLACES_CONFIG })
  })

  it('長時間の読み込みでも再試行する方法を案内する', () => {
    vi.useFakeTimers()
    maps.status = 'LOADING'
    render(<MapPage config={config} />)
    act(() => vi.advanceTimersByTime(20_000))
    expect(
      screen.getByRole('heading', {
        name: '地図の読み込みに時間がかかっています',
      }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeEnabled()
  })
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
  expect(screen.getByText('トイレ情報：データなし')).toBeVisible()
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
  fireEvent.click(screen.getByRole('button', { name: '店舗情報を更新' }))
  expect(storeQuery.refetch).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'ズーム12' }))
  expect(screen.getByText('地図を拡大すると検索を再開します')).toBeVisible()
  expect(screen.getByText('トイレ情報：データなし')).toBeVisible()
  expect(screen.getByRole('button', { name: 'この周辺を検索' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'コンビニ検索を再試行' }),
  ).toBeDisabled()
  expect(screen.getByRole('button', { name: '店舗情報を更新' })).toBeDisabled()
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

function configWithKey(apiKey: string) {
  return { apiKey, mapId: 'DEMO_MAP_ID' }
}

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
  const searchCount = placesQuery.search.mock.calls.length
  const nextMap = { ...maps, panTo: vi.fn(), setZoom: vi.fn() }
  mapInstance.current = nextMap
  await user.click(screen.getByRole('button', { name: /テーマを変更/ }))
  await user.click(screen.getByRole('menuitemradio', { name: 'ダーク' }))
  expect(screen.getByTestId('map')).toHaveAttribute('data-color-scheme', 'DARK')
  expect(screen.getByTestId('map')).toHaveAttribute('data-camera', camera)
  expect(screen.getByRole('article', { name: '店舗の詳細' })).toHaveTextContent(
    store.name,
  )
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
    new StorageEvent('storage', { key: 'toilet-map-theme', newValue: 'dark' }),
  )
  expect(document.documentElement).toHaveClass('dark')
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByLabelText('店名')).toHaveValue('編集中の店名')
})

describe('Firestoreの店舗表示', () => {
  const stores = createTestStores('2026-11-03T00:00:00.000Z').map(
    ({ id, data }) => ({ ...data, id }),
  )
  beforeEach(() => {
    storeQuery.data = { stores, invalidCount: 0, truncated: false }
  })

  it('一覧・ピンから同じ詳細を開き、地図の余白をクリックしても詳細を維持する', async () => {
    const user = userEvent.setup()
    render(<MapPage config={config} />)
    expect(
      screen.getByRole('list', { name: '周辺店舗一覧' }).children,
    ).toHaveLength(6)
    await user.click(
      screen.getByRole('button', { name: `${stores[1].name}の詳細を見る` }),
    )
    expect(
      screen.getByRole('article', { name: '店舗の詳細' }),
    ).toHaveTextContent(stores[1].notes)
    expect(maps.panTo).toHaveBeenLastCalledWith(stores[1].location)
    expect(screen.queryByText('共用個室')).not.toBeInTheDocument()
    expect(
      screen.getByText('男性用小便器').nextElementSibling,
    ).toHaveTextContent('1基')
    expect(screen.queryByText(/最終確認日/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '地図上の地点を選択' }))
    expect(
      screen.getByRole('article', { name: '店舗の詳細' }),
    ).toHaveTextContent(stores[1].notes)
    expect(screen.queryByText('35.680000')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: `${stores[4].name}・利用可` }),
    )
    expect(screen.queryByText('35.680000')).not.toBeInTheDocument()
    expect(
      screen.getByText('男性用小便器').nextElementSibling,
    ).toHaveTextContent('不明')
    await user.click(screen.getByRole('button', { name: '一覧へ戻る' }))
    expect(screen.getByRole('list', { name: '周辺店舗一覧' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '店舗情報を更新' }))
    expect(storeQuery.refetch).toHaveBeenCalledTimes(1)
  })

  it('不正データ・取得上限・利用不可を明示する', () => {
    storeQuery.data = { stores, invalidCount: 2, truncated: true }
    render(<MapPage config={config} />)
    expect(screen.getByText(/形式が正しくない2件/)).toBeVisible()
    expect(screen.getByText(/取得上限に達したため/)).toBeVisible()
    expect(screen.getAllByText('利用不可')).toHaveLength(2)
    expect(screen.queryByText('架空のサンプルデータ')).not.toBeInTheDocument()
  })

  it.each([
    ['loading', '店舗情報を読み込み中'],
    ['empty', '半径3km以内に登録された店舗はありません。'],
    ['error', '店舗情報を読み込めませんでした。'],
    ['disabled', '登録情報を利用できません。'],
  ])('%s状態でも地図操作は継続できる', (state, message) => {
    storeQuery.data =
      state === 'empty'
        ? { stores: [], invalidCount: 0, truncated: false }
        : undefined
    storeQuery.isPending = state === 'loading'
    storeQuery.isError = state === 'error'
    storeQuery.enabled = state !== 'disabled'
    render(<MapPage config={config} />)
    expect(screen.getByText((text) => text.startsWith(message))).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '地図上の地点を選択' }))
    expect(screen.queryByText('35.680000')).not.toBeInTheDocument()
  })
})

describe('地図の余白のクリック', () => {
  it('任意地点のピン・座標・登録操作を表示しない', async () => {
    admin.status = 'admin'
    render(<MapPage config={config} />)
    await userEvent.click(
      screen.getByRole('button', { name: '地図上の地点を選択' }),
    )
    expect(screen.queryByLabelText('選択した場所')).not.toBeInTheDocument()
    expect(screen.queryByText('35.680000')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '座標をコピー' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'ここに店舗を登録' }),
    ).not.toBeInTheDocument()
    expect(writer.allocate).not.toHaveBeenCalled()
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
    expect(getCurrentPosition).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '現在地に移動' })).toBeDisabled()
    unmount()
    act(() =>
      complete!({
        coords: { latitude: 34.7, longitude: 135.5 },
      } as GeolocationPosition),
    )
    expect(maps.panTo).not.toHaveBeenCalled()
  })

  it('位置情報に非対応でも東京駅周辺を表示する', () => {
    vi.stubGlobal('navigator', {})
    render(<MapPage config={config} />)
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'このブラウザでは現在地を取得できません',
    )
    expect(screen.getByText('東京駅から半径3km・近い順')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '地図上の地点を選択' }))
    expect(screen.queryByText('35.680000')).not.toBeInTheDocument()
  })

  it('初回描画後に自動取得し、現在地の周辺データへ切り替える', () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 34.7, longitude: 135.5 },
      } as GeolocationPosition)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<MapPage config={config} />)
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '現在地に移動' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(maps.panTo).toHaveBeenCalledWith({ lat: 34.7, lng: 135.5 })
    expect(maps.setZoom).toHaveBeenCalledWith(15)
    expect(screen.getByLabelText('現在地')).toBeInTheDocument()
    expect(useStoresMock).toHaveBeenLastCalledWith(
      { lat: 34.7, lng: 135.5 },
      false,
    )
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith({
      lat: 34.7,
      lng: 135.5,
    })
    expect(screen.getByText('現在地から半径3km・近い順')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '現在地に移動' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('位置情報を拒否しても東京駅周辺を検索する', () => {
    const getCurrentPosition = vi.fn((_success, error: PositionErrorCallback) =>
      error({ code: 1 } as GeolocationPositionError),
    )
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    render(<MapPage config={config} />)
    fireEvent.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(screen.getByText('東京駅から半径3km・近い順')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '位置情報の利用が許可されていません',
    )
    fireEvent.click(screen.getByRole('button', { name: '地図上の地点を選択' }))
    expect(screen.queryByText('35.680000')).not.toBeInTheDocument()
    expect(maps.panTo).not.toHaveBeenCalled()
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith(INITIAL_CENTER)
  })

  it('位置情報のタイムアウトを区別する', () => {
    expect(locationErrorMessage(3)).toContain('時間がかかっています')
    expect(locationErrorMessage(2)).toContain('取得できませんでした')
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
  it('未登録ピンも選択状態になり、一般利用者は閲覧できる', async () => {
    const user = userEvent.setup()
    render(<MapPage config={config} />)
    const pin = screen.getByRole('button', {
      name: `${place.name}・データなし`,
    })
    expect(pin.firstChild).toHaveAttribute('data-selected', 'false')
    expect(pin.firstChild).toHaveAttribute('data-registered', 'false')
    await user.click(pin)
    expect(pin.firstChild).toHaveAttribute('data-selected', 'true')
    expect(screen.getByText('トイレ情報：データなし')).toBeVisible()
    expect(screen.getByText(place.address)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'トイレ情報を登録' }),
    ).not.toBeInTheDocument()
  })
  it.each(['pending', 'error', 'disabled'])(
    '%sでは未登録と断定せず、登録操作も出さない',
    async (state) => {
      admin.status = 'admin'
      linksQuery.data = undefined
      linksQuery.isPending = state === 'pending'
      linksQuery.isError = state === 'error'
      linksQuery.enabled = state !== 'disabled'
      render(<MapPage config={config} />)
      await userEvent.click(
        screen.getByRole('button', { name: /テストコンビニ・登録情報を確認/ }),
      )
      expect(
        screen.queryByText('トイレ情報：データなし'),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'トイレ情報を登録' }),
      ).not.toBeInTheDocument()
    },
  )
  it('一覧取得の外にある紐付け済み店舗も、1本の登録ピンと詳細へ統合する', async () => {
    const store = {
      ...createTestStores('2026-11-03T00:00:00.000Z')[4].data,
      id: 'outside-limit',
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
    expect(screen.getByRole('article', { name: '店舗の詳細' })).toBeVisible()
    expect(screen.queryByText('トイレ情報：データなし')).not.toBeInTheDocument()
  })
  it('地図移動・地点選択では検索せず、検索ボタンから両方の検索中心を更新する', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('navigator', {})
    render(<MapPage config={config} />)
    await user.click(screen.getByRole('button', { name: '地図の描画を完了' }))
    placesQuery.search.mockClear()
    await user.click(screen.getByRole('button', { name: '地図を移動' }))
    await user.click(screen.getByRole('button', { name: '地図上の地点を選択' }))
    expect(placesQuery.search).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'この周辺を検索' }))
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith({
      lat: 35.7,
      lng: 139.8,
    })
    expect(useStoresMock).toHaveBeenLastCalledWith(
      { lat: 35.7, lng: 139.8 },
      false,
    )
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
    expect(
      screen.getByRole('button', { name: `${store.name}の詳細を見る` }),
    ).toBeVisible()
    expect(
      screen.queryByText('コンビニ検索の結果は0件です。'),
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'コンビニ検索を再試行' }),
    )
    expect(placesQuery.search).toHaveBeenCalledExactlyOnceWith(INITIAL_CENTER)
  })
  it('新規保存後、一覧の上限外でも紐付け照会から登録済みに切り替え、Placesを再検索しない', async () => {
    admin.status = 'admin'
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
    await user.selectOptions(screen.getByLabelText('コンビニの種類'), 'その他')
    await user.selectOptions(screen.getByLabelText('貸出状況'), 'available')
    await user.click(screen.getByRole('button', { name: '保存する' }))
    expect(
      await screen.findByRole('article', { name: '店舗の詳細' }),
    ).toHaveTextContent('独自に確認した店舗')
    expect(writer.save).toHaveBeenCalledWith(
      { id: 'new-fixed', googlePlaceId: place.id },
      expect.objectContaining({ name: '独自に確認した店舗' }),
    )
    expect(
      screen.queryByRole('button', { name: `${place.name}・データなし` }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '独自に確認した店舗・利用可' }),
    ).toBeVisible()
    expect(placesQuery.search).not.toHaveBeenCalled()
  })
  it('Places登録済みの店舗は一覧・照会の両方にあってもピンと行を1件にまとめる', async () => {
    const store = {
      ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
      id: 'registered',
      googlePlaceId: place.id,
    }
    storeQuery.data = { stores: [store], invalidCount: 0, truncated: false }
    linksQuery.data = { [place.id]: store }
    render(<MapPage config={config} />)
    expect(
      screen.getByRole('list', { name: '周辺店舗一覧' }).children,
    ).toHaveLength(1)
    expect(
      screen.getAllByRole('button', { name: `${store.name}・利用可` }),
    ).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: `${place.name}・データなし` }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: `${store.name}・利用可` }),
    )
    expect(
      screen.getByRole('article', { name: '店舗の詳細' }),
    ).toHaveTextContent(store.name)
    expect(placesQuery.search).not.toHaveBeenCalled()
  })
  it('上限の説明文を表示せず、検索中は再検索ボタンを無効にする', () => {
    placesQuery.limited = true
    const { rerender } = render(<MapPage config={config} />)
    expect(
      screen.queryByText(/コンビニ検索は近い最大20件/),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('確認中・確認不可もグレー'),
    ).not.toBeInTheDocument()
    placesQuery.status = 'loading'
    rerender(<MapPage config={config} />)
    expect(
      screen.getByRole('button', { name: 'コンビニを検索中' }),
    ).toBeDisabled()
  })
  it('管理者の新規登録にPlacesの店舗情報を渡し、座標の手入力を許可しない', async () => {
    admin.status = 'admin'
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
    expect(screen.getByLabelText('店名')).toHaveValue(place.name)
    expect(screen.getByLabelText('住所')).toHaveValue(place.address)
    expect(screen.queryByLabelText('緯度')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('経度')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '登録済み店舗と紐付け' }),
    ).not.toBeInTheDocument()
  })
})
