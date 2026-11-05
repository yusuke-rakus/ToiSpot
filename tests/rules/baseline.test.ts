import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  disableNetwork,
  getFirestore as getClientFirestore,
  connectFirestoreEmulator,
  terminate,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore'
import {
  initializeApp as initializeClientApp,
  deleteApp as deleteClientApp,
} from 'firebase/app'
import { initializeApp, deleteApp, type App } from 'firebase-admin/app'
import {
  getFirestore,
  Timestamp as AdminTimestamp,
  type Firestore,
} from 'firebase-admin/firestore'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  readNearbyStores,
  readStores,
} from '../../src/features/stores/store-repository'
import { readPlaceLinks } from '../../src/features/places/place-links'
import { INITIAL_CENTER } from '../../src/features/map/map-config'
import { geohashForLocation } from 'geofire-common'
import { cleanupLegacyStores } from '../../scripts/lib/cleanup-stores'
import { createTestStores } from '../fixtures/stores'
import { seedAdminSettings } from '../../scripts/lib/seed-admin'
import { seedStoreDocuments, seedStores } from '../../scripts/lib/seed-stores'
import {
  saveStore,
  StoreConflictError,
} from '../../src/features/stores/store-writer'
import {
  storeInputSchema,
  storeDocumentSchema,
} from '../../src/features/stores/store-schema'
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
} from 'firebase/auth'
import { checkAdminAccess } from '../../src/features/auth/auth-repository'

// clearFirestoreはこの専用IDのみ。開発用demo-toilet-mapのデータに触れない。
const projectId = 'demo-toilet-map-tests'
let environment: RulesTestEnvironment
let adminApp: App
let admin: Firestore
let clientApp: ReturnType<typeof initializeClientApp>
let client: ReturnType<typeof getClientFirestore>

beforeAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  if (!host || !['127.0.0.1:18081', 'localhost:18081'].includes(host))
    throw new Error('Local test emulator required')
  process.env.METADATA_SERVER_DETECTION = 'none'
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
  adminApp = initializeApp({ projectId }, 'store-test-admin')
  admin = getFirestore(adminApp)
})
beforeEach(async () => {
  await environment.clearFirestore()
  clientApp = initializeClientApp(
    { projectId, apiKey: 'demo-api-key' },
    'store-test-client',
  )
  client = getClientFirestore(clientApp)
  connectFirestoreEmulator(client, '127.0.0.1', 18081)
  connectAuthEmulator(getAuth(clientApp), 'http://127.0.0.1:19090', {
    disableWarnings: true,
  })
})
afterEach(async () => {
  if (client) await terminate(client)
  if (clientApp) await deleteClientApp(clientApp)
})
afterAll(async () => {
  await environment?.cleanup()
  if (admin) await admin.terminate()
  if (adminApp) await deleteApp(adminApp)
})

async function seedTestStores(db: Firestore) {
  const batch = db.batch()
  for (const { id, data } of createTestStores('2026-11-03T00:00:00.000Z')) {
    batch.set(db.doc(`stores/${id}`), {
      ...data,
      createdAt: AdminTimestamp.fromDate(new Date(data.createdAt)),
      updatedAt: AdminTimestamp.fromDate(new Date(data.updatedAt)),
    })
    batch.set(db.doc(`placeLinks/${data.googlePlaceId}`), { storeId: id })
  }
  await batch.commit()
}

async function createLinkedStore(
  db: ReturnType<typeof getClientFirestore>,
  id: string,
  payload = newPayload(),
) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'stores', id), payload)
  batch.set(doc(db, 'placeLinks', payload.googlePlaceId), { storeId: id })
  return batch.commit()
}

