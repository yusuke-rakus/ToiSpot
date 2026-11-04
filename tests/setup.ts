import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdomにはレイアウトがないため、Radix Scroll Areaのサイズ監視だけを補う。
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
)

afterEach(cleanup)
