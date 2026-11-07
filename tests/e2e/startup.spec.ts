import { expect, test } from '@playwright/test'

test('Firebase設定が揃っていてもe2eでは認証と外部通信を停止する', async ({
  page,
}) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== '127.0.0.1'
    )
      externalRequests.push(request.url())
  })
  await page.goto('/admin-login')
  await expect(page.getByRole('button', { name: 'ログイン' })).toBeDisabled()
  await expect(page.getByRole('alert')).toHaveText(
    'ログインはこの環境では利用できません。',
  )
  expect(externalRequests).toEqual([])
})

test('APIキー未設定では外部APIを呼ばずに設定案内を表示する', async ({
  page,
}) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).hostname !== '127.0.0.1'
    ) {
      externalRequests.push(request.url())
    }
  })

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '地図の設定が必要です' }),
  ).toBeVisible()
  await expect(page).toHaveTitle('コンビニトイレマップ')
  expect(externalRequests).toEqual([])
})

test('存在しないURLからトップへ戻れる', async ({ page }) => {
  await page.goto('/missing-page')
  await expect(
    page.getByRole('heading', { name: 'ページが見つかりません' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'トップに戻る' }).click()
  await expect(
    page.getByRole('heading', { name: 'コンビニトイレマップ' }),
  ).toBeVisible()
})
