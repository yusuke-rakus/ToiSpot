import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { geohashForLocation } from 'geofire-common'
import { getFirebaseServices } from '@/lib/firebase'
import { errorCode } from '../auth/auth-repository'
import {
  storeDocumentSchema,
  storeInputSchema,
  type StoreInput,
} from '../stores/store-schema'
import { StoreConflictError } from '../stores/store-writer'
import {
  STORE_REQUEST_PAGE_SIZE,
  storeRequestDocumentSchema,
  storeRequestTargetSchema,
  type StoreRequestTarget,
} from './store-request-schema'

export { StoreConflictError as StoreRequestConflictError }

function configuredDb() {
  return getFirebaseServices().db
}

function storeReference(db: Firestore, storeId: string) {
  if (!storeId || storeId.includes('/'))
    throw new Error('店舗IDが正しくありません。')
  return doc(db, 'stores', storeId)
}

function requestReference(db: Firestore, requestId: string) {
  if (!requestId || requestId.includes('/'))
    throw new Error('申請IDが正しくありません。')
  return doc(db, 'storeRequests', requestId)
}

function assertRequestTarget(
  target: Pick<
    StoreRequestTarget,
    'kind' | 'targetStoreId' | 'googlePlaceId' | 'baseUpdatedAt'
  >,
  input: StoreInput,
  existing: DocumentSnapshot,
  link: DocumentSnapshot,
) {
  if (target.kind === 'create') {
    if (existing.exists() || link.exists())
      throw new StoreConflictError(
        'この店舗は既に登録されています。最新の登録情報を確認してください。',
      )
    return
  }
  const current = existing.data()
  if (
    !existing.exists() ||
    current?.googlePlaceId !== target.googlePlaceId ||
    !(current.updatedAt instanceof Timestamp) ||
    !target.baseUpdatedAt?.isEqual(current.updatedAt) ||
    link.data()?.storeId !== target.targetStoreId ||
    current.location?.lat !== input.location.lat ||
    current.location?.lng !== input.location.lng
  )
    throw new StoreConflictError(
      '店舗情報が更新されています。最新の情報を確認して申請し直してください。',
    )
}

export function allocateStoreRequestId() {
  return doc(collection(configuredDb(), 'storeRequests')).id
}

export async function readStoreForRequestFromDb(
  db: Firestore,
  storeId: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const snapshot = await getDocFromServer(storeReference(db, storeId))
  signal?.throwIfAborted()
  if (!snapshot.exists())
    throw new StoreConflictError(
      '対象の店舗が見つかりません。再検索してください。',
    )
  const data = snapshot.data()
  if (!(data.updatedAt instanceof Timestamp))
    throw new Error('店舗の更新日時を確認できませんでした。')
  return {
    store: { ...storeDocumentSchema.parse(data), id: snapshot.id },
    baseUpdatedAt: data.updatedAt,
  }
}

export function readStoreForRequest(storeId: string, signal?: AbortSignal) {
  return readStoreForRequestFromDb(configuredDb(), storeId, signal)
}

export async function submitStoreRequestToDb(
  db: Firestore,
  target: StoreRequestTarget,
  input: StoreInput,
) {
  const parsedTarget = storeRequestTargetSchema.parse(target)
  const parsedInput = storeInputSchema.strict().parse(input)
  const { requestId, ...requestTarget } = parsedTarget
  const ref = storeReference(db, target.targetStoreId)
  const linkRef = doc(db, 'placeLinks', target.googlePlaceId)
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref)
    const link = await transaction.get(linkRef)
    assertRequestTarget(target, parsedInput, existing, link)
    transaction.set(requestReference(db, requestId), {
      ...requestTarget,
      input: parsedInput,
      status: 'pending',
      createdAt: serverTimestamp(),
      reviewedAt: null,
    })
  })
  return requestId
}

export function submitStoreRequest(
  target: StoreRequestTarget,
  input: StoreInput,
) {
  return submitStoreRequestToDb(configuredDb(), target, input)
}

function pendingQuery(db: Firestore) {
  return query(
    collection(db, 'storeRequests'),
    where('status', '==', 'pending'),
  )
}

export async function readPendingStoreRequestCount(
  db: Firestore,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const snapshot = await getCountFromServer(pendingQuery(db))
  signal?.throwIfAborted()
  return snapshot.data().count
}

export function fetchPendingStoreRequestCount(signal?: AbortSignal) {
  return readPendingStoreRequestCount(configuredDb(), signal)
}

