import { expect, test } from '@playwright/test'
import { createTestStores } from '../fixtures/stores'

const store = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  id: 'confirmed',
  name: '確認済みコンビニ',
  chainName: 'テストチェーン',
  address: '独自に確認した住所',
  location: { lat: 35.684, lng: 139.755 },
  isSample: false,
}

test('周辺コンビニのグレーピン・詳細・手動検索を外部通信なしで操作できる', async ({
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
  await page.route('**/src/features/map/map-config.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const INITIAL_CENTER = { lat: 35.681236, lng: 139.767125 }; export const INITIAL_ZOOM = 14; export const DEFAULT_PLACES_CONFIG = { autoSearch: false, expandedSearch: true, minZoom: 13, maxResults: 100, maxRequests: 9 }; export function getMapConfig() { return { apiKey: 'test-key-not-real', mapId: 'DEMO_MAP_ID' } } export function locationErrorMessage() { return '現在地を取得できませんでした' }`,
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
            searchNearby: async () => {
              state.nearbyCalls += 1
              return {
                places: [
                  {
                    id: 'ChIJ_mock',
                    displayName: '未調査のコンビニ',
                    formattedAddress: 'Googleから取得した住所',
                    location: { toJSON: () => ({ lat: 35.678, lng: 139.78 }) },
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
  const pin = page.getByRole('button', { name: '未調査のコンビニ・データなし' })
  await expect(pin).toBeVisible()
  await expect(pin.locator('svg')).toHaveCSS('color', 'rgb(156, 163, 175)')
  await expect(
    page.getByRole('list', { name: '周辺店舗一覧' }).locator('li'),
  ).toHaveCount(2)
  await pin.click()
  await expect(page.getByText('トイレ情報：データなし')).toBeVisible()
  await expect(page.getByText('Googleから取得した住所')).toBeVisible()
  const rose600 = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--color-rose-600)'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  await expect(pin.locator('svg')).toHaveCSS('color', rose600)
  await expect(pin.locator('svg')).toHaveCSS(
    'transform',
    'matrix(1.3, 0, 0, 1.3, 0, 0)',
  )
  await expect(pin.locator('svg')).toHaveCSS(
    'transition-property',
    'transform, color',
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(pin.locator('svg')).toHaveCSS('transition-property', 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(
    page.getByRole('button', { name: 'トイレ情報を登録' }),
  ).toHaveCount(0)
  await expect(page.getByLabel('ピンの凡例')).toBeVisible()
  await page.screenshot({
    path: `output/playwright/places-${testInfo.project.name}-detail.png`,
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '地図を移動', exact: true }).click()
  const map = page.getByLabel('周辺の地図', { exact: true })
  const center = await map.getAttribute('data-center')
  const zoom = await map.getAttribute('data-zoom')
  await page.getByRole('button', { name: /テーマを変更/ }).click()
  await page.getByRole('menuitemradio', { name: 'ダーク' }).click()
  await expect(map).toHaveAttribute('data-color-scheme', 'DARK')
  await expect(map).toHaveAttribute('data-center', center!)
  await expect(map).toHaveAttribute('data-zoom', zoom!)
  await expect(page.getByText('トイレ情報：データなし')).toBeVisible()
  await page.screenshot({
    path: `output/playwright/places-${testInfo.project.name}-dark.png`,
    fullPage: true,
    animations: 'disabled',
  })
  expect(
    await page.evaluate(
      () => (window as unknown as { nearbyCalls: number }).nearbyCalls,
    ),
  ).toBe(1)
  await page.getByRole('button', { name: 'この周辺を検索' }).click()
  await expect(page.getByText('検索した地点から半径3km・近い順')).toBeVisible()
  await expect(pin).toBeVisible()
  expect(
    await page.evaluate(
      () => (window as unknown as { nearbyCalls: number }).nearbyCalls,
    ),
  ).toBe(2)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await expect(pin.locator('svg')).toHaveCSS('color', 'rgb(156, 163, 175)')
  await expect(pin.locator('svg')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  )
  await page
    .getByRole('button', { name: '確認済みコンビニの詳細を見る' })
    .click()
  const registeredPin = page.getByRole('button', {
    name: '確認済みコンビニ・利用可',
  })
  await expect(registeredPin.locator('svg')).toHaveCSS('color', rose600)
  await expect(registeredPin.locator('svg')).toHaveCSS(
    'transform',
    'matrix(1.3, 0, 0, 1.3, 0, 0)',
  )
  await page.getByRole('button', { name: '一覧へ戻る' }).click()
  await expect(registeredPin.locator('svg')).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  )
  await expect(registeredPin.locator('svg')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  )
  expect(externalRequests).toEqual([])
})

test('店舗一覧をパネル内でスクロールし、詳細と一覧への切り替えで先頭に戻る', async ({
  page,
}, testInfo) => {
  const stores = Array.from({ length: 15 }, (_, index) => ({
    ...store,
    id: `store-${index}`,
    name: `スクロール確認店舗${index}`,
  }))
  await page.route('**/src/features/stores/use-stores.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `const data = ${JSON.stringify({ stores, invalidCount: 0, truncated: false })}; export function useStores() { return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
    }),
  )
  await page.goto('/')
  const panel = page.getByRole('complementary', {
    name: '店舗と選択した場所の情報',
  })
  const viewport = panel.locator('[data-slot="scroll-area-viewport"]')
  await expect(panel.getByRole('list').locator('li')).toHaveCount(15)
  expect(
    await viewport.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true)
  await panel
    .getByRole('button', { name: 'スクロール確認店舗14の詳細を見る' })
    .scrollIntoViewIfNeeded()
  expect(await viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await panel
    .getByRole('button', { name: 'スクロール確認店舗14の詳細を見る' })
    .click()
  await expect(
    panel.getByRole('heading', { name: 'スクロール確認店舗14', exact: true }),
  ).toBeVisible()
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0)
  await panel.getByRole('button', { name: '一覧へ戻る' }).click()
  await expect(panel.getByRole('list')).toBeVisible()
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `output/playwright/scroll-${testInfo.project.name}.png`,
    fullPage: true,
  })
})
