import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'rules',
          environment: 'node',
          include: ['tests/rules/**/*.test.ts'],
          hookTimeout: 20_000,
        },
      },
    ],
  },
})
