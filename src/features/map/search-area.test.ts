import { describe, expect, it } from 'vitest'
import { DEFAULT_PLACES_CONFIG, getMapConfig } from './map-config'
import {
  boundsCenter,
  containsPoint,
  searchAreaKey,
  validViewport,
  type MapViewport,
} from './search-area'

describe('自動検索の環境設定', () => {
  it('未設定なら従来モードと100件・9要求・ズーム13を使用する', () => {
    expect(getMapConfig({}).places).toEqual(DEFAULT_PLACES_CONFIG)
  })
  it('自動取得と分割取得を別々に切り替え、上限を設定できる', () => {
    expect(
      getMapConfig({
        VITE_PLACES_AUTO_SEARCH: ' true ',
        VITE_PLACES_EXPANDED_SEARCH: 'false',
        VITE_PLACES_MIN_ZOOM: '14',
        VITE_PLACES_MAX_RESULTS: '200',
        VITE_PLACES_MAX_REQUESTS: '21',
      }).places,
    ).toEqual({
      autoSearch: true,
      expandedSearch: false,
      minZoom: 14,
      maxResults: 200,
      maxRequests: 21,
    })
  })
  it.each(['', '0', '-1', '1.5', 'Infinity', 'NaN', '9007199254740992'])(
    '不正な取得上限%sを初期値へ戻す',
    (value) => {
      expect(
        getMapConfig({
          VITE_PLACES_MAX_RESULTS: value,
          VITE_PLACES_MAX_REQUESTS: value,
        }).places,
      ).toEqual(DEFAULT_PLACES_CONFIG)
    },
  )
  it('不正なフラグとズームを初期値へ戻す', () => {
    expect(
      getMapConfig({
        VITE_PLACES_AUTO_SEARCH: '1',
        VITE_PLACES_EXPANDED_SEARCH: 'no',
        VITE_PLACES_MIN_ZOOM: '23',
      }).places,
    ).toEqual(DEFAULT_PLACES_CONFIG)
  })
})

describe('表示範囲', () => {
  const view: MapViewport = {
    center: { lat: 0, lng: 180 },
    bounds: { north: 1, south: -1, west: 179, east: -179 },
    zoom: 14,
  }
  it('日付変更線をまたぐ範囲を正しく判定する', () => {
    expect(validViewport(view)).toBe(true)
    expect(containsPoint(view.bounds, { lat: 0, lng: 179.5 })).toBe(true)
    expect(containsPoint(view.bounds, { lat: 0, lng: -179.5 })).toBe(true)
    expect(containsPoint(view.bounds, { lat: 0, lng: 0 })).toBe(false)
    expect(Math.abs(boundsCenter(view.bounds).lng)).toBe(180)
  })
  it('プロパティ順やSDKの微小な揺れで検索条件を変更しない', () => {
    expect(searchAreaKey(view)).toBe(
      searchAreaKey({
        ...view,
        center: { lat: 0.0000001, lng: 180 },
        bounds: { east: -179, west: 179, south: -1, north: 1 },
      }),
    )
  })
  it('無効な座標・ズーム・空の表示範囲を拒否する', () => {
    expect(validViewport({ ...view, zoom: NaN })).toBe(false)
    expect(
      validViewport({ ...view, bounds: { ...view.bounds, north: -1 } }),
    ).toBe(false)
    expect(validViewport({ ...view, center: { lat: 91, lng: 0 } })).toBe(false)
  })
})
