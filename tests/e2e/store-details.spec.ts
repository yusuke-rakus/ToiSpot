import { expect, test } from '@playwright/test'
import { createTestStores } from '../fixtures/stores'
import type { Store } from '../../src/features/stores/store-schema'

const base = createTestStores('2026-11-03T00:00:00.000Z')[0].data
const stores: Store[] = [
  {
    ...base,
    id: 'equipment',
    name: '設備のあるコンビニ',
    notes: '',
    stalls: { shared: 2, male: 1, female: 1 },
    urinals: 1,
  },
  {
    ...base,
    id: 'mixed',
    name: '一部未確認のコンビニ',
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
  const details = panel.getByRole('article', { name: '店舗の詳細' })

  for (const theme of ['ライト', 'ダーク']) {
    await page.getByRole('button', { name: /テーマを変更/ }).click()
    await page.getByRole('menuitemradio', { name: theme, exact: true }).click()
    for (const store of stores) {
      await panel
        .getByRole('button', { name: `${store.name}の詳細を見る` })
        .click()
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
      await panel.getByRole('button', { name: '一覧へ戻る' }).click()
    }
  }
  expect(externalRequests).toEqual([])
})
