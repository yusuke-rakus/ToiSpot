import { expect, test } from '@playwright/test'
import { createTestStores } from '../fixtures/stores'
import type { Store } from '../../src/features/stores/store-schema'

const base = createTestStores('2026-11-03T00:00:00.000Z')[0].data
const stores: Store[] = [
  {
    ...base,
    id: 'equipment',
    name: '設備のあるコンビニ',
    notes: '店舗のトイレを利用する際は店員にお声がけください。'.repeat(18),
    stalls: { shared: 2, male: 1, female: 1 },
    urinals: 1,
  },
  {
    ...base,
    id: 'mixed',
    name: `一部未確認のコンビニ ${'LongStoreName'.repeat(8)}`,
    address: '東京都千代田区丸の内1丁目 東京駅地下通路 改札外 店舗区画'.repeat(
      3,
    ),
    notes: '',
    stalls: { shared: 2, male: 0, female: null },
    urinals: 0,
  },
  {
    ...base,
    id: 'unknown',
    name: '設備数未確認のコンビニ',
    notes: '',
    stalls: { shared: null, male: null, female: null },
    urinals: null,
  },
  {
    ...base,
    id: 'zero',
    name: '設備数がすべて0のコンビニ',
    notes: '',
    stalls: { shared: 0, male: 0, female: 0 },
    urinals: 0,
  },
  {
    ...base,
    id: 'unavailable',
    name: '利用不可のコンビニ',
    availability: 'unavailable',
    stalls: { shared: null, male: null, female: null },
    urinals: null,
    notes: 'こちらの店舗ではトイレを貸し出していません。',
  },
]

