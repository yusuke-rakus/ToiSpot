import { expect, test } from '@playwright/test'
import { createTestStores } from '../fixtures/stores'

const store = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  id: 'confirmed',
  name: 'セブン-イレブン 確認済み店',
  address: '独自に確認した住所',
  location: { lat: 35.684, lng: 139.755 },
  isSample: false,
}

test('周辺コンビニのチェーン別ピン・詳細・手動検索を外部通信なしで操作できる', async ({
  page,
  context,
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
  const sheet = page.getByRole('dialog', { name: 'トイレ情報' })
  const list = page.getByRole('list', { name: '周辺店舗一覧' })
  const registeredPin = page.getByRole('button', {
    name: `${store.name}・利用可`,
  })
  const pin = page.getByRole('button', {
    name: 'ローソン テスト店・データなし',
  })
  const pinImage = pin.locator('img')
  const registeredImage = registeredPin.locator('img')
  const lawsonIcon = '/icons/map-pins/neutral/lawson.svg'
  const sevenElevenIcon = '/icons/map-pins/seven-eleven.svg'
  await expect(pin).toBeVisible()
  await expect(pinImage).toHaveAttribute('src', lawsonIcon)
  await expect(registeredImage).toHaveAttribute('src', sevenElevenIcon)
  for (const image of [pinImage, registeredImage]) {
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBe(240)
  }
  await expect(list.locator('li')).toHaveCount(mobile ? 0 : 2)
  await expect(sheet).toHaveCount(0)
  if (mobile) {
    await expect(page.getByRole('heading', { name: 'トイレ情報' })).toHaveCount(
      0,
    )
  }
  await pin.click()
  if (mobile) {
    await expect(sheet).toBeVisible()
    await expect(sheet).toHaveAttribute('data-side', 'bottom')
    await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0)
  }
  await expect(page.getByText('トイレ情報：データなし')).toBeVisible()
  await expect(page.getByText('Googleから取得した住所')).toBeVisible()
  const directions = page.getByRole('link', {
    name: 'Google マップで経路を見る',
  })
  const unregisteredUrl = new URL((await directions.getAttribute('href'))!)
  expect(unregisteredUrl.origin + unregisteredUrl.pathname).toBe(
    'https://www.google.com/maps/dir/',
  )
  expect(unregisteredUrl.searchParams.get('api')).toBe('1')
  expect(unregisteredUrl.searchParams.get('destination_place_id')).toBe(
    'ChIJ_mock',
  )
  expect(unregisteredUrl.searchParams.get('destination')).toMatch(
    /^\d+\.\d+,\d+\.\d+$/,
  )
  expect(unregisteredUrl.searchParams.has('origin')).toBe(false)
  expect(unregisteredUrl.searchParams.has('travelmode')).toBe(false)
  if (mobile) {
    await context.route('https://www.google.com/maps/dir/**', (route) =>
      route.fulfill({
        contentType: 'text/plain; charset=utf-8',
        body: '経路のテスト表示',
      }),
    )
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      directions.click(),
    ])
    await expect(popup).toHaveURL(unregisteredUrl.href)
    await expect(popup.getByText('経路のテスト表示')).toBeVisible()
    await popup.close()
    await expect(sheet).toBeVisible()
  }
  await expect(pinImage).toHaveAttribute('src', lawsonIcon)
  await expect(pinImage).toHaveCSS('transform', 'none')
  await expect(pin).toHaveCSS('outline-style', 'none')
  const sourceLabel = page
    .getByRole('article', { name: 'コンビニの詳細' })
    .getByText('Google Maps の店舗情報', { exact: true })
  await expect(sourceLabel).toBeVisible()
  const detailViewport = mobile
    ? sheet.locator('.overflow-y-auto')
    : page
        .getByRole('complementary')
        .locator('[data-slot="scroll-area-viewport"]')
  const viewportBounds = (await detailViewport.boundingBox())!
  const labelBounds = (await sourceLabel.boundingBox())!
  expect(labelBounds.y - viewportBounds.y).toBeGreaterThanOrEqual(19)
  expect(labelBounds.y + labelBounds.height).toBeLessThanOrEqual(
    viewportBounds.y + viewportBounds.height,
  )

  await expect(
    page.getByRole('button', { name: 'トイレ情報を登録' }),
  ).toHaveCount(0)
  await page.screenshot({
    path: `output/playwright/places-${testInfo.project.name}-detail.png`,
    fullPage: true,
    animations: 'disabled',
  })
  const map = page.getByLabel('周辺の地図', { exact: true })
  const previousCenter = await map.getAttribute('data-center')
  await page.getByRole('button', { name: '地図を移動', exact: true }).click()
  await expect(map).not.toHaveAttribute('data-center', previousCenter!)
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
  if (mobile) {
    await registeredPin.click()
    await expect(sheet.getByRole('heading', { name: store.name })).toBeVisible()
    const registeredUrl = new URL((await directions.getAttribute('href'))!)
    expect(registeredUrl.searchParams.get('destination_place_id')).toBe(
      store.googlePlaceId,
    )
    expect(registeredUrl.searchParams.get('destination')).toBe(
      `${store.location.lat},${store.location.lng}`,
    )
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await pin.click()
  }

  await page.getByRole('button', { name: 'この周辺を検索' }).click()
  if (mobile) await expect(sheet).toHaveCount(0)
  else
    await expect(
      page.getByText('地図の表示範囲・中心から近い順'),
    ).toBeAttached()
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
  await expect(pinImage).toHaveAttribute('src', lawsonIcon)
  await expect(pinImage).toHaveCSS('transform', 'none')
  if (mobile) await registeredPin.click()
  else
    await page
      .getByRole('button', { name: `${store.name}の詳細を見る` })
      .click()
  await expect(registeredImage).toHaveAttribute('src', sevenElevenIcon)
  await expect(registeredImage).toHaveCSS('transform', 'none')
  if (mobile) {
    await sheet.getByRole('button', { name: 'トイレ情報を閉じる' }).click()
    await expect(sheet).toHaveCount(0)
  } else {
    const mapBounds = (await map.boundingBox())!
    await map.click({
      position: { x: mapBounds.width - 80, y: mapBounds.height / 2 },
    })
  }
  await expect(registeredImage).toHaveAttribute('src', sevenElevenIcon)
  await expect(registeredImage).toHaveCSS('transform', 'none')
  expect(externalRequests).toEqual([])
})

test('店舗一覧をパネル内でスクロールし、詳細と一覧への切り替えで先頭に戻る', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile',
    '店舗一覧はデスクトップ幅で表示する',
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
      body: `export const INITIAL_CENTER = {lat:35.681236,lng:139.767125}; export const INITIAL_ZOOM=14; export const DEFAULT_PLACES_CONFIG={autoSearch:false,expandedSearch:true,minZoom:13,maxResults:20,maxRequests:1}; export function getMapConfig(){return {apiKey:'test-key-not-real',mapId:'DEMO_MAP_ID'}} export function locationErrorMessage(){return '現在地を取得できませんでした'}`,
    }),
  )
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
  const map = page.getByLabel('周辺の地図', { exact: true })
  const mapBounds = (await map.boundingBox())!
  await map.click({
    position: { x: mapBounds.width - 80, y: mapBounds.height / 2 },
  })
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
