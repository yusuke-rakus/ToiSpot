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
    expect(result.lastConfirmedAt).toBeNull()
    expect(result).not.toHaveProperty('location')
    for (const male of ['-1', '0.5', 'invalid'])
      expect(storeFormSchema.safeParse({ ...valid, male }).success).toBe(false)
  })
  it('確認済みの日付を必須とし、日本時間で保存する', () => {
    expect(
      storeFormSchema.safeParse({
        ...valid,
        confirmedUnknown: false,
        confirmedDate: '',
      }).success,
    ).toBe(false)
    expect(
      storeFormSchema.safeParse({
        ...valid,
        confirmedUnknown: false,
        confirmedDate: '2026-02-30',
      }).success,
    ).toBe(false)
    const result = storeFormSchema.parse({
      ...valid,
      confirmedUnknown: false,
      confirmedDate: '2026-11-03',
    })
    expect(result.lastConfirmedAt).toBe('2026-11-02T15:00:00.000Z')
  })
  it('コンビニの種類と2択の貸出状況を保存し、旧入力の利用条件は含めない', () => {
    for (const chainName of convenienceStoreTypes) {
      for (const availability of ['available', 'unavailable']) {
        const result = storeFormSchema.parse({
          ...valid,
          chainName,
          availability,
          conditions: '旧入力',
        })
        expect(result).toMatchObject({
          chainName,
          availability,
          conditions: '',
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
  it('編集時に種類と貸出状況を復元し、旧状態は再選択する', () => {
    expect(
      storeFormDefaults({
        ...store,
        chainName: 'ローソン',
        availability: 'unavailable',
      }),
    ).toMatchObject({ chainName: 'ローソン', availability: 'unavailable' })
    expect(
      storeFormDefaults({ ...store, availability: 'conditional' }),
    ).toMatchObject({ chainName: 'その他', availability: '' })
    expect(storeFormDefaults()).toMatchObject({
      chainName: '',
      availability: '',
    })
  })
  it('新規フォームは未確認で開始し、Placesの店舗情報を初期入力する', () => {
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
    expect(storeFormDefaults().confirmedUnknown).toBe(true)
  })
})
