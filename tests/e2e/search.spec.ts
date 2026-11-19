import { expect, test, type Page } from '@playwright/test'
import { createTestStores } from '../fixtures/stores'
import type { Store } from '../../src/features/stores/store-schema'

const timestamp = '2026-11-15T00:00:00.000Z'
const base = createTestStores(timestamp)[0].data
const destination = { lat: 34.702485, lng: 135.495951 }
const definitions = [
  { id: 'female-seven', name: 'セブン-イレブン 女性用個室店', female: 1 },
  { id: 'shared-lawson', name: 'ローソン 共用個室店', shared: 1 },
  { id: 'male-family', name: 'ファミリーマート 男性用個室店', male: 1 },
  {
    id: 'unavailable-seven',
    name: 'セブン-イレブン 利用不可店',
    unavailable: true,
  },
  { id: 'unknown-lawson', name: 'ローソン 設備未確認店', unknown: true },
  { id: 'female-family', name: 'ファミリーマート 女性用個室店', female: 1 },
  { id: 'zero-seven', name: 'セブン-イレブン 設備なし店' },
  { id: 'shared-seven', name: 'セブン-イレブン 共用個室店', shared: 1 },
] as const
const stores: Store[] = definitions.map((definition) => {
  const item: {
    id: string
    name: string
    female?: number
    shared?: number
    male?: number
    unknown?: boolean
    unavailable?: boolean
  } = definition
  const unknown = item.unknown || item.unavailable
  return {
    ...base,
    id: item.id,
    googlePlaceId: `ChIJ_search_${item.id}`,
    name: item.name,
    address: '大阪府大阪市北区梅田（テスト用の店舗）',
    notes: '',
    availability: item.unavailable ? 'unavailable' : 'available',
    stalls: {
      female: unknown ? null : (item.female ?? 0),
      shared: unknown ? null : (item.shared ?? 0),
      male: unknown ? null : (item.male ?? 0),
    },
    urinals: unknown ? null : 0,
  }
})

type SearchTestState = {
  nearbyCalls: { center: { lat: number; lng: number }; radius: number }[]
  autocompleteCalls: {
    input: string
    includedRegionCodes: string[]
    locationBias: unknown
  }[]
  detailFields: string[][]
}

