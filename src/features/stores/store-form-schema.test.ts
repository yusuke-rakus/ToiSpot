import { describe, expect, it } from 'vitest'
import { createTestStores } from '../../../tests/fixtures/stores'
import {
  convenienceStoreTypes,
  storeFormDefaults,
  storeFormSchema,
} from './store-form-schema'

const store = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  id: 'sample-tokyo-01',
}
const valid = storeFormDefaults(store)

describe('登録・編集フォームの変換', () => {
  it('空欄の設備は不明、0は設備なしとして扱う', () => {
    const result = storeFormSchema.parse({ ...valid, male: '', female: '0' })
    expect(result.stalls.male).toBeNull()
    expect(result.stalls.female).toBe(0)
    expect(result).not.toHaveProperty('location')
    expect(result).not.toHaveProperty('genderLayout')
    expect(result).not.toHaveProperty('lastConfirmedAt')
    expect(result).not.toHaveProperty('conditions')
    for (const male of ['-1', '0.5', 'invalid'])
      expect(storeFormSchema.safeParse({ ...valid, male }).success).toBe(false)
  })
  it('利用不可では非表示の設備入力を検証せず、すべてnullにする', () => {
    const result = storeFormSchema.parse({
      ...valid,
      availability: 'unavailable',
      male: '-1',
      female: '0.5',
      shared: 'invalid',
      urinals: '3',
    })
    expect(result.stalls).toEqual({ male: null, female: null, shared: null })
    expect(result.urinals).toBeNull()
  })
  it('コンビニの種類と2択の貸出状況を保存する', () => {
    for (const chainName of convenienceStoreTypes) {
      for (const availability of ['available', 'unavailable']) {
        const result = storeFormSchema.parse({
          ...valid,
          chainName,
          availability,
        })
        expect(result).toMatchObject({
          chainName,
          availability,
        })
      }
    }
    for (const availability of [
      '',
      'conditional',
      'temporarily_unavailable',
      'unknown',
    ])
      expect(
        storeFormSchema.safeParse({ ...valid, availability }).success,
      ).toBe(false)
    for (const chainName of ['', '未定義のコンビニ'])
      expect(storeFormSchema.safeParse({ ...valid, chainName }).success).toBe(
        false,
      )
  })
  it('編集時に種類と貸出状況を復元する', () => {
    expect(
      storeFormDefaults({
        ...store,
        chainName: 'ローソン',
        availability: 'unavailable',
      }),
    ).toMatchObject({ chainName: 'ローソン', availability: 'unavailable' })
    expect(
      storeFormDefaults({ ...store, chainName: 'テストチェーン' }),
    ).toMatchObject({ chainName: 'その他', availability: 'available' })
    expect(storeFormDefaults()).toMatchObject({
      chainName: '',
      availability: '',
    })
  })
  it('新規フォームは未選択で開始し、Placesの店舗情報を初期入力する', () => {
    expect(
      storeFormDefaults(undefined, {
        id: 'ChIJ_new',
        name: '店舗',
        address: '住所',
        location: { lat: 35.68, lng: 139.76 },
        attributions: [],
      }),
    ).toMatchObject({ name: '店舗', address: '住所' })
    expect(storeFormDefaults()).not.toHaveProperty('lat')
    expect(storeFormDefaults()).not.toHaveProperty('lng')
    expect(storeFormDefaults()).toMatchObject({
      availability: '',
      male: '',
      female: '',
      shared: '',
      urinals: '',
    })
  })
})
