import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page, expandedSearch: boolean) {
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
  await page.route('**/src/features/map/map-config.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const INITIAL_CENTER = { lat: 35.681236, lng: 139.767125 }; export const INITIAL_ZOOM = 14; export const DEFAULT_PLACES_CONFIG = { autoSearch: false, expandedSearch: true, minZoom: 13, maxResults: 100, maxRequests: 9 }; export function getMapConfig() { return { apiKey: 'test-key-not-real', mapId: 'DEMO_MAP_ID', places: { ...DEFAULT_PLACES_CONFIG, autoSearch: true, expandedSearch: ${expandedSearch} } } } export function locationErrorMessage() { return '現在地を取得できませんでした' }`,
    }),
  )
  await page.route('**/src/features/stores/use-stores.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `const data = { stores: [], invalidCount: 0, truncated: false }; export function useStores(area, suspended) { if (!suspended) window.storeArea = area; return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
    }),
  )
  await page.route('**/src/features/places/place-links.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export function usePlaceLinks(places) { const data = Object.fromEntries(places.map(place => [place.id, null])); return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
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
    const state = window as unknown as {
      nearbyCalls: { center: { lat: number; lng: number }; radius: number }[]
      google: unknown
    }
    state.nearbyCalls = []
    state.google = {
      maps: {
        importLibrary: async () => ({
          Place: {
            searchNearby: async (request: {
              locationRestriction: {
                center: { lat: number; lng: number }
                radius: number
              }
            }) => {
              const call = state.nearbyCalls.push(request.locationRestriction)
              return {
                places: Array.from({ length: 20 }, (_, index) => ({
                  id: `ChIJ_${call}_${index}`,
                  displayName: `検索${call}のコンビニ${index}`,
                  formattedAddress: 'Googleから取得した住所',
                  location: {
                    toJSON: () => request.locationRestriction.center,
                  },
                  attributions: [],
                })),
              }
            },
          },
        }),
      },
    }
  })
  await page.goto('/')
  return externalRequests
}

const callCount = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { nearbyCalls: unknown[] }).nearbyCalls.length,
  )

test('自動分割取得・縮小停止・表示維持・再開を外部通信なしで操作できる', async ({
  page,
}, testInfo) => {
  const externalRequests = await setup(page, true)
  const list = page.getByRole('list', { name: '周辺店舗一覧' })
  await expect(list.locator('li')).toHaveCount(100)
  expect(await callCount(page)).toBe(5)
  await expect(page.getByText('地図の表示範囲・中心から近い順')).toBeVisible()
  const initialRadius = await page.evaluate(
    () =>
      (window as unknown as { nearbyCalls: { radius: number }[] })
        .nearbyCalls[0].radius,
  )
  await page.getByRole('button', { name: '地図を移動', exact: true }).click()
  await expect.poll(() => callCount(page)).toBe(10)
  await expect(list.locator('li')).toHaveCount(100)
  const movedRadius = await page.evaluate(
    () =>
      (window as unknown as { nearbyCalls: { radius: number }[] })
        .nearbyCalls[5].radius,
  )
  expect(movedRadius).toBeLessThan(initialRadius)
  await list.getByRole('button').first().click()
  await expect(page.getByText('トイレ情報：データなし')).toBeVisible()
  await page.getByRole('button', { name: /テーマを変更/ }).click()
  await page.getByRole('menuitemradio', { name: 'ダーク' }).click()
  await page.waitForTimeout(400)
  expect(await callCount(page)).toBe(10)
  await page.getByRole('button', { name: '地図を縮小' }).click()
  await expect(page.getByText('地図を拡大すると検索を再開します')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'この周辺を検索' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '店舗情報を更新' }),
  ).toBeDisabled()
  await expect(page.getByText('トイレ情報：データなし')).toBeVisible()
  await page.waitForTimeout(400)
  expect(await callCount(page)).toBe(10)
  await page.screenshot({
    path: `output/playwright/auto-search-${testInfo.project.name}-paused.png`,
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '地図を拡大' }).click()
  await expect.poll(() => callCount(page)).toBe(15)
  await expect(page.getByText('地図を拡大すると検索を再開します')).toHaveCount(
    0,
  )
  await expect(list.locator('li')).toHaveCount(100)
  const sameArea = await page.evaluate(() => {
    const state = window as unknown as {
      storeArea: { center: { lat: number; lng: number }; zoom: number }
      nearbyCalls: { center: { lat: number; lng: number } }[]
    }
    return {
      center: state.storeArea.center,
      placesCenter: state.nearbyCalls[10].center,
      zoom: state.storeArea.zoom,
    }
  })
  expect(sameArea.center).toEqual(sameArea.placesCenter)
  expect(sameArea.zoom).toBe(13)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(externalRequests).toEqual([])
})

test('自動取得を有効にしたまま分割取得だけ無効化できる', async ({ page }) => {
  const externalRequests = await setup(page, false)
  const list = page.getByRole('list', { name: '周辺店舗一覧' })
  await expect(list.locator('li')).toHaveCount(20)
  expect(await callCount(page)).toBe(1)
  await page.getByRole('button', { name: '地図を移動', exact: true }).click()
  await expect.poll(() => callCount(page)).toBe(2)
  await expect(list.locator('li')).toHaveCount(20)
  await page.getByRole('button', { name: 'この周辺を検索' }).click()
  await expect.poll(() => callCount(page)).toBe(3)
  expect(externalRequests).toEqual([])
})