describe('現在のテスト店舗のシード', () => {
  it('空のDBへ店舗7件と紐付けを作成し、再実行では変更しない', async () => {
    expect(await seedStores(admin)).toEqual({
      created: 7,
      skipped: 0,
      linksCreated: 7,
      conflicts: 0,
    })
    for (const { id, data } of seedStoreDocuments) {
      const document = await admin.doc(`stores/${id}`).get()
      expect(document.data()?.createdAt).toBeInstanceOf(AdminTimestamp)
      expect(document.data()?.updatedAt).toBeInstanceOf(AdminTimestamp)
      expect(storeDocumentSchema.parse(document.data())).toEqual(data)
      expect(
        (await admin.doc(`placeLinks/${data.googlePlaceId}`).get()).data(),
      ).toEqual({ storeId: id })
    }
    const before = await admin.collection('stores').get()
    expect(await seedStores(admin)).toEqual({
      created: 0,
      skipped: 7,
      linksCreated: 0,
      conflicts: 0,
    })
    const after = await admin.collection('stores').get()
    expect(after.docs.map((doc) => doc.updateTime)).toEqual(
      before.docs.map((doc) => doc.updateTime),
    )
    expect((await readStores(unauthenticatedDb())).stores).toHaveLength(7)
  })

  it('編集済み店舗と他の店舗を保持し、不足した店舗・紐付けだけを補う', async () => {
    await seedStores(admin)
    const [{ id, data }, missing] = seedStoreDocuments
    await admin.doc(`stores/${id}`).update({ notes: '手動編集済み' })
    const edited = (await admin.doc(`stores/${id}`).get()).data()
    await admin.doc(`placeLinks/${data.googlePlaceId}`).delete()
    await admin.doc(`stores/${missing.id}`).delete()
    await admin.doc('stores/manual').set({ name: '別の店舗' })
    await seedAdminSettings(admin, 'admin@example.test')
    expect(await seedStores(admin)).toEqual({
      created: 1,
      skipped: 6,
      linksCreated: 1,
      conflicts: 0,
    })
    expect((await admin.doc(`stores/${id}`).get()).data()).toEqual(edited)
    expect(
      (await admin.doc(`placeLinks/${data.googlePlaceId}`).get()).data(),
    ).toEqual({ storeId: id })
    expect((await admin.doc('stores/manual').get()).data()).toEqual({
      name: '別の店舗',
    })
    expect((await admin.doc('_settings/admin').get()).data()).toEqual({
      email: 'admin@example.test',
    })
  })

  it('別店舗への紐付けや同じIDの別店舗がある場合は競合として保持する', async () => {
    const [linked, collision] = seedStoreDocuments
    await admin.doc(`placeLinks/${linked.data.googlePlaceId}`).set({
      storeId: 'manually-registered',
    })
    await admin.doc(`stores/${collision.id}`).set({
      googlePlaceId: 'ChIJ_other',
      notes: '既存の別店舗',
    })
    expect(await seedStores(admin)).toEqual({
      created: 5,
      skipped: 0,
      linksCreated: 5,
      conflicts: 2,
    })
    expect((await admin.doc(`stores/${linked.id}`).get()).exists).toBe(false)
    expect(
      (await admin.doc(`placeLinks/${linked.data.googlePlaceId}`).get()).data(),
    ).toEqual({ storeId: 'manually-registered' })
    expect((await admin.doc(`stores/${collision.id}`).get()).data()).toEqual({
      googlePlaceId: 'ChIJ_other',
      notes: '既存の別店舗',
    })
    expect(
      (await admin.doc(`placeLinks/${collision.data.googlePlaceId}`).get())
        .exists,
    ).toBe(false)
  })
})

describe('公開読み取り専用Rules', () => {
  it('未ログインでも店舗を取得・一覧できる', async () => {
    await seedTestStores(admin)
    const db = environment.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(db, 'stores', 'sample-tokyo-01')))
    const snapshot = await assertSucceeds(getDocs(collection(db, 'stores')))
    expect(snapshot.size).toBe(6)
  })

  it.each([false, true])(
    '認証の有無=%sでも作成・更新・削除と他コレクションのアクセスを拒否する',
    async (authenticated) => {
      await seedTestStores(admin)
      const db = (
        authenticated
          ? environment.authenticatedContext('user')
          : environment.unauthenticatedContext()
      ).firestore()
      await assertFails(setDoc(doc(db, 'stores', 'new'), { name: 'new' }))
      await assertFails(
        updateDoc(doc(db, 'stores', 'sample-tokyo-01'), { name: 'edited' }),
      )
      await assertFails(deleteDoc(doc(db, 'stores', 'sample-tokyo-01')))
      await assertFails(getDoc(doc(db, 'private', 'settings')))
      await assertFails(
        setDoc(doc(db, 'private', 'settings'), { enabled: true }),
      )
    },
  )
})

