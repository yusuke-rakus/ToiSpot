import { expect, test } from '@playwright/test'
import { blockExternalRequests, stubMapsSdk } from './fixtures/network'
import { createTestStores } from '../fixtures/stores'

const store = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  id: 'confirmed',
  name: 'セブン-イレブン 確認済み店',
  address: '独自に確認した住所',
  location: { lat: 35.684, lng: 139.755 },
  isSample: false,
}

test('登録済みと未登録の店舗から経路を開き、地図を移動して手動検索する', async ({
  page,
  context,
}, testInfo) => {
  const externalRequests = await blockExternalRequests(page)
  await stubMapsSdk(page)
  await page.route('**/src/features/map/map-config.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const INITIAL_CENTER = { lat: 35.681236, lng: 139.767125 }; export const INITIAL_ZOOM = 14; export const DEFAULT_PLACES_CONFIG = { autoSearch: false, expandedSearch: true, minZoom: 13, maxResults: 20, maxRequests: 1 }; export function getMapConfig() { return { apiKey: 'test-key-not-real', mapId: 'DEMO_MAP_ID' } } export function locationErrorMessage() { return '現在地を取得できませんでした' }`,
    }),
  )
  await page.route('**/src/features/stores/use-stores.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `const data = ${JSON.stringify({ stores: [store], invalidCount: 0, truncated: false })}; export function useStores() { return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
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
    const state = window as unknown as { nearbyCalls: number; google: unknown }
    state.nearbyCalls = 0
    state.google = {
      maps: {
        importLibrary: async () => ({
          Place: {
            searchNearby: async ({
              locationRestriction: { center },
            }: {
              locationRestriction: { center: { lat: number; lng: number } }
            }) => {
              state.nearbyCalls += 1
              return {
                places: [
                  {
                    id: 'ChIJ_mock',
                    displayName: 'ローソン テスト店',
                    formattedAddress: 'Googleから取得した住所',
                    location: {
                      toJSON: () => ({
                        lat: center.lat + 0.001,
                        lng: center.lng + 0.001,
                      }),
                    },
                    attributions: [],
                  },
                ],
              }
            },
          },
        }),
      },
    }
  })
  await page.goto('/')
  const mobile = testInfo.project.name === 'mobile'
  const registeredPin = page.getByRole('button', {
    name: `${store.name}・利用可`,
  })
  const unregisteredPin = page.getByRole('button', {
    name: 'ローソン テスト店・データなし',
  })
  const directions = page.getByRole('link', {
    name: 'Google マップで経路を見る',
  })
  await unregisteredPin.click()
  const unregisteredUrl = new URL((await directions.getAttribute('href'))!)
  expect(unregisteredUrl.origin + unregisteredUrl.pathname).toBe(
    'https://www.google.com/maps/dir/',
  )
  expect(unregisteredUrl.searchParams.get('api')).toBe('1')
  expect(unregisteredUrl.searchParams.get('destination_place_id')).toBe(
    'ChIJ_mock',
  )
  expect(unregisteredUrl.searchParams.get('destination')).toBe(
    `${35.681236 + 0.001},${139.767125 + 0.001}`,
  )
  expect(unregisteredUrl.searchParams.has('origin')).toBe(false)
  expect(unregisteredUrl.searchParams.has('travelmode')).toBe(false)

  await context.route('https://www.google.com/maps/dir/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' }),
  )
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    directions.click(),
  ])
  await expect(popup).toHaveURL(unregisteredUrl.href)
  await popup.close()

  const closeDetails = page.getByRole('button', { name: 'トイレ情報を閉じる' })
  if (mobile) await closeDetails.click()
  await registeredPin.click()
  const registeredUrl = new URL((await directions.getAttribute('href'))!)
  expect(registeredUrl.searchParams.get('destination_place_id')).toBe(
    store.googlePlaceId,
  )
  expect(registeredUrl.searchParams.get('destination')).toBe(
    `${store.location.lat},${store.location.lng}`,
  )
  if (mobile) await closeDetails.click()

  const callCount = () =>
    page.evaluate(
      () => (window as unknown as { nearbyCalls: number }).nearbyCalls,
    )
  expect(await callCount()).toBe(1)
  const map = page.getByLabel('周辺の地図', { exact: true })
  const previousCenter = await map.getAttribute('data-center')
  await page.getByRole('button', { name: '地図を移動', exact: true }).click()
  await expect(map).not.toHaveAttribute('data-center', previousCenter!)
  expect(await callCount()).toBe(1)
  await page.getByRole('button', { name: 'この周辺を検索' }).click()
  await expect.poll(callCount).toBe(2)
  expect(externalRequests).toEqual([])
})
