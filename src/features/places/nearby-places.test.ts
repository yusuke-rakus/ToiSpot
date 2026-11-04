import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INITIAL_CENTER } from '../map/map-config'
import { searchConveniencePlaces, useNearbyPlaces } from './nearby-places'

const nearby = vi.fn()
const place = (id = 'ChIJ_test') => ({
  id,
  displayName: 'コンビニ',
  formattedAddress: '住所',
  location: { toJSON: () => INITIAL_CENTER },
  attributions: [],
})
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