describe('Emulator上の取得と投入', () => {
  it('geohash検索で現在地周辺を取得し、遠方を除いて距離順にする', async () => {
    await seedTestStores(admin)
    const sample = createTestStores('2026-11-03T00:00:00.000Z')[0].data
    await admin.doc('stores/closest').set({
      ...sample,
      location: INITIAL_CENTER,
      geohash: geohashForLocation([INITIAL_CENTER.lat, INITIAL_CENTER.lng]),
    })
    const osaka = { lat: 34.7, lng: 135.5 }
    await admin.doc('stores/osaka').set({
      ...sample,
      location: osaka,
      geohash: geohashForLocation([osaka.lat, osaka.lng]),
    })
    const tokyoResult = await readNearbyStores(
      unauthenticatedDb(),
      INITIAL_CENTER,
    )
    expect(tokyoResult.stores).toHaveLength(7)
    expect(tokyoResult.stores[0].id).toBe('closest')
    expect(tokyoResult.truncated).toBe(false)
    const osakaResult = await readNearbyStores(unauthenticatedDb(), osaka)
    expect(osakaResult.stores.map(({ id }) => id)).toEqual(['osaka'])
  })

  it('座標のみの店舗とサンプルだけを整理し、Places店舗と管理者設定を保持する', async () => {
    await seedTestStores(admin)
    await seedAdminSettings(admin, 'admin@example.test')
    const data = createTestStores('2026-11-03T00:00:00.000Z')[0].data
    const { googlePlaceId, ...legacy } = data
    await admin.doc('stores/legacy').set(legacy)
    await admin.doc('stores/legacy-sample').set({ ...data, isSample: true })
    await admin.doc('placeLinks/ChIJ_sample').set({ storeId: 'legacy-sample' })
    await admin.doc('stores/malformed').set({ ...data, googlePlaceId: '' })
    const before = (await admin.doc('stores/sample-tokyo-01').get()).data()
    expect(await cleanupLegacyStores(admin)).toEqual({ stores: 3, links: 1 })
    expect((await admin.doc('stores/legacy').get()).exists).toBe(true)
    expect(await cleanupLegacyStores(admin, true)).toEqual({
      stores: 3,
      links: 1,
    })
    expect(await cleanupLegacyStores(admin, true)).toEqual({
      stores: 0,
      links: 0,
    })
    expect((await admin.doc('stores/sample-tokyo-01').get()).data()).toEqual(
      before,
    )
    expect((await admin.doc(`placeLinks/${googlePlaceId}`).get()).exists).toBe(
      true,
    )
    expect((await admin.doc('placeLinks/ChIJ_sample').get()).exists).toBe(false)
    expect((await admin.doc('_settings/admin').get()).data()).toEqual({
      email: 'admin@example.test',
    })
    expect((await readStores(unauthenticatedDb())).stores).toHaveLength(6)
  })

  it('空の取得と、不正なレコードの除外・101件取得による省略を扱う', async () => {
    const db = unauthenticatedDb()
    expect(await readStores(db)).toEqual({
      stores: [],
      invalidCount: 0,
      truncated: false,
    })
    const data = createTestStores('2026-11-03T00:00:00.000Z')[0].data
    const batch = admin.batch()
    for (let i = 0; i < 102; i++)
      batch.create(
        admin.doc(`stores/test-${String(i).padStart(3, '0')}`),
        i === 0 ? {} : data,
      )
    await batch.commit()
    const result = await readStores(db)
    expect(result.stores).toHaveLength(99)
    expect(result.invalidCount).toBe(1)
    expect(result.truncated).toBe(true)
  })

  it('接続を失った場合に空結果へ置き換えずエラーを返す', async () => {
    const db = unauthenticatedDb()
    await disableNetwork(db)
    await expect(readStores(db)).rejects.toBeDefined()
  })
})

// データアクセス層はブラウザと同じModular SDKでローカルへ明示接続する。
function unauthenticatedDb() {
  return client
}

