import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { Toaster } from './toaster'
import { ThemeProvider } from '@/components/theme-provider'

const state = vi.hoisted(() => ({ message: null as string | null }))
vi.mock('@/features/auth/admin-provider', () => ({ useAdmin: () => state }))

beforeEach(() => {
  state.message = null
  vi.stubGlobal('matchMedia', () =>
    Object.assign(new EventTarget(), { matches: false }),
  )
})

it('失敗メッセージをToastに表示し、再試行の同じエラーも通知する', async () => {
  const { rerender } = render(<Toaster />, { wrapper: ThemeProvider })
  state.message = 'ログインに失敗しました'
  rerender(<Toaster />)
  expect(await screen.findByText('ログインに失敗しました')).toBeVisible()
  state.message = null
  rerender(<Toaster />)
  await waitFor(() =>
    expect(
      screen.queryByText('ログインに失敗しました'),
    ).not.toBeInTheDocument(),
  )
  state.message = 'ログインに失敗しました'
  rerender(<Toaster />)
  expect(await screen.findByText('ログインに失敗しました')).toBeVisible()
})
