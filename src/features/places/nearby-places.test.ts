import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PLACES_CONFIG, INITIAL_CENTER } from '../map/map-config'
import type { MapViewport } from '../map/search-area'
import {
  searchConveniencePlaces,
  searchViewportPlaces,
  useNearbyPlaces,
} from './nearby-places'

const nearby = vi.fn()
const place = (id = 'ChIJ_test') => ({
  id,
  displayName: 'コンビニ',
  formattedAddress: '住所',
  location: { toJSON: () => INITIAL_CENTER },
  attributions: [],
})
const viewport: MapViewport = {
  center: INITIAL_CENTER,
  bounds: { north: 35.71, south: 35.65, east: 139.8, west: 139.73 },
  zoom: 14,
}
beforeEach(() => {
  nearby.mockReset().mockResolvedValue({ places: [] })
  vi.stubGlobal('google', {
    maps: {
      importLibrary: vi
        .fn()
        .mockResolvedValue({ Place: { searchNearby: nearby } }),
    },
  })
})

describe('表示範囲の分割検索', () => {
  it('20件に達した範囲を追加検索し、重複を除いた100件で停止する', async () => {
    let batch = 0
    nearby.mockImplementation(async () => {
      const prefix = batch++
      return {
        places: Array.from({ length: 20 }, (_, index) =>
          place(`ChIJ_${prefix}_${index}`),
        ),
      }
    })
    const result = await searchViewportPlaces(viewport)
    expect(result.places).toHaveLength(100)
    expect(result.limited).toBe(true)
    expect(nearby).toHaveBeenCalledTimes(5)
    for (const [request] of nearby.mock.calls) {
      expect(request.maxResultCount).toBe(20)
      expect(request.locationRestriction.radius).toBeLessThanOrEqual(50_000)
    }
  })
  it('密集・重複した結果でも親を含めて9要求までに制限する', async () => {
    nearby.mockResolvedValue({
      places: Array.from({ length: 20 }, (_, index) => place(`ChIJ_${index}`)),
    })
    const result = await searchViewportPlaces(viewport)
    expect(nearby).toHaveBeenCalledTimes(9)
    expect(result.places).toHaveLength(20)
    expect(result.limited).toBe(true)
  })
  it('分割無効では表示範囲の1要求・最大20件に制限する', async () => {
    nearby.mockResolvedValue({
      places: Array.from({ length: 20 }, (_, index) => place(`ChIJ_${index}`)),
    })
    const result = await searchViewportPlaces(viewport, {
      ...DEFAULT_PLACES_CONFIG,
      expandedSearch: false,
    })
    expect(nearby).toHaveBeenCalledOnce()
    expect(result.places).toHaveLength(20)
    expect(nearby.mock.calls[0][0].locationRestriction.radius).not.toBe(3000)
  })
  it('設定した件数・要求数を超えない', async () => {
    nearby.mockResolvedValue({
      places: Array.from({ length: 20 }, (_, index) => place(`ChIJ_${index}`)),
    })
    expect(
      (
        await searchViewportPlaces(viewport, {
          ...DEFAULT_PLACES_CONFIG,
          maxResults: 7,
        })
      ).places,
    ).toHaveLength(7)
    expect(nearby).toHaveBeenCalledOnce()
    nearby.mockClear()
    await searchViewportPlaces(viewport, {
      ...DEFAULT_PLACES_CONFIG,
      maxRequests: 2,
    })
    expect(nearby).toHaveBeenCalledTimes(2)
  })
  it('表示範囲外・不正データ・重複を除外して中心から近い順にする', async () => {
    nearby.mockResolvedValue({
      places: [
        {
          ...place('far'),
          location: { toJSON: () => ({ lat: 35.7, lng: 139.79 }) },
        },
        place('near'),
        place('near'),
        place('invalid/id'),
        {
          ...place('outside'),
          location: { toJSON: () => ({ lat: 36, lng: 140 }) },
        },
      ],
    })
    const result = await searchViewportPlaces(viewport)
    expect(result.places.map(({ id }) => id)).toEqual(['near', 'far'])
    expect(result.limited).toBe(false)
  })
  it('一部失敗は取得できた店舗と区別して返し、全失敗はエラーにする', async () => {
    nearby
      .mockResolvedValueOnce({
        places: Array.from({ length: 20 }, (_, i) => place(`ChIJ_${i}`)),
      })
      .mockRejectedValueOnce(new Error('private error'))
      .mockResolvedValue({ places: [place('other')] })
    const result = await searchViewportPlaces(viewport)
    expect(result.places).toHaveLength(21)
    expect(result.partialError).toBe(true)
    expect(nearby).toHaveBeenCalledTimes(5)
    nearby.mockRejectedValue(new Error('private error'))
    await expect(searchViewportPlaces(viewport)).rejects.toThrow(
      'Places search failed',
    )
  })
  it('50kmを超える表示範囲は先に分割し、要求上限で打ち切る', async () => {
    const result = await searchViewportPlaces(
      { ...viewport, bounds: { north: 40, south: 30, east: 145, west: 130 } },
      { ...DEFAULT_PLACES_CONFIG, maxRequests: 3 },
    )
    expect(nearby).toHaveBeenCalledTimes(3)
    expect(result.limited).toBe(true)
    for (const [request] of nearby.mock.calls)
      expect(request.locationRestriction.radius).toBeLessThanOrEqual(50_000)
  })
  it('空の表示範囲ではAPIを呼ばない', async () => {
    await expect(
      searchViewportPlaces({
        ...viewport,
        bounds: { ...viewport.bounds, north: viewport.bounds.south },
      }),
    ).rejects.toThrow('Invalid search viewport')
    expect(nearby).not.toHaveBeenCalled()
  })
})

