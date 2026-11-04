import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ThemeProvider, THEME_STORAGE_KEY, useTheme } from './theme-provider'
import { ThemeToggle } from './theme-toggle'

let media: MediaQueryList
let dark = false

function changeSystemTheme(value: boolean) {
  act(() => {
    dark = value
    media.dispatchEvent(new Event('change'))
  })
}

function Preview() {
  const { theme, resolvedTheme } = useTheme()
  return (
    <>
      <output>{`${theme}:${resolvedTheme}`}</output>
      <ThemeToggle />
    </>
  )
}

beforeEach(() => {
  localStorage.clear()
  dark = false
  media = Object.assign(new EventTarget(), {
    get matches() {
      return dark
    },
  }) as MediaQueryList
  Object.defineProperty(media, 'matches', { get: () => dark })
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

it('未保存ではOSに追従し、明示選択後はOS変更より選択を優先する', async () => {
  const user = userEvent.setup()
  render(
    <ThemeProvider>
      <Preview />
    </ThemeProvider>,
  )
  expect(screen.getByRole('status')).toHaveTextContent('system:light')
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  changeSystemTheme(true)
  expect(screen.getByRole('status')).toHaveTextContent('system:dark')
  expect(document.documentElement).toHaveClass('dark')
  expect(document.documentElement.style.colorScheme).toBe('dark')

  await user.click(screen.getByRole('button', { name: /テーマを変更/ }))
  expect(
    screen.getByRole('menuitemradio', { name: 'システム' }),
  ).toHaveAttribute('aria-checked', 'true')
  await user.click(screen.getByRole('menuitemradio', { name: 'ライト' }))
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  changeSystemTheme(false)
  changeSystemTheme(true)
  expect(screen.getByRole('status')).toHaveTextContent('light:light')
  expect(document.documentElement).not.toHaveClass('dark')
})

it('保存値を復元し、システム選択でOS連動に戻せる', async () => {
  localStorage.setItem(THEME_STORAGE_KEY, 'dark')
  const user = userEvent.setup()
  render(
    <ThemeProvider>
      <Preview />
    </ThemeProvider>,
  )
  expect(screen.getByRole('status')).toHaveTextContent('dark:dark')
  await user.click(screen.getByRole('button', { name: /現在：ダーク/ }))
  await user.click(screen.getByRole('menuitemradio', { name: 'システム' }))
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  expect(screen.getByRole('status')).toHaveTextContent('system:light')
  changeSystemTheme(true)
  expect(screen.getByRole('status')).toHaveTextContent('system:dark')
})

it('別タブの変更・削除・全消去を反映し、不正値はシステムへ戻す', () => {
  localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
  render(
    <ThemeProvider>
      <Preview />
    </ThemeProvider>,
  )
  expect(screen.getByRole('status')).toHaveTextContent('system:light')
  for (const [key, newValue, expected] of [
    [THEME_STORAGE_KEY, 'dark', 'dark:dark'],
    ['other-key', 'light', 'dark:dark'],
    [THEME_STORAGE_KEY, null, 'system:light'],
    [THEME_STORAGE_KEY, 'dark', 'dark:dark'],
    [null, null, 'system:light'],
    [THEME_STORAGE_KEY, 'invalid', 'system:light'],
  ]) {
    fireEvent(window, new StorageEvent('storage', { key, newValue }))
    expect(screen.getByRole('status')).toHaveTextContent(expected!)
  }
})

it('ストレージの読み書きが拒否されてもタブ内のテーマを切り替えられる', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  const user = userEvent.setup()
  render(
    <ThemeProvider>
      <Preview />
    </ThemeProvider>,
  )
  await user.click(screen.getByRole('button', { name: /テーマを変更/ }))
  await user.click(screen.getByRole('menuitemradio', { name: 'ダーク' }))
  expect(screen.getByRole('status')).toHaveTextContent('dark:dark')
  expect(document.documentElement).toHaveClass('dark')
})

it('React起動前のスクリプトも保存値・OS・保存拒否を正しく扱う', () => {
  const html = readFileSync('index.html', 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]
  const boot = new Function('window', 'document', 'localStorage', script)
  dark = true
  boot(window, document, localStorage)
  expect(document.documentElement).toHaveClass('dark')
  localStorage.setItem(THEME_STORAGE_KEY, 'light')
  boot(window, document, localStorage)
  expect(document.documentElement).not.toHaveClass('dark')
  localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
  boot(window, document, localStorage)
  expect(document.documentElement).toHaveClass('dark')
  boot(window, document, {
    getItem() {
      throw new Error('blocked')
    },
  })
  expect(document.documentElement.style.colorScheme).toBe('dark')
})
