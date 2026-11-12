import { expect, test } from '@playwright/test'
import { createTestStores } from '../fixtures/stores'

const existing = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  id: 'registered',
  name: 'ローソン 登録済み店',
  notes: '現在公開中の備考',
  location: { lat: 35.684, lng: 139.755 },
}

test('未ログインの新規・修正申請をベルから承認・却下し、公開情報を更新する', async ({
  page,
}, testInfo) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== '127.0.0.1'
    )
      externalRequests.push(request.url())
  })
  await page.route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) =>
    route.abort(),
  )
  await page.route(/@vis_+gl_react-google-maps\.js/, async (route) => {
    const response = await route.fetch({
      url: 'http://127.0.0.1:4173/tests/e2e/fixtures/maps-stub.tsx',
    })
    await route.fulfill({ response, contentType: 'application/javascript' })
  })
  await page.route('**/src/lib/firebase.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const firebaseEnabled = true;
        export const firebaseQueryScope = ['e2e', 'requests'];
        export const usesFirebaseEmulators = false;
        export const firebaseConnection = { enabled: true, error: null, mode: 'cloud', projectId: 'e2e' };
        export function getFirebaseServices() { throw new Error('Unexpected live Firebase connection') }`,
    }),
  )
  await page.route(
    /\/src\/features\/auth\/admin-provider\.tsx(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `import React from '/node_modules/.vite/deps/react.js';
          const { useSyncExternalStore } = React;
          const event = 'test-admin-session';
          const subscribe = (notify) => { window.addEventListener(event, notify); return () => window.removeEventListener(event, notify) };
          const snapshot = () => sessionStorage.getItem('test-admin') === 'true' ? 'admin' : 'signedOut';
          export const AdminProvider = ({children}) => children;
          export function useAdmin() { return { status: useSyncExternalStore(subscribe, snapshot), enabled: true, busy: false, message: null,
            logout: async () => { sessionStorage.removeItem('test-admin'); window.dispatchEvent(new Event(event)) },
            refreshAccess: () => {}, login: async () => {} } }`,
      }),
  )
  await page.route('**/src/features/map/map-config.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const INITIAL_CENTER = { lat: 35.681236, lng: 139.767125 };
        export const INITIAL_ZOOM = 14;
        export const DEFAULT_PLACES_CONFIG = { autoSearch: false };
        export function getMapConfig() { return { apiKey: 'test-key-not-real', mapId: 'DEMO_MAP_ID' } }
        export function locationErrorMessage() { return '現在地を取得できませんでした' }`,
    }),
  )
  await page.route(
    '**/src/features/store-requests/store-request-repository.ts',
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `const stores = [${JSON.stringify(existing)}];
          const requests = [];
          let sequence = 0;
          const version = { seconds: 100, nanoseconds: 123456789, isEqual(other) { return this.seconds === other?.seconds && this.nanoseconds === other?.nanoseconds } };
          export class StoreRequestConflictError extends Error {}
          export const allocateStoreRequestId = () => 'request-' + (++sequence);
          export const getTestStores = () => stores;
          export async function readStoreForRequest(id) { return { store: stores.find(store => store.id === id), baseUpdatedAt: version } }
          export async function submitStoreRequest(target, input) { requests.push({ ...target, id: target.requestId, input, status: 'pending', createdAt: new Date().toISOString(), reviewedAt: null }); return target.requestId }
          export async function fetchPendingStoreRequestCount() { return requests.filter(request => request.status === 'pending').length }
          export async function fetchPendingStoreRequests() { return { requests: requests.filter(request => request.status === 'pending'), nextCursor: null } }
          export async function approveStoreRequest(id) { const request = requests.find(request => request.id === id); request.status = 'approved';
            const data = { ...stores[0], ...request.input, id: request.targetStoreId, googlePlaceId: request.googlePlaceId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            if (request.kind === 'create') stores.push(data); else Object.assign(stores.find(store => store.id === data.id), data) }
          export async function rejectStoreRequest(id) { requests.find(request => request.id === id).status = 'rejected' }`,
      }),
  )
  await page.route('**/src/features/stores/use-stores.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `import { getTestStores } from '/src/features/store-requests/store-request-repository.ts';
        export function useStores() { const data = { stores: getTestStores(), invalidCount: 0, truncated: false };
          return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
    }),
  )
  await page.route('**/src/features/places/place-links.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `import { getTestStores } from '/src/features/store-requests/store-request-repository.ts';
        export function usePlaceLinks(places) { const data = Object.fromEntries(places.map(place => [place.id, getTestStores().find(store => store.googlePlaceId === place.id) ?? null]));
          return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
    }),
  )
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 35.681236, longitude: 139.767125 },
          } as GeolocationPosition),
      },
    })
    const state = window as unknown as { google: unknown }
    state.google = {
      maps: {
        importLibrary: async () => ({
          Place: {
            searchNearby: async () => ({
              places: [
                {
                  id: 'ChIJ_new_request',
                  displayName: 'セブン-イレブン 申請テスト店',
                  formattedAddress: '申請テストの住所',
                  location: {
                    toJSON: () => ({ lat: 35.678, lng: 139.78 }),
                  },
                  attributions: [],
                },
              ],
            }),
          },
        }),
      },
    }
  })

  await page.goto('/')
  await expect(page.getByRole('link', { name: /申請一覧/ })).toHaveCount(0)
  await page
    .getByRole('button', { name: 'セブン-イレブン 申請テスト店・データなし' })
    .click()
  await page.getByRole('button', { name: '登録を申請', exact: true }).click()
  const createForm = page.getByRole('dialog', { name: '登録を申請' })
  await createForm.getByRole('combobox', { name: '貸出状況' }).click()
  await page.getByRole('option', { name: '利用不可', exact: true }).click()
  await createForm.getByRole('textbox', { name: '備考' }).fill('新規店舗の申請')
  await createForm.getByRole('button', { name: '申請する' }).click()
  await expect(createForm).toHaveCount(0)
  await expect(
    page.getByRole('button', {
      name: 'セブン-イレブン 申請テスト店・データなし',
    }),
  ).toBeVisible()

  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'トイレ情報を閉じる' }).click()
  await page.getByRole('button', { name: `${existing.name}・利用可` }).click()
  await page.getByRole('button', { name: '修正を申請', exact: true }).click()
  const updateForm = page.getByRole('dialog', { name: '修正を申請' })
  await updateForm
    .getByRole('textbox', { name: '備考' })
    .fill('まだ公開されない修正内容')
  await updateForm.getByRole('button', { name: '申請する' }).click()
  await expect(updateForm).toHaveCount(0)
  await expect(page.getByText(existing.notes, { exact: true })).toBeVisible()
  await expect(
    page.getByText('まだ公開されない修正内容', { exact: true }),
  ).toHaveCount(0)
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'トイレ情報を閉じる' }).click()

  await page.evaluate(() => {
    sessionStorage.setItem('test-admin', 'true')
    window.dispatchEvent(new Event('test-admin-session'))
  })
  await page.getByRole('link', { name: /申請一覧.*2件/ }).click()
  await expect(page).toHaveURL('/admin/store-requests')
  await expect(
    page.getByRole('heading', { name: '登録・修正申請' }),
  ).toBeVisible()
  const newRequest = page.getByRole('article', {
    name: 'セブン-イレブン 申請テスト店の申請',
  })
  const updateRequest = page.getByRole('article', {
    name: `${existing.name}の申請`,
  })
  await newRequest.getByRole('button', { expanded: false }).click()
  await updateRequest.getByRole('button', { expanded: false }).click()
  await expect(
    updateRequest.getByText('まだ公開されない修正内容', { exact: true }),
  ).toBeVisible()

  // 審査画面の見た目と操作は、PCとスマホの両プロジェクトで確認する。
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `output/playwright/requests-${testInfo.project.name}-${colorScheme}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }

  // 詳細・承認・却下の操作は実際の画面コンポーネントを通して行う。
  await newRequest
    .getByRole('button', { name: '承認する', exact: true })
    .click()
  const confirm = page.getByRole('alertdialog')
  await confirm
    .getByRole('button', { name: '承認して反映', exact: true })
    .click()
  await expect(newRequest).toHaveCount(0)
  await expect(page.getByRole('link', { name: /申請一覧.*1件/ })).toBeVisible()

  await updateRequest
    .getByRole('button', { name: '却下する', exact: true })
    .click()
  await expect(updateRequest).toHaveCount(0)
  await expect(page.getByRole('link', { name: /申請一覧/ })).not.toHaveText('1')
  await page.getByRole('link', { name: 'コンビニトイレマップ' }).click()
  await expect(
    page.getByRole('button', {
      name: 'セブン-イレブン 申請テスト店・利用不可',
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'ログアウト' }).click()
  await expect(page.getByRole('link', { name: /申請一覧/ })).toHaveCount(0)
  await page.goto('/admin/store-requests')
  await expect(page.getByRole('link', { name: '管理者ログイン' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  expect(externalRequests).toEqual([])
})
