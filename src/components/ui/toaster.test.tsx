import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Toaster } from './toaster'

const state = vi.hoisted(() => ({ message: null as string | null }))
vi.mock('@/features/auth/admin-provider', () => ({ useAdmin: () => state }))

it('失敗メッセージをToastに表示し、再試行の同じエラーも通知する', async () => {
  const { rerender } = render(<Toaster />)
  state.message = 'ログインに失敗しました'
  rerender(<Toaster />)
  expect(await screen.findByText('ログインに失敗しました')).toBeVisible()
  state.message = null
  rerender(<Toaster />)
  state.message = 'ログインに失敗しました'
  rerender(<Toaster />)
  expect(await screen.findByText('ログインに失敗しました')).toBeVisible()
})