function manager(
  email = 'admin@example.test',
  provider: 'google.com' | 'password' = 'google.com',
  verified = true,
) {
  return (
    environment
      .authenticatedContext('manager', {
        email,
        email_verified: verified,
        firebase: { sign_in_provider: provider },
      })
      // Rules TestingのCompatインスタンスはModular SDK側で正規化される。
      .firestore() as unknown as ReturnType<typeof getClientFirestore>
  )
}
function newPayload() {
  const data = createTestStores('2026-11-03T00:00:00.000Z')[0].data
  return {
    ...data,
    googlePlaceId: 'ChIJ_new',
    isSample: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}
describe('管理者設定と書き込みRules', () => {
  beforeEach(async () => {
    await seedAdminSettings(admin, 'admin@example.test')
  })

  it('設定の新規作成・再実行・変更・未指定を扱う', async () => {
    expect(await seedAdminSettings(admin, 'admin@example.test')).toBe(
      'unchanged',
    )
    expect(await seedAdminSettings(admin, null)).toBe('skipped')
    expect((await admin.doc('_settings/admin').get()).data()).toEqual({
      email: 'admin@example.test',
    })
    expect(await seedAdminSettings(admin, 'other@example.test')).toBe('updated')
    await assertFails(getDoc(doc(manager(), '_settings/admin')))
    await assertSucceeds(
      getDoc(doc(manager('other@example.test'), '_settings/admin')),
    )
  })

  it('管理者だけが設定をgetでき、設定の列挙・改変・店舗削除は全員拒否する', async () => {
    const db = manager()
    await assertSucceeds(getDoc(doc(db, '_settings/admin')))
    await assertFails(getDocs(collection(db, '_settings')))
    await assertFails(
      setDoc(doc(db, '_settings/admin'), { email: 'attacker@example.test' }),
    )
    await assertFails(deleteDoc(doc(db, '_settings/admin')))
    await assertFails(getDoc(doc(client, '_settings/admin')))
    await assertFails(
      getDoc(doc(manager('other@example.test'), '_settings/admin')),
    )
    await seedTestStores(admin)
    await assertFails(deleteDoc(doc(db, 'stores/sample-tokyo-01')))
  })

  it.each([
    ['other@example.test', 'google.com', true],
    ['admin@example.test', 'password', true],
    ['admin@example.test', 'google.com', false],
  ] as const)(
    '許可メール・Google・確認済みの全条件が必要: %s/%s/%s',
    async (email, provider, verified) => {
      const db = manager(email, provider, verified)
      await assertFails(setDoc(doc(db, 'stores/new'), newPayload()))
      await assertFails(getDoc(doc(db, '_settings/admin')))
    },
  )

  it('管理者はPlaces店舗を作成・編集でき、作成日時を保持する', async () => {
    const db = manager('ADMIN@EXAMPLE.TEST')
    await assertSucceeds(createLinkedStore(db, 'new'))
    await assertSucceeds(
      updateDoc(doc(db, 'stores/new'), {
        name: '編集した店舗',
        updatedAt: serverTimestamp(),
      }),
    )
    await seedTestStores(admin)
    const before = (await admin.doc('stores/sample-tokyo-01').get()).data()!
    await assertSucceeds(
      updateDoc(doc(db, 'stores/sample-tokyo-01'), {
        notes: '編集済み',
        updatedAt: serverTimestamp(),
      }),
    )
    const after = (await admin.doc('stores/sample-tokyo-01').get()).data()!
    expect(after.createdAt).toEqual(before.createdAt)
    expect(after.isSample).toBe(false)
    await assertFails(
      updateDoc(doc(db, 'stores/sample-tokyo-01'), {
        isSample: true,
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(db, 'stores/new'), {
        createdAt: Timestamp.fromDate(new Date(0)),
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('SDKからの不正な型・値・フィールド・日時も拒否する', async () => {
    const db = manager()
    const changes = [
      { name: ' \n\t' },
      { chainName: '' },
      { address: '' },
      { location: { lat: 91, lng: 139 } },
      { location: { lat: 35, lng: '139' } },
      { location: { lat: 35, lng: 139, extra: true } },
      { availability: 'invalid' },
      { genderLayout: 'shared' },
      { conditions: '' },
      { lastConfirmedAt: null },
      { availability: 'conditional' },
      { availability: 'temporarily_unavailable' },
      { availability: 'unknown' },
      { availability: 'unavailable' },
      { stalls: { male: -1, female: 0, shared: 0 } },
      { urinals: 0.5 },
      { stalls: { male: 0, female: 0 } },
      { notes: 3 },
      { geohash: 'INVALID' },
      { isSample: true },
      { extra: true },
      { createdAt: Timestamp.fromDate(new Date(0)) },
      { updatedAt: Timestamp.fromDate(new Date(0)) },
    ]
    for (const change of changes)
      await assertFails(
        createLinkedStore(db, 'invalid', {
          ...newPayload(),
          ...change,
        } as ReturnType<typeof newPayload>),
      )
    await assertSucceeds(
      createLinkedStore(db, 'multiline', {
        ...newPayload(),
        notes: '商品購入後\n声をかけてください',
      }),
    )
  })

  it('利用不可は設備数がすべてnullの場合だけ作成・編集できる', async () => {
    const db = manager()
    const unavailable = {
      ...newPayload(),
      availability: 'unavailable' as const,
      stalls: { male: null, female: null, shared: null },
      urinals: null,
    }
    await assertSucceeds(createLinkedStore(db, 'unavailable', unavailable))
    const store = doc(db, 'stores/unavailable')
    for (const change of [
      { stalls: { ...unavailable.stalls, male: 0 } },
      { stalls: { ...unavailable.stalls, female: 1 } },
      { stalls: { ...unavailable.stalls, shared: 2 } },
      { urinals: 0 },
      { urinals: 1 },
    ])
      await assertFails(
        updateDoc(store, { ...change, updatedAt: serverTimestamp() }),
      )
    await assertSucceeds(
      updateDoc(store, {
        availability: 'available',
        stalls: { male: 1, female: 0, shared: null },
        urinals: 1,
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(store, {
        availability: 'unavailable',
        updatedAt: serverTimestamp(),
      }),
    )
    await assertSucceeds(
      updateDoc(store, {
        availability: 'unavailable',
        stalls: unavailable.stalls,
        urinals: null,
        updatedAt: serverTimestamp(),
      }),
    )
  })

  it('設定がなければ許可メールでも作成できない', async () => {
    await admin.doc('_settings/admin').delete()
    await assertFails(setDoc(doc(manager(), 'stores/new'), newPayload()))
  })
})

describe('Auth Emulatorと書き込み処理の結合', () => {
  it('模擬Googleログインで管理者判定・作成・編集・再試行・競合・ログアウトを検証する', async () => {
    await seedAdminSettings(admin, 'admin@example.test')
    const auth = getAuth(clientApp)
    // Auth Emulatorがサポートする署名なしのGoogleテストIDトークン。
    const token = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'test-google-admin', email: 'admin@example.test', email_verified: true, iss: 'https://accounts.google.com', aud: 'demo-client-id', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.`
    const { user } = await signInWithCredential(
      auth,
      GoogleAuthProvider.credential(token),
    )
    expect(await checkAdminAccess(user, client)).toBe(true)
    const input = storeInputSchema.parse(
      createTestStores('2026-11-03T00:00:00.000Z')[0].data,
    )
    await saveStore(
      client,
      { id: 'writer-test', googlePlaceId: 'ChIJ_writer' },
      input,
    )
    const before = (await admin.doc('stores/writer-test').get()).data()!
    await saveStore(
      client,
      { id: 'writer-test', googlePlaceId: 'ChIJ_writer' },
      input,
    )
    await expect(
      saveStore(
        client,
        { id: 'writer-test', googlePlaceId: 'ChIJ_writer' },
        { ...input, name: '再試行で上書きしない' },
      ),
    ).rejects.toBeInstanceOf(StoreConflictError)
    expect((await admin.doc('stores/writer-test').get()).data()).toEqual(before)
    const original = { ...storeDocumentSchema.parse(before), id: 'writer-test' }
    await saveStore(
      client,
      { id: 'writer-test', googlePlaceId: 'ChIJ_writer', original },
      { ...input, name: '登録店舗の編集' },
    )
    expect((await admin.doc('stores/writer-test').get()).data()?.name).toBe(
      '登録店舗の編集',
    )
    await expect(
      saveStore(
        client,
        { id: 'writer-test', googlePlaceId: 'ChIJ_writer', original },
        input,
      ),
    ).rejects.toBeInstanceOf(StoreConflictError)
    await seedAdminSettings(admin, 'another@example.test')
    expect(await checkAdminAccess(user, client)).toBe(false)
    await signOut(auth)
    await expect(
      saveStore(
        client,
        { id: 'no-auth', googlePlaceId: 'ChIJ_no_auth' },
        input,
      ),
    ).rejects.toBeDefined()
  })
})

describe('Place IDの紐付けとRules', () => {
  beforeEach(async () => {
    await seedAdminSettings(admin, 'admin@example.test')
  })
  const placeId = 'ChIJ_test'
  const input = () =>
    storeInputSchema.parse(createTestStores('2026-11-03T00:00:00.000Z')[0].data)
  it('未登録と取得済みの紐付けを照会し、100件や検索範囲の制限を受けない', async () => {
    expect(await readPlaceLinks(client, [placeId])).toEqual({ [placeId]: null })
    const db = manager()
    await saveStore(db, { id: 'outside', googlePlaceId: placeId }, input())
    const result = await readPlaceLinks(client, [placeId])
    expect(result[placeId]?.id).toBe('outside')
    expect(result[placeId]?.googlePlaceId).toBe(placeId)
  })
  it('新規作成を原子的に紐付け、再試行でも二重登録せず、既存フォームの編集で紐付けを保持する', async () => {
    const db = manager()
    await saveStore(db, { id: 'new-linked', googlePlaceId: placeId }, input())
    await saveStore(db, { id: 'new-linked', googlePlaceId: placeId }, input())
    expect((await admin.doc(`placeLinks/${placeId}`).get()).data()).toEqual({
      storeId: 'new-linked',
    })
    const original = {
      ...storeDocumentSchema.parse(
        (await admin.doc('stores/new-linked').get()).data(),
      ),
      id: 'new-linked',
    }
    await saveStore(
      db,
      { id: original.id, googlePlaceId: original.googlePlaceId, original },
      { ...input(), notes: '再確認' },
    )
    expect(
      (await admin.doc('stores/new-linked').get()).data()?.googlePlaceId,
    ).toBe(placeId)
    expect((await admin.collection('stores').get()).size).toBe(1)
  })
  it('Place IDなし・空の店舗は管理者でもSDKとRulesの両方で登録できない', async () => {
    const db = manager()
    const legacy: Partial<ReturnType<typeof newPayload>> = newPayload()
    delete legacy.googlePlaceId
    await assertFails(setDoc(doc(db, 'stores/legacy'), legacy))
    await assertFails(
      setDoc(doc(db, 'stores/empty-id'), {
        ...newPayload(),
        googlePlaceId: '',
      }),
    )
    await expect(
      saveStore(db, { id: 'no-place', googlePlaceId: '' }, input()),
    ).rejects.toBeDefined()
    expect((await admin.collection('stores').get()).size).toBe(0)
    expect((await admin.collection('placeLinks').get()).size).toBe(0)
  })
  it('同時登録は1件だけ成功し、同じ店舗への別Place IDの紐付けも拒否する', async () => {
    const db = manager()
    const results = await Promise.allSettled([
      saveStore(db, { id: 'race-a', googlePlaceId: placeId }, input()),
      saveStore(db, { id: 'race-b', googlePlaceId: placeId }, input()),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const failed = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult
    expect(failed.reason).toBeInstanceOf(StoreConflictError)
    const linked = (await readPlaceLinks(client, [placeId]))[placeId]!
    await expect(
      saveStore(
        db,
        { id: linked.id, original: linked, googlePlaceId: 'ChIJ_other' },
        input(),
      ),
    ).rejects.toBeInstanceOf(StoreConflictError)
    expect((await admin.collection('stores').get()).size).toBe(1)
    expect((await admin.doc('placeLinks/ChIJ_other').get()).exists).toBe(false)
  })
  it('片側のみの書き込み、非管理者、削除、再紐付けを拒否する', async () => {
    const db = manager()
    await assertFails(
      setDoc(doc(db, 'stores/one-sided'), {
        ...newPayload(),
        googlePlaceId: placeId,
      }),
    )
    await assertFails(
      setDoc(doc(db, 'placeLinks', placeId), { storeId: 'missing' }),
    )
    const batch = writeBatch(client)
    batch.set(doc(client, 'stores/not-admin'), {
      ...newPayload(),
      googlePlaceId: placeId,
    })
    batch.set(doc(client, 'placeLinks', placeId), { storeId: 'not-admin' })
    await assertFails(batch.commit())
    await saveStore(db, { id: 'valid', googlePlaceId: placeId }, input())
    await assertFails(deleteDoc(doc(db, 'placeLinks', placeId)))
    await assertFails(
      updateDoc(doc(db, 'placeLinks', placeId), { storeId: 'another' }),
    )
    await assertFails(
      updateDoc(doc(db, 'stores/valid'), {
        googlePlaceId: 'other',
        updatedAt: serverTimestamp(),
      }),
    )
    await assertFails(getDocs(collection(client, 'placeLinks')))
  })
  it('紐付け先が壊れていたら未登録へ変換せずエラーにする', async () => {
    await admin.doc(`placeLinks/${placeId}`).set({ storeId: 'missing' })
    await expect(readPlaceLinks(client, [placeId])).rejects.toThrow(
      'Inconsistent',
    )
  })
})
