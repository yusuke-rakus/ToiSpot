import { expect, test, type Page } from '@playwright/test'
import { blockExternalRequests, stubMapsSdk } from './fixtures/network'
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

async function openList(page: Page, mobile: boolean) {
  if (mobile)
    await page.getByRole('button', { name: /^店舗一覧を表示/ }).click()
  return page.getByRole('list', { name: '周辺店舗一覧' })
}

test('選択した場所を周辺検索し、取得済みの店舗に絞り込みを適用する', async ({
  page,
}, testInfo) => {
  const externalRequests = await setup(page)
  const mobile = testInfo.project.name === 'mobile'
  const input = page.getByRole('combobox', {
    name: '駅名・地名・住所・店舗名で周辺を検索',
  })
  await input.fill('大阪')
  await page.getByRole('option', { name: /大阪駅/ }).click()

  await expect
    .poll(() => readState(page).then((state) => state.nearbyCalls.length))
    .toBe(2)
  const search = await readState(page)
  expect(search.nearbyCalls[1].center).toEqual(destination)
  expect(search.detailFields).toEqual([['location']])

  if (mobile) await input.focus()
  await page.getByRole('button', { name: '設備', exact: true }).click()
  const equipment = page.getByRole('dialog', { name: '設備で絞り込む' })
  await equipment
    .getByRole('checkbox', { name: '女性用個室', exact: true })
    .check()
  await equipment
    .getByRole('checkbox', { name: '共用個室', exact: true })
    .check()
  await equipment.getByRole('button', { name: /^適用/ }).click()
  await page.getByRole('button', { name: 'チェーン', exact: true }).click()
  const chains = page.getByRole('dialog', { name: 'チェーンで絞り込む' })
  await chains
    .getByRole('checkbox', { name: 'セブン-イレブン', exact: true })
    .check()
  await chains.getByRole('checkbox', { name: 'ローソン', exact: true }).check()
  await chains.getByRole('button', { name: /^適用/ }).click()
  await page.getByRole('button', { name: '利用可のみ', exact: true }).click()
  if (mobile) await page.getByRole('button', { name: '検索を閉じる' }).click()

  const expectedStores = [
    'セブン-イレブン 共用個室店',
    'セブン-イレブン 女性用個室店',
    'ローソン 共用個室店',
  ]
  const list = await openList(page, mobile)
  await expect(list.getByRole('button')).toHaveCount(expectedStores.length)
  await expect(mapPins(page)).toHaveCount(expectedStores.length)
  for (const name of expectedStores) {
    await expect(
      list.getByRole('button', { name: `${name}の詳細を見る` }),
    ).toHaveCount(1)
    await expect(
      page.getByRole('button', { name: `${name}・利用可`, exact: true }),
    ).toHaveCount(1)
  }
  const filtered = await readState(page)
  expect(filtered.nearbyCalls).toEqual(search.nearbyCalls)
  expect(filtered.autocompleteCalls).toHaveLength(1)
  expect(externalRequests).toEqual([])
})

test('一覧から店舗を選択し、追加検索せず同じ結果へ戻る', async ({
  page,
}, testInfo) => {
  const externalRequests = await setup(page)
  const mobile = testInfo.project.name === 'mobile'
  const store = stores[0]
  const list = await openList(page, mobile)
  const row = list.getByRole('button', { name: `${store.name}の詳細を見る` })
  await expect(list.getByRole('button')).toHaveCount(9)
  await row.click()
  const directions = page.getByRole('link', {
    name: 'Google マップで経路を見る',
  })
  const url = new URL((await directions.getAttribute('href'))!)
  expect(url.searchParams.get('destination_place_id')).toBe(store.googlePlaceId)

  if (mobile) {
    await openList(page, true)
  } else {
    const map = page.getByLabel('周辺の地図', { exact: true })
    const bounds = (await map.boundingBox())!
    await map.click({
      position: { x: bounds.width - 80, y: bounds.height / 2 },
    })
  }
  await expect(directions).toHaveCount(0)
  await expect(list.getByRole('button')).toHaveCount(9)
  await expect(row).toHaveCount(1)
  expect((await readState(page)).nearbyCalls).toHaveLength(1)
  expect(externalRequests).toEqual([])
})
