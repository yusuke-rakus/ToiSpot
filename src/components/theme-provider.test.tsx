import { act, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ThemeProvider, THEME_STORAGE_KEY, useTheme } from './theme-provider'

let media: MediaQueryList
let dark = false

function changeSystemTheme(value: boolean) {
  act(() => {
    dark = value
    media.dispatchEvent(new Event('change'))
  })
}

beforeEach(() => {
  localStorage.clear()
  dark = false
  media = Object.defineProperty(new EventTarget(), 'matches', {
    get: () => dark,
  }) as MediaQueryList
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  document.documentElement.style.removeProperty('color-scheme')
})

it('未保存ではOSに追従し、手動で選んだ設定を保存してOS変更後も使う', () => {
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider })
  expect(result.current).toMatchObject({
    theme: 'system',
    resolvedTheme: 'light',
  })
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  changeSystemTheme(true)
  expect(result.current.resolvedTheme).toBe('dark')

  act(() => result.current.setTheme('light'))
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  changeSystemTheme(false)
  changeSystemTheme(true)
  expect(result.current).toMatchObject({
    theme: 'light',
    resolvedTheme: 'light',
  })
})

it('保存値を復元し、システム選択でOS連動に戻せる', () => {
  localStorage.setItem(THEME_STORAGE_KEY, 'dark')
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider })
  expect(result.current).toMatchObject({ theme: 'dark', resolvedTheme: 'dark' })
  act(() => result.current.setTheme('system'))
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  expect(result.current.resolvedTheme).toBe('light')
  changeSystemTheme(true)
  expect(result.current.resolvedTheme).toBe('dark')
})

it('別タブの変更・削除・全消去を反映し、不正値はシステムへ戻す', () => {
  localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider })
  expect(result.current.theme).toBe('system')
  for (const [key, newValue, expected] of [
    [THEME_STORAGE_KEY, 'dark', 'dark'],
    ['other-key', 'light', 'dark'],
    [THEME_STORAGE_KEY, null, 'system'],
    [THEME_STORAGE_KEY, 'dark', 'dark'],
    [null, null, 'system'],
    [THEME_STORAGE_KEY, 'invalid', 'system'],
  ]) {
    fireEvent(window, new StorageEvent('storage', { key, newValue }))
    expect(result.current.theme).toBe(expected)
  }
})

it('ストレージの読み書きが拒否されてもタブ内の設定を変更できる', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  const { result } = renderHook(useTheme, { wrapper: ThemeProvider })
  expect(result.current.theme).toBe('system')
  act(() => result.current.setTheme('dark'))
  expect(result.current).toMatchObject({ theme: 'dark', resolvedTheme: 'dark' })
})
