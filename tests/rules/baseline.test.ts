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
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
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
import { seedAdminSettings, seedAdminUser } from '../../scripts/lib/seed-admin'
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
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { checkAdminAccess } from '../../src/features/auth/auth-repository'
import {
  approveStoreRequestInDb,
  readPendingStoreRequestCount,
  readPendingStoreRequests,
  readStoreForRequestFromDb,
  rejectStoreRequestInDb,
  submitStoreRequestToDb,
} from '../../src/features/store-requests/store-request-repository'

// clearFirestoreはこの専用IDのみ。開発用demo-toilet-mapのデータに触れない。
const projectId = 'demo-toilet-map-tests'
let environment: RulesTestEnvironment
let adminApp: App
let admin: Firestore
let clientApp: ReturnType<typeof initializeClientApp>
let client: ReturnType<typeof getClientFirestore>
const authUsers: string[] = []

beforeAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  if (!host || !['127.0.0.1:18081', 'localhost:18081'].includes(host))
    throw new Error('Local test emulator required')
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
  if (
    !authHost ||
    ![
      '127.0.0.1:19090',
      'localhost:19090',
      '127.0.0.1:19091',
      'localhost:19091',
    ].includes(authHost)
  )
    throw new Error('Local test Auth emulator required')
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
  connectAuthEmulator(
    getAuth(clientApp),
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,
    {
      disableWarnings: true,
    },
  )
})
afterEach(async () => {
  for (const uid of authUsers.splice(0))
    await getAdminAuth(adminApp).deleteUser(uid)
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
    await seedAdminSettings(admin, 'manager-uid')
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
      uid: 'manager-uid',
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
    await seedAdminSettings(admin, 'manager-uid')
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
      uid: 'manager-uid',
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
  uid = 'manager-uid',
  provider: 'google.com' | 'password' = 'password',
  verified = false,
) {
  return (
    environment
      .authenticatedContext(uid, {
        email: 'admin@example.test',
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
    await seedAdminSettings(admin, 'manager-uid')
  })

  it('設定の新規作成・再実行・変更・未指定を扱う', async () => {
    expect(await seedAdminSettings(admin, 'manager-uid')).toBe('unchanged')
    expect(await seedAdminSettings(admin, null)).toBe('skipped')
    expect((await admin.doc('_settings/admin').get()).data()).toEqual({
      uid: 'manager-uid',
    })
    expect(await seedAdminSettings(admin, 'other-uid')).toBe('updated')
    await assertFails(getDoc(doc(manager(), '_settings/admin')))
    await assertSucceeds(getDoc(doc(manager('other-uid'), '_settings/admin')))
  })

  it('管理者だけが設定をgetでき、設定の列挙・改変・店舗削除は全員拒否する', async () => {
    const db = manager()
    await assertSucceeds(getDoc(doc(db, '_settings/admin')))
    await assertFails(getDocs(collection(db, '_settings')))
    await assertFails(
      setDoc(doc(db, '_settings/admin'), { uid: 'attacker-uid' }),
    )
    await assertFails(deleteDoc(doc(db, '_settings/admin')))
    await assertFails(getDoc(doc(client, '_settings/admin')))
    await assertFails(getDoc(doc(manager('other-uid'), '_settings/admin')))
    await seedTestStores(admin)
    await assertFails(deleteDoc(doc(db, 'stores/sample-tokyo-01')))
  })

  it.each([
    ['other-uid', 'password', false],
    ['manager-uid', 'google.com', true],
    ['manager-uid', 'google.com', false],
  ] as const)(
    '許可UIDとpasswordの両条件が必要: %s/%s/%s',
    async (uid, provider, verified) => {
      const db = manager(uid, provider, verified)
      await assertFails(createLinkedStore(db, 'new'))
      await assertFails(getDoc(doc(db, '_settings/admin')))
    },
  )

  it('旧メール設定では同じメール・UIDでも権限を与えない', async () => {
    await admin.doc('_settings/admin').set({ email: 'admin@example.test' })
    await assertFails(getDoc(doc(manager(), '_settings/admin')))
    await assertFails(createLinkedStore(manager(), 'legacy-settings'))
    expect(await seedAdminSettings(admin, 'manager-uid')).toBe('updated')
    await assertSucceeds(getDoc(doc(manager(), '_settings/admin')))
  })

  it('管理者はPlaces店舗を作成・編集でき、作成日時を保持する', async () => {
    const db = manager()
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
      { chainName: 'ローソン' },
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

  it('設定がなければ許可UIDでも作成できない', async () => {
    await admin.doc('_settings/admin').delete()
    await assertFails(setDoc(doc(manager(), 'stores/new'), newPayload()))
  })
})

describe('Auth Emulatorと書き込み処理の結合', () => {
  it('既存Googleユーザーにも同じUIDでパスワードを設定できる', async () => {
    const auth = getAdminAuth(adminApp)
    const uid = 'legacy-google-admin'
    const email = 'legacy-admin@example.test'
    const result = await auth.importUsers([
      {
        uid,
        email,
        providerData: [
          { providerId: 'google.com', uid: 'legacy-google-provider', email },
        ],
      },
    ])
    expect(result.failureCount).toBe(0)
    authUsers.push(uid)
    await admin.doc('_settings/admin').set({ email })
    const seeded = await seedAdminUser(auth, {
      email,
      password: 'migration-test-password',
    })
    expect(seeded.uid).toBe(uid)
    expect(await seedAdminSettings(admin, uid)).toBe('updated')
    const { user } = await signInWithEmailAndPassword(
      getAuth(clientApp),
      email,
      'migration-test-password',
    )
    expect(user.uid).toBe(uid)
    expect(await checkAdminAccess(user, client)).toBe(true)
    await signOut(getAuth(clientApp))
  })

  it('再シードでUIDを保ちパスワードを更新し、無効ユーザーは再有効化しない', async () => {
    const auth = getAdminAuth(adminApp)
    const credentials = {
      email: 'seed-admin@example.test',
      password: 'first-test-password',
    }
    const first = await seedAdminUser(auth, credentials)
    authUsers.push(first.uid)
    const second = await seedAdminUser(auth, {
      ...credentials,
      password: 'second-test-password',
    })
    expect(second.uid).toBe(first.uid)
    await expect(
      signInWithEmailAndPassword(
        getAuth(clientApp),
        credentials.email,
        credentials.password,
      ),
    ).rejects.toBeDefined()
    const { user } = await signInWithEmailAndPassword(
      getAuth(clientApp),
      credentials.email,
      'second-test-password',
    )
    expect(user.uid).toBe(first.uid)
    await signOut(getAuth(clientApp))
    await auth.updateUser(first.uid, { disabled: true })
    await expect(seedAdminUser(auth, credentials)).rejects.toThrow('無効化済み')
    expect((await auth.getUser(first.uid)).disabled).toBe(true)
  })

  it('シードしたパスワードで管理者判定・作成・編集・再試行・競合・ログアウトを検証する', async () => {
    const credentials = {
      email: 'writer-admin@example.test',
      password: 'local-test-password',
    }
    const seeded = await seedAdminUser(getAdminAuth(adminApp), credentials)
    authUsers.push(seeded.uid)
    await seedAdminSettings(admin, seeded.uid)
    const auth = getAuth(clientApp)
    await expect(
      signInWithEmailAndPassword(auth, credentials.email, 'incorrect-password'),
    ).rejects.toBeDefined()
    const { user } = await signInWithEmailAndPassword(
      auth,
      credentials.email,
      credentials.password,
    )
    expect(user.emailVerified).toBe(false)
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
    await seedAdminSettings(admin, 'another-uid')
    expect(await checkAdminAccess(user, client)).toBe(false)
    await expect(
      saveStore(
        client,
        { id: 'revoked', googlePlaceId: 'ChIJ_revoked' },
        input,
      ),
    ).rejects.toBeDefined()
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
    await seedAdminSettings(admin, 'manager-uid')
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
  it.each(['変更なし', '備考を更新'])(
    '旧チェーン名を読み取りでは無視し、店舗を保存したときに削除する（%s）',
    async (edit) => {
      const db = manager()
      const target = { id: 'legacy-chain', googlePlaceId: placeId }
      await saveStore(db, target, input())
      const ref = admin.doc(`stores/${target.id}`)
      const before = (await ref.get()).data()!
      expect(before).not.toHaveProperty('chainName')
      await ref.update({ chainName: '旧チェーン名' })

      const original = (await readStores(client)).stores[0]
      expect(original).toMatchObject(target)
      expect(original).not.toHaveProperty('chainName')
      expect((await readPlaceLinks(client, [placeId]))[placeId]).toEqual(
        original,
      )

      const notes = edit === '変更なし' ? original.notes : 'トイレ情報を再確認'
      await saveStore(db, { ...target, original }, { ...input(), notes })
      const after = (await ref.get()).data()!
      expect(after).not.toHaveProperty('chainName')
      expect(after.createdAt).toEqual(before.createdAt)
      expect(after.googlePlaceId).toBe(placeId)
      expect(after.notes).toBe(notes)
      expect((await admin.doc(`placeLinks/${placeId}`).get()).data()).toEqual({
        storeId: target.id,
      })
    },
  )
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

describe('一般利用者の登録・編集申請と管理者の承認', () => {
  beforeEach(async () => {
    await seedAdminSettings(admin, 'manager-uid')
  })
  const input = () =>
    storeInputSchema.parse(createTestStores('2026-11-03T00:00:00.000Z')[0].data)
  const target = (requestId: string, googlePlaceId = `ChIJ_${requestId}`) => ({
    requestId,
    kind: 'create' as const,
    targetStoreId: requestId,
    googlePlaceId,
    baseUpdatedAt: null,
  })
  const payload = (requestId: string) => {
    return {
      kind: 'create',
      targetStoreId: requestId,
      googlePlaceId: `ChIJ_${requestId}`,
      baseUpdatedAt: null,
      input: input(),
      status: 'pending',
      createdAt: serverTimestamp(),
      reviewedAt: null,
    }
  }

  it('未ログインは申請だけ作成でき、申請一覧と件数は管理者だけが取得できる', async () => {
    await submitStoreRequestToDb(client, target('anonymous'), input())
    expect((await admin.doc('stores/anonymous').get()).exists).toBe(false)
    expect((await admin.doc('placeLinks/ChIJ_anonymous').get()).exists).toBe(
      false,
    )
    for (const db of [client, manager('other-uid')]) {
      await assertFails(getDoc(doc(db, 'storeRequests/anonymous')))
      await assertFails(getDocs(collection(db, 'storeRequests')))
      await assertFails(readPendingStoreRequestCount(db))
      await assertFails(
        updateDoc(doc(db, 'storeRequests/anonymous'), {
          status: 'approved',
          reviewedAt: serverTimestamp(),
        }),
      )
    }
    const db = manager()
    expect(await readPendingStoreRequestCount(db)).toBe(1)
    expect((await readPendingStoreRequests(db)).requests[0]).toMatchObject({
      id: 'anonymous',
      status: 'pending',
      input: input(),
    })
    await approveStoreRequestInDb(db, 'anonymous')
    expect(await readPendingStoreRequestCount(db)).toBe(0)
    expect((await admin.doc('stores/anonymous').get()).data()).toMatchObject(
      input(),
    )
    expect((await admin.doc('placeLinks/ChIJ_anonymous').get()).data()).toEqual(
      {
        storeId: 'anonymous',
      },
    )
    expect(
      (await admin.doc('storeRequests/anonymous').get()).data(),
    ).toMatchObject({
      status: 'approved',
      reviewedAt: expect.any(AdminTimestamp),
    })
    const before = (await admin.doc('stores/anonymous').get()).data()
    await approveStoreRequestInDb(db, 'anonymous')
    expect((await admin.doc('stores/anonymous').get()).data()).toEqual(before)
    await expect(
      rejectStoreRequestInDb(db, 'anonymous'),
    ).rejects.toBeInstanceOf(StoreConflictError)
  })

  it('不正な申請・入力・日時・最初からの承認状態をRulesで拒否する', async () => {
    const original = payload('invalid-request')
    const changes = [
      { kind: 'invalid' },
      { targetStoreId: 'other' },
      { googlePlaceId: '' },
      { baseUpdatedAt: Timestamp.now() },
      { status: 'approved', reviewedAt: serverTimestamp() },
      { reviewedAt: serverTimestamp() },
      { createdAt: Timestamp.fromMillis(0) },
      { extra: true },
      { input: { ...input(), isSample: false } },
      { input: { ...input(), name: ' \n\t' } },
      { input: { ...input(), location: { lat: 91, lng: 0 } } },
      { input: { ...input(), availability: 'unavailable' } },
      { input: { ...input(), urinals: -1 } },
    ]
    for (const change of changes)
      await assertFails(
        setDoc(doc(client, 'storeRequests/invalid-request'), {
          ...original,
          ...change,
        }),
      )
    expect((await admin.collection('storeRequests').get()).empty).toBe(true)
  })

  it('申請の店名・住所の前後空白を拒否し、読取正規化で承認内容が変わることを防ぐ', async () => {
    const original = payload('noncanonical')
    for (const whitespace of [
      ' ',
      '\t',
      '\n',
      '\u00a0',
      '\u3000',
      '\ufeff',
      '\u2007',
      '\u2028',
    ]) {
      for (const field of ['name', 'address'] as const) {
        await assertFails(
          setDoc(doc(client, 'storeRequests/noncanonical'), {
            ...original,
            input: {
              ...input(),
              [field]: `${whitespace}${input()[field]}${whitespace}`,
            },
          }),
        )
      }
    }
    const canonicalInput = {
      ...input(),
      name: 'ローソン A店',
      address: '東京都 日野市',
    }
    await assertSucceeds(
      setDoc(doc(client, 'storeRequests/noncanonical'), {
        ...original,
        input: canonicalInput,
      }),
    )
    await approveStoreRequestInDb(manager(), 'noncanonical')
    expect((await admin.doc('stores/noncanonical').get()).data()).toMatchObject(
      canonicalInput,
    )
  })

  it('申請内容の変更・店舗を伴わない承認・削除を管理者でも拒否し、却下は公開情報を作らない', async () => {
    await submitStoreRequestToDb(client, target('reject'), input())
    const db = manager()
    const ref = doc(db, 'storeRequests/reject')
    await assertFails(updateDoc(ref, { input: { ...input(), notes: '改変' } }))
    await assertFails(
      updateDoc(ref, {
        status: 'approved',
        reviewedAt: serverTimestamp(),
      }),
    )
    await assertFails(deleteDoc(ref))
    await rejectStoreRequestInDb(db, 'reject')
    await rejectStoreRequestInDb(db, 'reject')
    expect((await admin.doc('storeRequests/reject').get()).data()?.status).toBe(
      'rejected',
    )
    expect((await admin.collection('stores').get()).empty).toBe(true)
    expect((await admin.collection('placeLinks').get()).empty).toBe(true)
    await expect(approveStoreRequestInDb(db, 'reject')).rejects.toBeInstanceOf(
      StoreConflictError,
    )
    await assertFails(updateDoc(ref, { status: 'pending', reviewedAt: null }))
  })

  it('編集元のTimestampをナノ秒まで保ち、正しい基準日時の編集申請だけ反映する', async () => {
    const db = manager()
    await saveStore(
      db,
      { id: 'precise', googlePlaceId: 'ChIJ_precise' },
      input(),
    )
    const precise = new AdminTimestamp(1_800_000_000, 123_456_789)
    await admin.doc('stores/precise').update({ updatedAt: precise })
    const before = (await admin.doc('stores/precise').get()).data()!
    const original = await readStoreForRequestFromDb(client, 'precise')
    expect(original.baseUpdatedAt.nanoseconds).toBe(123_456_000)
    const editTarget = {
      ...target('edit-precise', 'ChIJ_precise'),
      kind: 'update' as const,
      targetStoreId: 'precise',
      baseUpdatedAt: original.baseUpdatedAt,
    }
    const proposed = { ...input(), notes: '利用者が確認した新しい情報' }
    await expect(
      submitStoreRequestToDb(
        client,
        {
          ...editTarget,
          baseUpdatedAt: Timestamp.fromDate(new Date(original.store.updatedAt)),
        },
        proposed,
      ),
    ).rejects.toBeInstanceOf(StoreConflictError)
    await submitStoreRequestToDb(client, editTarget, proposed)
    expect((await admin.doc('stores/precise').get()).data()).toEqual(before)
    await approveStoreRequestInDb(db, 'edit-precise')
    const after = (await admin.doc('stores/precise').get()).data()!
    expect(after.notes).toBe(proposed.notes)
    expect(after.createdAt).toEqual(before.createdAt)
    expect(after.googlePlaceId).toBe(before.googlePlaceId)
    expect(after.location).toEqual(before.location)
    expect((await admin.collection('stores').get()).size).toBe(1)
  })

  it('編集申請からの座標変更・別Place ID・存在しない対象・古い基準日時をRulesでも拒否する', async () => {
    await saveStore(
      manager(),
      { id: 'edit-target', googlePlaceId: 'ChIJ_edit_target' },
      input(),
    )
    const original = await readStoreForRequestFromDb(client, 'edit-target')
    const edit = {
      ...payload('invalid-edit'),
      kind: 'update',
      targetStoreId: 'edit-target',
      googlePlaceId: 'ChIJ_edit_target',
      baseUpdatedAt: original.baseUpdatedAt,
    }
    for (const change of [
      { targetStoreId: 'missing' },
      { googlePlaceId: 'ChIJ_wrong' },
      { baseUpdatedAt: Timestamp.fromMillis(0) },
      { baseUpdatedAt: null },
      { input: { ...input(), location: { lat: 0, lng: 0 } } },
    ])
      await assertFails(
        setDoc(doc(client, 'storeRequests/invalid-edit'), {
          ...edit,
          ...change,
        }),
      )
    await assertSucceeds(setDoc(doc(client, 'storeRequests/valid-edit'), edit))
  })

  it('申請後に更新された店舗を上書きせず、申請中のまま却下できる', async () => {
    const db = manager()
    await saveStore(db, { id: 'stale', googlePlaceId: 'ChIJ_stale' }, input())
    const original = await readStoreForRequestFromDb(client, 'stale')
    await submitStoreRequestToDb(
      client,
      {
        ...target('stale-request', 'ChIJ_stale'),
        kind: 'update',
        targetStoreId: 'stale',
        baseUpdatedAt: original.baseUpdatedAt,
      },
      { ...input(), notes: '古い情報を元にした申請' },
    )
    await saveStore(
      db,
      { id: 'stale', googlePlaceId: 'ChIJ_stale', original: original.store },
      { ...input(), notes: '管理者の最新情報' },
    )
    await expect(
      approveStoreRequestInDb(db, 'stale-request'),
    ).rejects.toBeInstanceOf(StoreConflictError)
    expect((await admin.doc('stores/stale').get()).data()?.notes).toBe(
      '管理者の最新情報',
    )
    expect(
      (await admin.doc('storeRequests/stale-request').get()).data()?.status,
    ).toBe('pending')
    await rejectStoreRequestInDb(db, 'stale-request')
  })

  it('同じPlaceの同時承認では1件だけを登録し、残りの申請を未処理に保つ', async () => {
    const placeId = 'ChIJ_duplicate_requests'
    await submitStoreRequestToDb(
      client,
      target('duplicate-a', placeId),
      input(),
    )
    await submitStoreRequestToDb(
      client,
      target('duplicate-b', placeId),
      input(),
    )
    const results = await Promise.allSettled([
      approveStoreRequestInDb(manager(), 'duplicate-a'),
      approveStoreRequestInDb(manager(), 'duplicate-b'),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect((await admin.collection('stores').get()).size).toBe(1)
    expect(await readPendingStoreRequestCount(manager())).toBe(1)
    const failed = results.find((result) => result.status === 'rejected')
    expect(failed?.status === 'rejected' && failed.reason).toBeInstanceOf(
      StoreConflictError,
    )
  })

  it('承認内容と異なる店舗を書き込むと、店舗・紐付け・申請のすべてを保存しない', async () => {
    await submitStoreRequestToDb(client, target('atomic'), input())
    const db = manager()
    const batch = writeBatch(db)
    batch.set(doc(db, 'stores/atomic'), {
      ...newPayload(),
      googlePlaceId: 'ChIJ_atomic',
      notes: '申請内容とは異なる値',
    })
    batch.set(doc(db, 'placeLinks/ChIJ_atomic'), { storeId: 'atomic' })
    batch.update(doc(db, 'storeRequests/atomic'), {
      status: 'approved',
      reviewedAt: serverTimestamp(),
    })
    await assertFails(batch.commit())
    expect((await admin.doc('stores/atomic').get()).exists).toBe(false)
    expect((await admin.doc('placeLinks/ChIJ_atomic').get()).exists).toBe(false)
    expect((await admin.doc('storeRequests/atomic').get()).data()?.status).toBe(
      'pending',
    )
  })

  it('申請を20件ずつ取得し、件数と次ページを欠落なく返す', async () => {
    const batch = admin.batch()
    for (let i = 0; i < 21; i++) {
      const id = `page-${String(i).padStart(2, '0')}`
      batch.set(admin.doc(`storeRequests/${id}`), {
        ...payload(id),
        createdAt: AdminTimestamp.fromMillis(i),
      })
    }
    await batch.commit()
    const db = manager()
    expect(await readPendingStoreRequestCount(db)).toBe(21)
    const first = await readPendingStoreRequests(db)
    expect(first.requests).toHaveLength(20)
    expect(first.nextCursor).not.toBeNull()
    const next = await readPendingStoreRequests(db, first.nextCursor!)
    expect(next.requests.map((request) => request.id)).toEqual(['page-20'])
    expect(next.nextCursor).toBeNull()
  })
})
