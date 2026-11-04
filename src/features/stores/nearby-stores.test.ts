import { describe, expect, it } from 'vitest'
import { collectNearbyStores } from './nearby-stores'
import { createTestStores } from '../../../tests/fixtures/stores'
import { INITIAL_CENTER } from '../map/map-config'

const sample = createTestStores('2026-11-03T00:00:00.000Z')[0].data
function document(id: string, lat: number, lng = INITIAL_CENTER.lng) {
  return { id, data: { ...sample, location: { lat, lng } } }
}

describe('周辺の店舗候補', () => {
  it('3kmの範囲外を除外し、重複と不正データを除いて近い順にする', () => {
    const near = document('near', INITIAL_CENTER.lat)
    const farther = document('farther', INITIAL_CENTER.lat + 0.01)
    const outside = document('outside', INITIAL_CENTER.lat + 0.03)
    const invalid = { id: 'invalid', data: {} }
    const result = collectNearbyStores(
      [
        [farther, near, outside, invalid],
        [near, invalid],
      ],
      INITIAL_CENTER,
    )
    expect(result.stores.map(({ id }) => id)).toEqual(['near', 'farther'])
    expect(result.invalidCount).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it('範囲ごとに100候補へ制限し、絞り込み後が0件でも省略を保持する', () => {
    const outside = Array.from({ length: 100 }, (_, i) =>
      document(`outside-${i}`, 0, 0),
    )
    const result = collectNearbyStores(
      [[...outside, document('extra', INITIAL_CENTER.lat)]],
      INITIAL_CENTER,
    )
    expect(result).toEqual({ stores: [], invalidCount: 0, truncated: true })
  })

  it('範囲をまたぐ100件超の一致は距離順に100件まで表示する', () => {
    const farther = Array.from({ length: 100 }, (_, i) =>
      document(`farther-${i}`, INITIAL_CENTER.lat + 0.01),
    )
    const result = collectNearbyStores(
      [farther, [document('closest', INITIAL_CENTER.lat)]],
      INITIAL_CENTER,
    )
    expect(result.stores).toHaveLength(100)
    expect(result.stores[0].id).toBe('closest')
    expect(result.truncated).toBe(true)
  })
})
