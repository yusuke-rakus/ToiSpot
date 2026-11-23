import { expect, test, type Page } from '@playwright/test'
import { blockExternalRequests, stubMapsSdk } from './fixtures/network'

async function setup(page: Page, expandedSearch: boolean) {
  const externalRequests = await blockExternalRequests(page)
  await stubMapsSdk(page)
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

test('表示範囲の変更で自動検索し、縮小時は結果を維持して拡大で再開する', async ({
  page,
}, testInfo) => {
  const externalRequests = await setup(page, true)
  const mobile = testInfo.project.name === 'mobile'
  const list = page.getByRole('list', { name: '周辺店舗一覧' })
  const pins = page.getByRole('button', { name: /・データなし$/ })
  const results = mobile ? pins : list.getByRole('button')
  await expect(results).toHaveCount(100)
  expect(await callCount(page)).toBe(5)

  await page.getByRole('button', { name: '地図を移動', exact: true }).click()
  await expect.poll(() => callCount(page)).toBe(10)
  await expect(results).toHaveCount(100)
  if (mobile) await pins.last().click()
  else await list.getByRole('button').first().click()
  const directions = page.getByRole('link', {
    name: 'Google マップで経路を見る',
  })
  const selectedStore = await directions.getAttribute('href')

  await page.clock.install()
  await page.getByRole('button', { name: '地図を縮小' }).click()
  const map = page.getByLabel('周辺の地図', { exact: true })
  await expect(map).toHaveAttribute('data-zoom', '12')
  await page.clock.runFor(300)
  expect(await callCount(page)).toBe(10)
  await expect(directions).toHaveAttribute('href', selectedStore!)

  await page.getByRole('button', { name: '地図を拡大' }).click()
  await expect.poll(() => callCount(page)).toBe(15)
  await expect(results).toHaveCount(100)
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
  expect(externalRequests).toEqual([])
})

test('自動取得を有効にしたまま分割取得だけ無効化できる', async ({
  page,
}, testInfo) => {
  const externalRequests = await setup(page, false)
  const results =
    testInfo.project.name === 'mobile'
      ? page.getByRole('button', { name: /・データなし$/ })
      : page.getByRole('list', { name: '周辺店舗一覧' }).getByRole('button')
  await expect(results).toHaveCount(20)
  expect(await callCount(page)).toBe(1)
  await page.getByRole('button', { name: '地図を移動', exact: true }).click()
  await expect.poll(() => callCount(page)).toBe(2)
  await expect(results).toHaveCount(20)
  expect(externalRequests).toEqual([])
})
