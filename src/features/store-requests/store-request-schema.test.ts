import { Timestamp } from 'firebase/firestore'
import { expect, it } from 'vitest'
import { createTestStores } from '../../../tests/fixtures/stores'
import { storeInputSchema } from '../stores/store-schema'
import {
  storeRequestDocumentSchema,
  storeRequestTargetSchema,
} from './store-request-schema'

const input = storeInputSchema.parse(
  createTestStores('2026-11-03T00:00:00.000Z')[0].data,
)
const timestamp = new Timestamp(1_800_000_000, 123_456_789)
const pending = {
  kind: 'update',
  targetStoreId: 'existing',
  googlePlaceId: 'ChIJ_request',
  input,
  baseUpdatedAt: timestamp,
  status: 'pending',
  createdAt: timestamp,
  reviewedAt: null,
}

it('表示日時を正規化し、編集元のTimestampはナノ秒を保つ', () => {
  const request = storeRequestDocumentSchema.parse(pending)
  expect(request.createdAt).toBe(timestamp.toDate().toISOString())
  expect(request.baseUpdatedAt?.nanoseconds).toBe(123_456_789)
  expect(request.baseUpdatedAt?.isEqual(timestamp)).toBe(true)
})

it('新規申請は申請IDと店舗IDを一致させ、編集には基準日時を必須にする', () => {
  const target = {
    requestId: 'new',
    targetStoreId: 'new',
    googlePlaceId: 'ChIJ_new',
    kind: 'create',
    baseUpdatedAt: null,
  }
  expect(storeRequestTargetSchema.safeParse(target).success).toBe(true)
  for (const change of [
    { targetStoreId: 'other' },
    { baseUpdatedAt: timestamp },
    { kind: 'update' },
    { requestId: 'invalid/id' },
  ])
    expect(
      storeRequestTargetSchema.safeParse({ ...target, ...change }).success,
    ).toBe(false)
})

it('審査済み状態と審査日時の不整合や申請内容への管理フィールド混入を拒否する', () => {
  for (const change of [
    { status: 'approved' },
    { reviewedAt: timestamp },
    { baseUpdatedAt: null },
    { input: { ...input, updatedAt: timestamp } },
    { reviewerUid: 'unexpected' },
  ])
    expect(
      storeRequestDocumentSchema.safeParse({ ...pending, ...change }).success,
    ).toBe(false)
  expect(
    storeRequestDocumentSchema.safeParse({
      ...pending,
      status: 'approved',
      reviewedAt: timestamp,
    }).success,
  ).toBe(true)
})