export async function readPendingStoreRequests(
  db: Firestore,
  cursor?: QueryDocumentSnapshot,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const ordered = query(pendingQuery(db), orderBy('createdAt', 'asc'))
  const snapshot = await getDocsFromServer(
    cursor
      ? query(ordered, startAfter(cursor), limit(STORE_REQUEST_PAGE_SIZE + 1))
      : query(ordered, limit(STORE_REQUEST_PAGE_SIZE + 1)),
  )
  signal?.throwIfAborted()
  const documents = snapshot.docs.slice(0, STORE_REQUEST_PAGE_SIZE)
  return {
    requests: documents.map((document) => ({
      ...storeRequestDocumentSchema.parse(document.data()),
      id: document.id,
    })),
    nextCursor:
      snapshot.docs.length > STORE_REQUEST_PAGE_SIZE
        ? documents[documents.length - 1]
        : null,
  }
}

export function fetchPendingStoreRequests(
  cursor?: QueryDocumentSnapshot,
  signal?: AbortSignal,
) {
  return readPendingStoreRequests(configuredDb(), cursor, signal)
}

export async function approveStoreRequestInDb(
  db: Firestore,
  requestId: string,
) {
  const requestRef = requestReference(db, requestId)
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(requestRef)
      if (!snapshot.exists())
        throw new StoreConflictError(
          '申請が見つかりません。一覧を更新してください。',
        )
      const request = storeRequestDocumentSchema.parse(snapshot.data())
      if (request.status === 'approved') return
      if (request.status !== 'pending')
        throw new StoreConflictError('この申請は既に却下されています。')
      const ref = storeReference(db, request.targetStoreId)
      const linkRef = doc(db, 'placeLinks', request.googlePlaceId)
      const existing = await transaction.get(ref)
      const link = await transaction.get(linkRef)
      assertRequestTarget(request, request.input, existing, link)
      const payload = {
        ...request.input,
        googlePlaceId: request.googlePlaceId,
        geohash: geohashForLocation([
          request.input.location.lat,
          request.input.location.lng,
        ]),
        updatedAt: serverTimestamp(),
      }
      if (request.kind === 'create') {
        transaction.set(ref, {
          ...payload,
          isSample: false,
          createdAt: serverTimestamp(),
        })
        transaction.set(linkRef, { storeId: request.targetStoreId })
      } else {
        transaction.update(
          ref,
          Object.hasOwn(existing.data()!, 'chainName')
            ? { ...payload, chainName: deleteField() }
            : payload,
        )
      }
      transaction.update(requestRef, {
        status: 'approved',
        reviewedAt: serverTimestamp(),
      })
    })
  } catch (error) {
    if (errorCode(error) !== 'permission-denied') throw error
    // 同時処理ではRulesが再試行より先に新しい状態を検出する場合がある。
    // 管理者として再取得できるときだけ競合を判定し、権限失効と区別する。
    let current: DocumentSnapshot
    try {
      current = await getDocFromServer(requestRef)
    } catch {
      throw error
    }
    if (!current.exists())
      throw new StoreConflictError(
        '申請が見つかりません。一覧を更新してください。',
      )
    const request = storeRequestDocumentSchema.parse(current.data())
    if (request.status === 'approved') return
    if (request.status === 'rejected')
      throw new StoreConflictError('この申請は既に却下されています。')
    let snapshots: [DocumentSnapshot, DocumentSnapshot]
    try {
      snapshots = await Promise.all([
        getDocFromServer(storeReference(db, request.targetStoreId)),
        getDocFromServer(doc(db, 'placeLinks', request.googlePlaceId)),
      ])
    } catch {
      throw error
    }
    assertRequestTarget(request, request.input, ...snapshots)
    throw error
  }
}

export function approveStoreRequest(requestId: string) {
  return approveStoreRequestInDb(configuredDb(), requestId)
}

export async function rejectStoreRequestInDb(db: Firestore, requestId: string) {
  const ref = requestReference(db, requestId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists())
      throw new StoreConflictError(
        '申請が見つかりません。一覧を更新してください。',
      )
    const request = storeRequestDocumentSchema.parse(snapshot.data())
    if (request.status === 'rejected') return
    if (request.status !== 'pending')
      throw new StoreConflictError('この申請は既に承認されています。')
    transaction.update(ref, {
      status: 'rejected',
      reviewedAt: serverTimestamp(),
    })
  })
}

export function rejectStoreRequest(requestId: string) {
  return rejectStoreRequestInDb(configuredDb(), requestId)
}
