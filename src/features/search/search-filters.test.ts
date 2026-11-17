import { describe, expect, it } from 'vitest'
import { createTestStores } from '../../../tests/fixtures/stores'
import type { MapEntry } from '../places/map-entries'
import {
  activeFilterCount,
  classifyChain,
  EMPTY_SEARCH_FILTERS,
  filterMapEntries,
  type SearchFilters,
} from './search-filters'

const stores = createTestStores('2026-11-03T00:00:00.000Z').map(
  ({ id, data }) => ({ ...data, id }),
)
const entries: MapEntry[] = stores.map((store) => ({
  key: store.id,
  name: store.name,
  location: store.location,
  registration: 'registered',
  store,
}))
for (const registration of ['missing', 'checking', 'unavailable'] as const) {
  entries.push({
    key: registration,
    name: 'ローソン 未登録店',
    location: stores[0].location,
    registration,
  })
}

function matching(filters: Partial<SearchFilters>) {
  return filterMapEntries(entries, { ...EMPTY_SEARCH_FILTERS, ...filters }).map(
    (entry) => entry.key,
  )
}

describe('店舗の検索条件', () => {
  it('条件なしでは未登録・確認中・照会失敗を含め、元の距離順を保つ', () => {
    expect(filterMapEntries(entries, EMPTY_SEARCH_FILTERS)).toEqual(entries)
    expect(activeFilterCount(EMPTY_SEARCH_FILTERS)).toBe(0)
  })

  it('利用可のみでは確認済みの利用可だけに絞り、設備不明でも利用可なら表示する', () => {
    expect(matching({ availableOnly: true })).toEqual([
      stores[0].id,
      stores[1].id,
      stores[4].id,
      stores[5].id,
    ])
  })

  it('設備の0と不明を除外し、正数のある設備のいずれかで一致する', () => {
    expect(matching({ equipment: ['female'] })).toEqual([
      stores[1].id,
      stores[5].id,
    ])
    expect(matching({ equipment: ['shared', 'female'] })).toEqual([
      stores[0].id,
      stores[1].id,
      stores[5].id,
    ])
    expect(matching({ equipment: ['male', 'urinal'] })).toEqual([
      stores[1].id,
      stores[5].id,
    ])
    expect(matching({ equipment: ['urinal'] })).toEqual([stores[1].id])
  })

  it('チェーンはOR、設備・利用可との間はANDで組み合わせる', () => {
    const named = entries.slice(0, 3).map((entry, index) => ({
      ...entry,
      name: [
        'セブン-イレブン 東京店',
        'ローソン 東京店',
        'ファミリーマート 東京店',
      ][index],
    }))
    const filters: SearchFilters = {
      availableOnly: true,
      equipment: ['shared'],
      chains: ['seven-eleven', 'lawson'],
    }
    expect(filterMapEntries(named, filters).map((entry) => entry.key)).toEqual([
      stores[0].id,
    ])
    expect(activeFilterCount(filters)).toBe(4)
    expect(
      filterMapEntries(named, {
        ...EMPTY_SEARCH_FILTERS,
        chains: ['lawson', 'familymart'],
      }),
    ).toEqual(named.slice(1))
  })

  it('未登録店舗にもチェーン指定を適用し、設備指定時には除外する', () => {
    expect(matching({ chains: ['lawson'] })).toEqual([
      'missing',
      'checking',
      'unavailable',
    ])
    expect(matching({ chains: ['lawson'], equipment: ['shared'] })).toEqual([])
  })

  it.each([
    [' セブン－イレブン 東京店', 'seven-eleven'],
    ['７－ＥＬＥＶＥＮ 東京店', 'seven-eleven'],
    ['Seven Eleven Tokyo', 'seven-eleven'],
    ['ローソン 東京店', 'lawson'],
    ['LAWSON Tokyo', 'lawson'],
    ['ファミリーマート 東京店', 'familymart'],
    ['Family Mart Tokyo', 'familymart'],
    ['別のコンビニ', 'other'],
    ['東京店 ローソン跡地', 'other'],
  ])('ピンと共通のチェーン判定: %s', (name, expected) => {
    expect(classifyChain(name)).toBe(expected)
  })
})