describe('自動検索の世代と表示維持', () => {
  it('再取得中と失敗時に前回結果・登録照会の世代を維持する', async () => {
    nearby.mockResolvedValueOnce({ places: [place('previous')] })
    const { result } = renderHook(() => useNearbyPlaces())
    await act(async () => {
      await result.current.search(viewport)
    })
    const requestId = result.current.requestId
    let fail!: (error: Error) => void
    nearby.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        }),
    )
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.search(viewport)
    })
    expect(result.current.status).toBe('loading')
    expect(result.current.places[0].id).toBe('previous')
    expect(result.current.requestId).toBe(requestId)
    await act(async () => {
      fail(new Error('private error'))
      await pending
    })
    expect(result.current.status).toBe('error')
    expect(result.current.places[0].id).toBe('previous')
    expect(result.current.requestId).toBe(requestId)
  })
  it('縮小停止後の応答から分割要求を増やさず、前回表示へ戻す', async () => {
    nearby.mockResolvedValueOnce({ places: [place('previous')] })
    const { result } = renderHook(() => useNearbyPlaces())
    await act(async () => {
      await result.current.search(viewport)
    })
    let finish!: (value: { places: ReturnType<typeof place>[] }) => void
    nearby.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.search(viewport)
    })
    await act(async () => {
      result.current.cancel()
      await pending
    })
    await act(async () => {
      finish({
        places: Array.from({ length: 20 }, (_, i) => place(`old_${i}`)),
      })
    })
    expect(nearby).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('success')
    expect(result.current.places[0].id).toBe('previous')
  })
  it('送信済みの古い通信を含め同時2要求を守り、空き枠では最新検索を送る', async () => {
    nearby.mockResolvedValueOnce({
      places: Array.from({ length: 20 }, (_, i) => place(`old_${i}`)),
    })
    const pendingResponses: ((value: {
      places: ReturnType<typeof place>[]
    }) => void)[] = []
    nearby
      .mockImplementationOnce(
        () => new Promise((resolve) => pendingResponses.push(resolve)),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => pendingResponses.push(resolve)),
      )
      .mockResolvedValue({ places: [place('latest')] })
    const { result } = renderHook(() => useNearbyPlaces())
    let old!: Promise<void>
    await act(async () => {
      old = result.current.search(viewport)
    })
    await waitFor(() => expect(nearby).toHaveBeenCalledTimes(3))
    let latest!: Promise<void>
    await act(async () => {
      latest = result.current.search({ ...viewport, zoom: 15 })
      await old
    })
    expect(nearby).toHaveBeenCalledTimes(3)
    await act(async () => {
      pendingResponses[0]({ places: [] })
      await latest
    })
    expect(nearby).toHaveBeenCalledTimes(4)
    expect(result.current.places[0].id).toBe('latest')
    await act(async () => {
      pendingResponses[1]({ places: [place('obsolete')] })
    })
    expect(result.current.places[0].id).toBe('latest')
    expect(nearby).toHaveBeenCalledTimes(4)
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('Places API境界', () => {
  it('半径3km・距離順・20件・コンビニだけを必要なフィールドで検索する', async () => {
    nearby.mockResolvedValue({
      places: Array.from({ length: 20 }, (_, index) => place(`ChIJ_${index}`)),
    })
    const result = await searchConveniencePlaces(INITIAL_CENTER)
    expect(nearby).toHaveBeenCalledExactlyOnceWith({
      fields: [
        'id',
        'displayName',
        'formattedAddress',
        'location',
        'attributions',
      ],
      includedTypes: ['convenience_store'],
      locationRestriction: { center: INITIAL_CENTER, radius: 3000 },
      rankPreference: 'DISTANCE',
      maxResultCount: 20,
      language: 'ja',
      region: 'jp',
    })
    expect(result.places).toHaveLength(20)
    expect(result.limited).toBe(true)
  })
  it('同一IDの重複、無効なID・座標を除く', async () => {
    nearby.mockResolvedValue({
      places: [
        place(),
        place(),
        place('invalid/id'),
        { ...place('bad'), location: { toJSON: () => ({ lat: NaN, lng: 0 }) } },
        { ...place('no_location'), location: null },
      ],
    })
    expect((await searchConveniencePlaces(INITIAL_CENTER)).places).toHaveLength(
      1,
    )
  })
})

describe('手動検索の制御', () => {
  it('初期化だけでは呼び出さず、同じ中心への同時要求を抑止する', async () => {
    let finish!: (value: { places: ReturnType<typeof place>[] }) => void
    nearby.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { result } = renderHook(() => useNearbyPlaces())
    expect(nearby).not.toHaveBeenCalled()
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.search(INITIAL_CENTER)
      void result.current.search(INITIAL_CENTER)
    })
    expect(nearby).toHaveBeenCalledOnce()
    await act(async () => {
      finish({ places: [place()] })
      await pending
    })
    expect(result.current.status).toBe('success')
  })
  it('新しい検索の完了後に古い検索が返っても上書きしない', async () => {
    let finishOld!: (value: { places: ReturnType<typeof place>[] }) => void
    nearby.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve
        }),
    )
    nearby.mockResolvedValueOnce({ places: [place('new')] })
    const { result } = renderHook(() => useNearbyPlaces())
    let old!: Promise<void>
    await act(async () => {
      old = result.current.search(INITIAL_CENTER)
    })
    await act(async () => {
      await result.current.search({ lat: 34.7, lng: 135.5 })
    })
    await act(async () => {
      finishOld({ places: [place('old')] })
      await old
    })
    expect(result.current.places[0].id).toBe('new')
  })
  it('失敗と0件を区別し、自動再試行しない', async () => {
    nearby.mockRejectedValueOnce(new Error('private API error'))
    const { result } = renderHook(() => useNearbyPlaces())
    await act(async () => {
      await result.current.search(INITIAL_CENTER)
    })
    expect(result.current.status).toBe('error')
    expect(nearby).toHaveBeenCalledOnce()
    await act(async () => {
      await result.current.search(INITIAL_CENTER)
    })
    expect(result.current.status).toBe('success')
    expect(result.current.places).toEqual([])
  })
  it('アンマウント後の結果を破棄する', async () => {
    let finish!: (value: { places: ReturnType<typeof place>[] }) => void
    nearby.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { result, unmount } = renderHook(() => useNearbyPlaces())
    let pending!: Promise<void>
    await act(async () => {
      pending = result.current.search(INITIAL_CENTER)
    })
    unmount()
    await act(async () => {
      finish({ places: [place()] })
      await pending
    })
    expect(result.current.places).toEqual([])
  })
})
