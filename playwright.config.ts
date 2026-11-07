import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm dev --mode e2e --port 4173 --strictPort',
    // 実キーを持つ.envから独立させ、CIで有料APIや本番Firebaseに接続しない。
    env: {
      VITE_GOOGLE_MAPS_API_KEY: '',
      VITE_GOOGLE_MAPS_MAP_ID: 'DEMO_MAP_ID',
      VITE_USE_FIREBASE_EMULATORS: 'false',
      // 設定が揃っていてもe2eモードでは接続しない。実際の.envも上書きする。
      VITE_FIREBASE_API_KEY: 'e2e-public-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'toilet-map-e2e.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'toilet-map-e2e',
      VITE_FIREBASE_APP_ID: 'e2e-app-id',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})
