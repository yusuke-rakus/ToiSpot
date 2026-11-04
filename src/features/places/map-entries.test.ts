import { describe, expect, it } from 'vitest'
import { INITIAL_CENTER } from '../map/map-config'
import { createTestStores } from '../../../tests/fixtures/stores'
import { mergeMapEntries } from './map-entries'
import type { ConveniencePlace } from './nearby-places'

const place: ConveniencePlace = {
  id: 'ChIJ_test',
  name: 'コンビニ',
  address: '住所',
  location: INITIAL_CENTER,
  attributions: [],
}
const store = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  id: 'registered',
  googlePlaceId: place.id,
  isSample: false,
}
describe('登録情報との統合', () => {
  it('一覧内と紐付け照会の店舗を重複なく統合し、登録済みを優先する', () => {
    const entries = mergeMapEntries(
      [store],
      [place],
      { [place.id]: store },
      'ready',
      INITIAL_CENTER,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].registration).toBe('registered')
    expect(entries[0].place).toEqual(place)
    expect(
      mergeMapEntries(
        [],
        [place],
        { [place.id]: store },
        'ready',
        INITIAL_CENTER,
      )[0].store,
    ).toEqual(store)
  })
  it('登録がないと確認できた場合にだけデータなしにする', () => {
    expect(
      mergeMapEntries(
        [],
        [place],
        { [place.id]: null },
        'ready',
        INITIAL_CENTER,
      )[0].registration,
    ).toBe('missing')
    expect(
      mergeMapEntries([], [place], {}, 'ready', INITIAL_CENTER)[0].registration,
    ).toBe('checking')
    expect(
      mergeMapEntries(
        [],
        [place],
        { [place.id]: null },
        'checking',
        INITIAL_CENTER,
      )[0].registration,
    ).toBe('checking')
    expect(
      mergeMapEntries([], [place], undefined, 'unavailable', INITIAL_CENTER)[0]
        .registration,
    ).toBe('unavailable')
  })
  it('Googleに含まれない登録済み店舗も残して距離順にする', () => {
    const entries = mergeMapEntries(
      [{ ...store, googlePlaceId: 'ChIJ_other' }],
      [place],
      { [place.id]: null },
      'ready',
      INITIAL_CENTER,
    )
    expect(entries).toHaveLength(2)
    expect(entries[0].place?.id).toBe(place.id)
    expect(entries[1].store?.id).toBe(store.id)
  })
})
