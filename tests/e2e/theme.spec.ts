import { expect, test } from '@playwright/test'

test('OS連動・手動切替・再読込・別タブ同期を利用できる', async ({
  page,
  context,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  const root = page.locator('html')
  await expect(root).toHaveClass('dark')
  await expect(
    page.getByRole('button', { name: /現在：システム/ }),
  ).toBeVisible()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(root).not.toHaveClass('dark')

  const toggle = page.getByRole('button', { name: /テーマを変更/ })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('menuitemradio', { name: 'システム' }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Home')
  await expect(
    page.getByRole('menuitemradio', { name: 'ライト' }),
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(
    page.getByRole('menuitemradio', { name: 'ダーク' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(root).toHaveClass('dark')
  await expect(toggle).toBeFocused()
  await page.reload()
  await expect(root).toHaveClass('dark')
  await expect(page.getByRole('button', { name: /現在：ダーク/ })).toBeVisible()

  const otherTab = await context.newPage()
  await otherTab.goto('/')
  await expect(otherTab.locator('html')).toHaveClass('dark')
  await toggle.click()
  await page.getByRole('menuitemradio', { name: 'ライト' }).click()
  await expect(otherTab.locator('html')).not.toHaveClass('dark')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(root).not.toHaveClass('dark')
  await toggle.click()
  await page.getByRole('menuitemradio', { name: 'システム' }).click()
  await expect(root).toHaveClass('dark')
  await otherTab.close()
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await toggle.click()
    await expect(
      page.getByRole('menuitemradio', { name: 'システム' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `output/playwright/theme-${testInfo.project.name}-${colorScheme}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
  }
})

test('管理者ヘッダーでもテーマとログアウトを操作できる', async ({
  page,
}, testInfo) => {
  await page.route(
    /\/src\/features\/auth\/admin-provider\.tsx(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export const AdminProvider = ({children}) => children; export const useAdmin = () => ({ status: 'admin', busy: false, message: null, logout: async () => {} });`,
      }),
  )
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()
  await page.getByRole('button', { name: /テーマを変更/ }).click()
  await page.getByRole('menuitemradio', { name: 'ダーク' }).click()
  await expect(page.locator('html')).toHaveClass('dark')
  const header = page.locator('header')
  const bounds = await header.boundingBox()
  const logoutBounds = await page
    .getByRole('button', { name: 'ログアウト' })
    .boundingBox()
  expect(logoutBounds!.x + logoutBounds!.width).toBeLessThanOrEqual(
    bounds!.width,
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `output/playwright/theme-${testInfo.project.name}-admin.png`,
    fullPage: true,
    animations: 'disabled',
  })
})
