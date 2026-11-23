import type { Page } from '@playwright/test'

export async function blockExternalRequests(page: Page) {
  const requests: string[] = []
  await page
    .context()
    .route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) => {
      requests.push(route.request().url())
      return route.abort()
    })
  return requests
}

export async function stubMapsSdk(page: Page) {
  await page.route(/@vis_+gl_react-google-maps\.js/, async (route) => {
    const url = new URL(
      '/tests/e2e/fixtures/maps-stub.tsx',
      route.request().url(),
    )
    const response = await route.fetch({ url: url.href })
    await route.fulfill({ response, contentType: 'application/javascript' })
  })
}