async function setup(page: Page) {
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
      body: `const fixtures = ${JSON.stringify(stores)}; export function useStores(area) { const center = area.center ?? area; const data = { stores: fixtures.map((store, index) => ({ ...store, location: { lat: center.lat + (index - 3) * 0.0003, lng: center.lng + (index - 3) * 0.0004 } })), invalidCount: 0, truncated: false }; return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
    }),
  )
  await page.route('**/src/features/places/place-links.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export function usePlaceLinks(places) { const data = Object.fromEntries(places.map(place => [place.id, null])); return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
    }),
  )
  await page.addInitScript(
    ({ destination }) => {
      Object.defineProperty(navigator, 'geolocation', {
        value: {
          getCurrentPosition: (success: PositionCallback) =>
            success({
              coords: { latitude: 35.681236, longitude: 139.767125 },
            } as GeolocationPosition),
        },
      })
      const host = window as unknown as {
        searchTest: SearchTestState
        google: unknown
      }
      const state: SearchTestState = {
        nearbyCalls: [],
        autocompleteCalls: [],
        detailFields: [],
      }
      host.searchTest = state
      host.google = {
        maps: {
          importLibrary: async () => ({
            AutocompleteSessionToken: class {},
            AutocompleteSuggestion: {
              fetchAutocompleteSuggestions: async (request: {
                input: string
                includedRegionCodes: string[]
                locationBias: unknown
              }) => {
                state.autocompleteCalls.push({
                  input: request.input,
                  includedRegionCodes: request.includedRegionCodes,
                  locationBias: request.locationBias,
                })
                return {
                  suggestions: [
                    {
                      placePrediction: {
                        placeId: 'ChIJ_search_osaka_station',
                        mainText: { text: '大阪駅' },
                        text: { text: '大阪駅 大阪府大阪市北区梅田' },
                        secondaryText: { text: '大阪府大阪市北区梅田' },
                        toPlace: () => ({
                          location: { toJSON: () => destination },
                          fetchFields: async ({
                            fields,
                          }: {
                            fields: string[]
                          }) => {
                            state.detailFields.push(fields)
                            return {}
                          },
                        }),
                      },
                    },
                  ],
                }
              },
            },
            Place: {
              searchNearby: async (request: {
                locationRestriction: {
                  center: { lat: number; lng: number }
                  radius: number
                }
              }) => {
                state.nearbyCalls.push(request.locationRestriction)
                return {
                  places: [
                    {
                      id: 'ChIJ_search_missing',
                      displayName: 'コンビニ 未登録店',
                      formattedAddress: '大阪府大阪市北区（Googleの店舗情報）',
                      location: {
                        toJSON: () => ({
                          lat: request.locationRestriction.center.lat + 0.0015,
                          lng: request.locationRestriction.center.lng + 0.0015,
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
    },
    { destination },
  )
  await page.goto('/')
  await expect
    .poll(() => readState(page).then((state) => state.nearbyCalls.length))
    .toBe(1)
  return externalRequests
}

function readState(page: Page) {
  return page.evaluate(
    () => (window as unknown as { searchTest: SearchTestState }).searchTest,
  )
}

function mapPins(page: Page) {
  return page.getByRole('button', {
    name: /・(?:利用可|利用不可|データなし)$/,
  })
}

async function showList(page: Page, mobile: boolean, count: number) {
  if (mobile)
    await page
      .getByRole('button', {
        name: new RegExp(`^店舗一覧を表示（${count}件）$`),
      })
      .click()
  const list = page.getByRole('list', { name: '周辺店舗一覧' })
  await expect(list.locator('li')).toHaveCount(count)
  await expect(
    page.getByRole('button', { name: '店舗情報を更新' }),
  ).toHaveCount(0)
  await expect(
    page.locator('h2:not(.sr-only)', { hasText: 'トイレ情報' }),
  ).toHaveCount(0)
  return list
}

test('750ms後の場所候補から遠方を検索し、設備ORとチェーンを追加通信なしで適用できる', async ({
  page,
}, testInfo) => {
  const externalRequests = await setup(page)
  const mobile = testInfo.project.name === 'mobile'
  const inputLabel = '駅名・地名・住所・店舗名で周辺を検索'
  await expect(mapPins(page)).toHaveCount(9)

  const input = page.getByRole('combobox', { name: inputLabel })
  await input.focus()
  const clockStart = new Date('2026-11-15T00:00:00.000Z')
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1000))
  await input.fill('大阪')
  await page.clock.runFor(749)
  expect((await readState(page)).autocompleteCalls).toHaveLength(0)
  await page.clock.runFor(1)
  await expect(page.getByRole('option', { name: /大阪駅/ })).toBeVisible()
  expect((await readState(page)).autocompleteCalls).toEqual([
    {
      input: '大阪',
      includedRegionCodes: ['jp'],
      locationBias: {
        center: { lat: 35.681236, lng: 139.767125 },
        radius: 5000,
      },
    },
  ])
  await expect(
    page.getByRole('img', { name: 'Google Maps', exact: true }).first(),
  ).toBeVisible()
  await input.press('ArrowDown')
  await input.press('Enter')
  await page.clock.resume()
  await expect(page.getByRole('listbox', { name: '場所の候補' })).toHaveCount(0)
  await expect(page.getByLabel('周辺の地図', { exact: true })).toHaveAttribute(
    'data-center',
    JSON.stringify(destination),
  )
  expect((await readState(page)).detailFields).toEqual([['location']])
  await expect
    .poll(() => readState(page).then((state) => state.nearbyCalls.length))
    .toBe(2)
  const nearbyArea = (await readState(page)).nearbyCalls[1]
  expect(nearbyArea.center).toEqual(destination)
  expect(nearbyArea.radius).toBeGreaterThan(900)
  expect(nearbyArea.radius).toBeLessThan(950)

  if (mobile) await input.focus()
  await page.getByRole('button', { name: '設備', exact: true }).click()
  const equipment = page.getByRole('dialog', { name: '設備で絞り込む' })
  await equipment
    .getByRole('checkbox', { name: '女性用個室', exact: true })
    .check()
  await equipment
    .getByRole('checkbox', { name: '共用個室', exact: true })
    .check()
  await equipment.getByRole('button', { name: '適用（4件）' }).click()
  await page.getByRole('button', { name: 'チェーン', exact: true }).click()
  const chains = page.getByRole('dialog', { name: 'チェーンで絞り込む' })
  await chains
    .getByRole('checkbox', { name: 'セブン-イレブン', exact: true })
    .check()
  await chains.getByRole('checkbox', { name: 'ローソン', exact: true }).check()
  await chains.getByRole('button', { name: '適用（3件）' }).click()
  await expect(mapPins(page)).toHaveCount(3)
  await page.getByRole('button', { name: '利用可のみ', exact: true }).click()
  await expect(mapPins(page)).toHaveCount(3)
  expect((await readState(page)).nearbyCalls).toHaveLength(2)
  expect((await readState(page)).autocompleteCalls).toHaveLength(1)

  await page.screenshot({
    path: `output/playwright/search-${testInfo.project.name}-light.png`,
    fullPage: true,
    animations: 'disabled',
  })
  if (mobile) await page.getByRole('button', { name: '検索を閉じる' }).click()
  const list = await showList(page, mobile, 3)
  const names = await list.getByRole('heading').allTextContents()
  expect(names.sort()).toEqual(
    [
      'セブン-イレブン 共用個室店',
      'セブン-イレブン 女性用個室店',
      'ローソン 共用個室店',
    ].sort(),
  )
  await expect(list.getByText(/検索地点から約.*直線距離/)).toHaveCount(3)
  await expect(page.getByText('地図の表示範囲・中心から近い順')).toBeAttached()

  await page.getByRole('button', { name: /テーマを変更/ }).click()
  await page.getByRole('menuitemradio', { name: 'ダーク' }).click()
  await expect(page.getByLabel('周辺の地図', { exact: true })).toHaveAttribute(
    'data-color-scheme',
    'DARK',
  )
  await expect(list.locator('li')).toHaveCount(3)
  await page.screenshot({
    path: `output/playwright/search-${testInfo.project.name}-dark.png`,
    fullPage: true,
    animations: 'disabled',
  })
  expect((await readState(page)).nearbyCalls).toHaveLength(2)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(externalRequests).toEqual([])
})

test('周辺一覧から詳細へ進み、一覧アイコンと地図操作で同じ結果へ戻れる', async ({
  page,
}, testInfo) => {
  const externalRequests = await setup(page)
  const mobile = testInfo.project.name === 'mobile'
  const list = await showList(page, mobile, 9)
  const lastRow = list.getByRole('button').last()
  await lastRow.scrollIntoViewIfNeeded()
  const scrollArea = page
    .getByRole('dialog', { name: '周辺店舗一覧' })
    .locator('.overflow-y-auto')
  const previousScroll = mobile
    ? await scrollArea.evaluate((element) => element.scrollTop)
    : 0
  if (mobile) expect(previousScroll).toBeGreaterThan(0)
  const label = await lastRow.getAttribute('aria-label')
  await expect(lastRow).toHaveAccessibleDescription(/直線距離/)
  await lastRow.click()
  await expect(
    page.getByRole('link', { name: 'Google マップで経路を見る' }),
  ).toBeVisible()
  if (mobile) await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '一覧へ戻る' })).toHaveCount(0)
  if (mobile) {
    await expect(
      page.getByRole('region', { name: '選択した店舗の情報' }),
    ).toBeFocused()
    await page.getByRole('button', { name: /^店舗一覧を表示/ }).click()
  } else {
    const map = page.getByLabel('周辺の地図', { exact: true })
    const bounds = (await map.boundingBox())!
    await map.click({
      position: { x: bounds.width - 80, y: bounds.height / 2 },
    })
  }
  await expect(list.locator('li')).toHaveCount(9)
  if (mobile)
    await expect
      .poll(() => scrollArea.evaluate((element) => element.scrollTop))
      .toBe(previousScroll)
  await expect(list.getByRole('button', { name: label! })).toBeVisible()
  if (mobile) {
    const returnedRow = list.getByRole('button', { name: label! })
    await expect(returnedRow).toBeFocused()
    await expect(returnedRow).toHaveCSS('outline-style', 'none')
    await expect(returnedRow).toHaveCSS('box-shadow', 'none')
  }
  await expect(mapPins(page)).toHaveCount(9)
  expect((await readState(page)).nearbyCalls).toHaveLength(1)
  expect((await readState(page)).autocompleteCalls).toHaveLength(0)
  expect(externalRequests).toEqual([])
})

test('検索パネルが地図上に浮き、スマホのフォーカスと条件操作を維持する', async ({
  page,
}, testInfo) => {
  await setup(page)
  const mobile = testInfo.project.name === 'mobile'
  const input = page.getByRole('combobox')
  const panel = page.locator('[data-map-search-panel]')
  const map = page.getByLabel('周辺の地図', { exact: true })
  const locate = page.getByRole('button', { name: '現在地に移動' })
  await expect(locate).toBeEnabled()
  const mapBox = (await map.boundingBox())!
  const panelBox = (await panel.boundingBox())!
  await expect(page.getByRole('banner')).toHaveCount(0)
  expect(mapBox.y).toBe(0)
  const actions = (await page
    .getByRole('group', { name: 'マップのアプリ操作' })
    .boundingBox())!
  expect(actions.x + actions.width).toBeGreaterThan(mapBox.width - 20)
  if (mobile) expect(actions.y).toBeGreaterThan(panelBox.y + panelBox.height)
  else expect(actions.y).toBeLessThan(20)
  if (mobile) {
    const nearbyBox = (await page
      .getByRole('button', { name: 'この周辺を検索', exact: true })
      .boundingBox())!
    expect(
      Math.abs(
        nearbyBox.x + nearbyBox.width / 2 - (panelBox.x + panelBox.width / 2),
      ),
    ).toBeLessThan(2)
    expect(nearbyBox.y - (panelBox.y + panelBox.height)).toBeGreaterThanOrEqual(
      10,
    )
    expect(nearbyBox.y - (panelBox.y + panelBox.height)).toBeLessThanOrEqual(14)
    expect(actions.y + actions.height / 2).toBeCloseTo(
      nearbyBox.y + nearbyBox.height / 2,
      0,
    )
    expect(actions.x).toBeGreaterThan(nearbyBox.x + nearbyBox.width)
    expect(
      Math.abs(panelBox.x + panelBox.width / 2 - (mapBox.x + mapBox.width / 2)),
    ).toBeLessThan(2)
    await expect(
      page.getByRole('button', { name: '設備', exact: true }),
    ).toBeHidden()
  } else {
    expect(Math.abs(panelBox.x - mapBox.x - 16)).toBeLessThan(2)
    await expect(panel.getByRole('complementary')).toBeVisible()
    await locate.hover()
    await expect(page.getByRole('tooltip')).toContainText('現在地')
  }
  const locateBox = (await locate.boundingBox())!
  expect(locateBox.width).toBe(48)
  expect(locateBox.height).toBe(48)
  if (mobile) {
    const listButton = page.getByRole('button', { name: /^店舗一覧を表示/ })
    const listBox = (await listButton.boundingBox())!
    expect(listBox.width).toBe(48)
    expect(listBox.height).toBe(48)
    expect(listBox.y + listBox.height).toBeLessThan(locateBox.y)
    expect(listBox.x).toBe(locateBox.x)
    await expect(
      page.getByRole('button', { name: /件の店舗を一覧で見る/ }),
    ).toHaveCount(0)
  }

  expect(locateBox.x).toBeGreaterThan(mapBox.width - 80)
  await page.screenshot({
    path: `output/playwright/floating-${testInfo.project.name}-collapsed.png`,
    animations: 'disabled',
  })
  await input.fill('京都')
  await page.getByRole('button', { name: '設備', exact: true }).click()
  const popover = page.getByRole('dialog', { name: '設備で絞り込む' })
  await popover.getByRole('checkbox', { name: '女性用個室' }).check()
  await expect(input).toHaveValue('京都')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await page.screenshot({
    path: `output/playwright/floating-${testInfo.project.name}-filters.png`,
    animations: 'disabled',
  })
  await popover.getByRole('button', { name: /適用/ }).click()
  await expect(input).toHaveValue('京都')
  await expect(page.getByRole('button', { name: '設備（1）' })).toBeVisible()
  await page.getByRole('button', { name: '検索を閉じる' }).click()
  if (mobile) {
    await expect(page.getByRole('button', { name: '設備（1）' })).toBeHidden()
    await page.getByRole('button', { name: '適用中の条件1項目を表示' }).click()
    await expect(page.getByRole('button', { name: '設備（1）' })).toBeVisible()
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport!, 'height', {
        configurable: true,
        value: 400,
      })
      window.visualViewport!.dispatchEvent(new Event('resize'))
    })
    expect(
      (await panel.boundingBox())!.y + (await panel.boundingBox())!.height,
    ).toBeLessThanOrEqual(389)
    await page.evaluate(() => {
      delete (window.visualViewport as unknown as { height?: number }).height
      window.visualViewport!.dispatchEvent(new Event('resize'))
    })
    await page.getByRole('button', { name: '検索を閉じる' }).click()
    await showList(page, true, 2)
    const sheetBox = (await page.getByRole('dialog').boundingBox())!
    await expect
      .poll(async () => {
        const box = (await locate.boundingBox())!
        return box.y + box.height
      })
      .toBeLessThan(sheetBox.y)
  }
})

test('検索欄へフォーカスしても店舗一覧とスクロール位置を維持する', async ({
  page,
}, testInfo) => {
  const requests = await setup(page)
  const mobile = testInfo.project.name === 'mobile'
  const list = await showList(page, mobile, 9)
  await list.getByRole('button').last().scrollIntoViewIfNeeded()
  const viewport = mobile
    ? page
        .getByRole('dialog', { name: /周辺店舗一覧/ })
        .locator('.overflow-y-auto')
    : page.locator('[data-slot="scroll-area-viewport"]')
  const previousScroll = await viewport.evaluate((el) => el.scrollTop)
  await page.getByRole('combobox').focus()
  await expect(list).toBeVisible()
  await expect(list.locator('li')).toHaveCount(9)
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(previousScroll)
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(
    page.getByText(/2文字以上入力してください|場所を選ぶと|入力を止めると/),
  ).toHaveCount(0)
  expect((await readState(page)).autocompleteCalls).toHaveLength(0)
  if (mobile)
    await expect(
      page.getByRole('dialog', { name: /周辺店舗一覧/ }),
    ).toBeVisible()
  expect(requests).toEqual([])
})