test('貸出状況に応じた設備表示をPC・スマホの明暗テーマで確認する', async ({
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
  const mobile = testInfo.project.name === 'mobile'
  if (mobile) {
    await page.route(
      /\/src\/features\/auth\/admin-provider\.tsx(?:\?.*)?$/,
      (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: `export const AdminProvider = ({children}) => children; export const useAdmin = () => ({ status: 'admin', busy: false, message: null, logout: async () => {} });`,
        }),
    )
  }
  await page.route(/@vis_+gl_react-google-maps\.js/, async (route) => {
    const response = await route.fetch({
      url: new URL('/tests/e2e/fixtures/maps-stub.tsx', route.request().url())
        .href,
    })
    await route.fulfill({ response, contentType: 'application/javascript' })
  })
  await page.route('**/src/features/map/map-config.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const INITIAL_CENTER = { lat: 35.681236, lng: 139.767125 }; export const INITIAL_ZOOM = 14; export const DEFAULT_PLACES_CONFIG = { autoSearch: false, expandedSearch: true, minZoom: 13, maxResults: 20, maxRequests: 1 }; export function getMapConfig() { return { apiKey: 'test-key-not-real', mapId: 'DEMO_MAP_ID' } } export function locationErrorMessage() { return '現在地を取得できませんでした' }`,
    }),
  )
  const positionedStores = stores.map((store, index) => ({
    ...store,
    location: { lat: 35.684, lng: 139.739 + index * 0.014 },
  }))
  await page.route('**/src/features/stores/use-stores.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `const data = ${JSON.stringify({ stores: positionedStores, invalidCount: 0, truncated: false })}; export function useStores() { return { data, enabled: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data }) } }`,
    }),
  )
  await page.goto('/')
  const panel = mobile
    ? page.getByRole('dialog', { name: 'トイレ情報' })
    : page.getByRole('complementary', { name: '店舗と選択した場所の情報' })
  const details = panel.getByRole('article', { name: '店舗の詳細' })

  for (const theme of ['ライト', 'ダーク']) {
    if (mobile) {
      await page.setViewportSize(
        theme === 'ライト'
          ? { width: 390, height: 844 }
          : { width: 360, height: 640 },
      )
    }
    await page.getByRole('button', { name: /テーマを変更/ }).click()
    await page.getByRole('menuitemradio', { name: theme, exact: true }).click()
    if (mobile) {
      await page.getByRole('button', { name: /^店舗一覧を表示/ }).click()
      const list = page.getByRole('list', { name: '周辺店舗一覧' })
      for (const store of positionedStores) {
        const row = list.getByRole('button', {
          name: `${store.name}の詳細を見る`,
        })
        const status =
          store.availability === 'available' ? '利用可' : '利用不可'
        await expect(row).toHaveAccessibleDescription(
          new RegExp(`^${status} .*直線距離`),
        )
        expect(
          await row.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true)
      }
      await page.screenshot({
        path: `output/playwright/toilet-list-mobile-${theme === 'ライト' ? 'light' : 'dark'}.png`,
        animations: 'disabled',
      })
      await page.getByRole('button', { name: 'トイレ情報を閉じる' }).click()
    }
    for (const store of stores) {
      if (mobile) {
        await page
          .getByRole('button', {
            name: `${store.name}・${store.availability === 'available' ? '利用可' : '利用不可'}`,
          })
          .click()
      } else {
        await panel
          .getByRole('button', { name: `${store.name}の詳細を見る` })
          .click()
      }
      await expect(
        details.getByRole('heading', { name: store.name }),
      ).toBeVisible()
      await expect(details.getByText('設備の内訳')).toHaveCount(0)
      await expect(details.getByText(/最終確認日/)).toHaveCount(0)
      await expect(details.getByText('記載なし')).toHaveCount(0)
      const equipment = details.getByLabel('トイレ設備')
      if (store.id === 'equipment') {
        await expect(equipment.locator('dt')).toHaveCount(4)
        await expect(equipment.getByText('2室', { exact: true })).toBeVisible()
        await expect(equipment.getByText('1基', { exact: true })).toBeVisible()
        await equipment.scrollIntoViewIfNeeded()
        expect(
          await equipment.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true)
        if (mobile) {
          const directions = panel.getByRole('link', {
            name: 'Google マップで経路を見る',
          })
          const viewport = panel.getByRole('region', {
            name: '選択した店舗の情報',
          })
          await expect(directions).toBeInViewport({ ratio: 1 })
          const linkBounds = await directions.boundingBox()
          const sheetTop = (await panel.boundingBox())!.y
          const controls = page.getByRole('group', { name: '地図の表示操作' })
          const search = page.locator('[data-map-search-panel]')
          await expect
            .poll(async () => {
              const box = (await controls.boundingBox())!
              return box.y + box.height
            })
            .toBeLessThan(sheetTop)
          const searchBounds = (await search.boundingBox())!
          expect((await controls.boundingBox())!.y).toBeGreaterThan(
            searchBounds.y + searchBounds.height,
          )
          await details
            .getByText(store.notes, { exact: true })
            .scrollIntoViewIfNeeded()
          expect(await viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(
            0,
          )
          expect(await directions.boundingBox()).toEqual(linkBounds)
          await expect(
            panel.getByRole('button', { name: 'トイレ情報を閉じる' }),
          ).toBeInViewport({ ratio: 1 })
          await viewport.evaluate((el) => {
            el.scrollTop = 0
          })
        }
      } else if (store.id === 'mixed') {
        await expect(equipment.locator('dt')).toHaveCount(2)
        await expect(details.getByText('男性用個室')).toHaveCount(0)
        await expect(details.getByText('男性用小便器')).toHaveCount(0)
        await expect(equipment.getByText('不明')).toHaveCount(1)
      } else if (store.id === 'unknown') {
        await expect(equipment.getByText('不明')).toHaveCount(4)
      } else {
        await expect(equipment).toHaveCount(0)
      }
      if (store.id === 'unavailable') {
        await expect(
          details.getByText('利用不可', { exact: true }),
        ).toBeVisible()
        await expect(details.getByText(store.notes)).toBeVisible()
        await details.getByText(store.notes).scrollIntoViewIfNeeded()
      }
      if (!store.notes) await expect(details.getByText('備考')).toHaveCount(0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      if (store.id === 'equipment' || store.id === 'unavailable') {
        await page.screenshot({
          path: `output/playwright/toilet-${store.id}-${testInfo.project.name}-${theme === 'ライト' ? 'light' : 'dark'}.png`,
          fullPage: true,
          animations: 'disabled',
        })
      }
      if (mobile)
        await panel.getByRole('button', { name: 'トイレ情報を閉じる' }).click()
      else {
        const map = page.getByLabel('周辺の地図', { exact: true })
        const bounds = (await map.boundingBox())!
        await map.click({
          position: { x: bounds.width - 80, y: bounds.height / 2 },
        })
      }
    }
  }
  if (mobile) {
    await page
      .getByRole('button', { name: '設備のあるコンビニ・利用可' })
      .click()
    const editButton = panel.getByRole('button', { name: '店舗を編集' })
    await editButton.click()
    const editor = page.getByRole('dialog', { name: '店舗を編集' })
    await expect(editor.getByRole('textbox', { name: '店名' })).toHaveValue(
      '設備のあるコンビニ',
    )
    await editor.getByRole('button', { name: '入力を閉じる' }).click()
    await expect(editor).toHaveCount(0)
    await expect(editButton).toBeFocused()
    await expect(panel).toBeVisible()
    const pin = page.getByRole('button', {
      name: '設備のあるコンビニ・利用可',
    })
    await expect(pin.locator('img')).toHaveAttribute('data-selected', 'true')
    const map = page.getByLabel('周辺の地図', { exact: true })
    await expect(map).toHaveCSS('cursor', 'default')
    const blankPoint = await map.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      for (const y of [180, 340, 420])
        for (const x of [bounds.width - 20, 20, bounds.width / 2])
          if (
            document.elementFromPoint(bounds.left + x, bounds.top + y) ===
            element
          )
            return { x, y }
      throw new Error('操作パネルに覆われていない地図の余白がありません')
    })
    await map.tap({ position: blankPoint })
    await expect(panel).toHaveCount(0)
    await expect(pin.locator('img')).toHaveAttribute('data-selected', 'false')
    await pin.tap()
    await expect(panel).toBeVisible()
    await expect(pin.locator('img')).toHaveAttribute('data-selected', 'true')
  }
  expect(externalRequests).toEqual([])
})
