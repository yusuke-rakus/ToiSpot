import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { createTestStores } from '../../../tests/fixtures/stores'
import {
  formatEquipmentCount,
  parseStoreDocuments,
  storeDocumentSchema,
  storeInputSchema,
} from './store-schema'
import { getSeedTarget } from '../../../scripts/lib/seed-target'

const samples = createTestStores('2026-11-03T00:00:00.000Z')
const data = samples[0].data

describe('店舗データの検証', () => {
  it('テスト用店舗6件で全状態と設備の構成を確認できる', () => {
    expect(new Set(samples.map((s) => s.id)).size).toBe(6)
    expect(new Set(samples.map((s) => s.data.availability)).size).toBe(2)
    expect(samples.every((s) => s.data.googlePlaceId && !s.data.isSample)).toBe(
      true,
    )
    expect(formatEquipmentCount(0)).toBe('0基')
    expect(formatEquipmentCount(null)).toBe('不明')
  })

  it('Place IDのない店舗と架空サンプルを拒否する', () => {
    const legacy = { ...data, googlePlaceId: undefined }
    expect(storeDocumentSchema.safeParse(legacy).success).toBe(false)
    expect(
      storeDocumentSchema.safeParse({ ...data, googlePlaceId: '' }).success,
    ).toBe(false)
    expect(
      storeDocumentSchema.safeParse({ ...data, isSample: true }).success,
    ).toBe(false)
  })

  it('Timestampを正規化し、負数・小数・不正な日付を拒否する', () => {
    const normalized = storeDocumentSchema.parse({
      ...data,
      createdAt: Timestamp.fromDate(new Date(data.createdAt)),
    })
    expect(normalized.createdAt).toBe(data.createdAt)
    for (const urinals of [-1, 0.5, '0']) {
      expect(storeDocumentSchema.safeParse({ ...data, urinals }).success).toBe(
        false,
      )
    }
    expect(
      storeDocumentSchema.safeParse({ ...data, updatedAt: 'yesterday' })
        .success,
    ).toBe(false)
  })

  it('廃止した状態・項目と利用不可の設備数を拒否する', () => {
    for (const availability of [
      'conditional',
      'temporarily_unavailable',
      'unknown',
    ])
      expect(
        storeDocumentSchema.safeParse({ ...data, availability }).success,
      ).toBe(false)
    for (const removed of [
      { genderLayout: 'shared' },
      { lastConfirmedAt: null },
      { conditions: '' },
    ])
      expect(
        storeDocumentSchema.safeParse({ ...data, ...removed }).success,
      ).toBe(false)

    const unavailable = {
      ...data,
      availability: 'unavailable',
      stalls: { male: null, female: null, shared: null },
      urinals: null,
    }
    expect(storeDocumentSchema.safeParse(unavailable).success).toBe(true)
    for (const change of [
      { stalls: { ...unavailable.stalls, male: 0 } },
      { stalls: { ...unavailable.stalls, female: 1 } },
      { stalls: { ...unavailable.stalls, shared: 2 } },
      { urinals: 0 },
      { urinals: 1 },
    ]) {
      expect(
        storeDocumentSchema.safeParse({ ...unavailable, ...change }).success,
      ).toBe(false)
      expect(
        storeInputSchema.safeParse({ ...unavailable, ...change }).success,
      ).toBe(false)
    }
  })

  it('空データと不正データを区別し、101件目で上限を判定する', () => {
    expect(parseStoreDocuments([])).toEqual({
      stores: [],
      invalidCount: 0,
      truncated: false,
    })
    const docs = Array.from({ length: 101 }, (_, index) => ({
      id: String(index),
      data: index === 0 ? {} : data,
    }))
    const result = parseStoreDocuments(docs)
    expect(result.stores).toHaveLength(99)
    expect(result.invalidCount).toBe(1)
    expect(result.truncated).toBe(true)
  })
})

describe('シードの接続先制限', () => {
  it('ローカルの固定Emulatorにだけ接続する', () => {
    expect(getSeedTarget({})).toEqual({
      projectId: 'demo-toilet-map',
      host: '127.0.0.1:18081',
      authHost: '127.0.0.1:19090',
    })
    expect(
      getSeedTarget({ FIRESTORE_EMULATOR_HOST: 'localhost:18081' }).host,
    ).toBe('localhost:18081')
    for (const host of [
      'example.com:18081',
      '127.0.0.1:8080',
      'http://localhost:18081',
    ]) {
      expect(() => getSeedTarget({ FIRESTORE_EMULATOR_HOST: host })).toThrow()
    }
    for (const key of [
      'GCLOUD_PROJECT',
      'GOOGLE_CLOUD_PROJECT',
      'FIREBASE_PROJECT_ID',
    ]) {
      expect(() => getSeedTarget({ [key]: 'production-project' })).toThrow()
    }
  })
})
