import { expect, test } from '@playwright/test'
import { blockExternalRequests } from './fixtures/network'

test('Mapsキー未設定とFirebase無効の状態では外部APIに接続しない', async ({
  page,
}) => {
  const externalRequests = await blockExternalRequests(page)
  await page.goto('/')
  await page.getByRole('main').waitFor({ state: 'attached' })
  await page.goto('/admin-login')
  await expect(page.getByRole('button', { name: 'ログイン' })).toBeDisabled()
  expect(externalRequests).toEqual([])
})

test('存在しないURLからトップへ遷移できる', async ({ page }) => {
  await page.goto('/missing-page')
  await page.getByRole('link', { name: 'トップに戻る' }).click()
  await expect(page).toHaveURL('/')
})
