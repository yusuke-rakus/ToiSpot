import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import type { AdminSession } from './auth-repository'

const mocks = vi.hoisted(() => ({
  enabled: true,
  login: vi.fn(),
  logout: vi.fn(),
  navigate: vi.fn(),
  observe: vi.fn(),
  initialStatus: 'signedOut' as AdminSession['status'],
  listener: undefined as ((state: AdminSession) => void) | undefined,
}))
vi.mock('@/lib/firebase', () => ({
  get firebaseEnabled() {
    return mocks.enabled
  },
  firebaseConnection: { error: null },
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}))
vi.mock('./auth-repository', () => ({
  observeAdminSession: (listener: (state: AdminSession) => void) => {
    mocks.observe()
    mocks.listener = listener
    listener({ status: mocks.initialStatus, message: null })
    return () => {}
  },
  loginWithPassword: (...args: unknown[]) => mocks.login(...args),
  logoutAdmin: () => mocks.logout(),
  loginErrorMessage: () => 'メールアドレスまたはパスワードが正しくありません。',
}))
import { AdminProvider } from './admin-provider'
import { AdminLoginPage } from './admin-login-page'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.enabled = true
  mocks.listener = undefined
  mocks.initialStatus = 'signedOut'
})

function showLogin() {
  return render(
    <AdminProvider>
      <AdminLoginPage />
    </AdminProvider>,
  )
}
async function fill() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('メールアドレス'), 'admin@example.test')
  await user.type(screen.getByLabelText('パスワード'), 'local-password')
  return user
}

it('資格情報が空かメール形式が不正なら認証へ送信しない', async () => {
  showLogin()
  const user = userEvent.setup()
  const email = screen.getByLabelText('メールアドレス')
  const password = screen.getByLabelText('パスワード')
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
  expect(mocks.login).not.toHaveBeenCalled()
  await user.type(email, 'invalid-email')
  await user.type(password, 'test-password')
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
  expect(mocks.login).not.toHaveBeenCalled()
})

it('Enterで送信し、送信中は二重操作を防ぎ、成功後はパスワードを消してホームへ移動する', async () => {
  showLogin()
  let finish: () => void = () => {}
  mocks.login.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const user = await fill()
  await user.keyboard('{Enter}')
  expect(mocks.login).toHaveBeenCalledWith(
    'admin@example.test',
    'local-password',
  )
  const form = screen.getByLabelText('パスワード').closest('form')!
  fireEvent.submit(form)
  expect(mocks.login).toHaveBeenCalledOnce()
  await act(async () => {
    finish()
  })
  expect(screen.getByLabelText('パスワード')).toHaveValue('')
  fireEvent.submit(form)
  expect(mocks.login).toHaveBeenCalledOnce()
  expect(mocks.navigate).not.toHaveBeenCalled()
  act(() => mocks.listener?.({ status: 'admin', message: null }))
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/', replace: true }),
  )
})

it('認証失敗後はメールを保持してパスワードを消し、再試行できる', async () => {
  mocks.login.mockRejectedValueOnce(new Error('private-password'))
  showLogin()
  const user = await fill()
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
  await waitFor(() =>
    expect(screen.getByLabelText('パスワード')).toHaveValue(''),
  )
  expect(screen.getByLabelText('メールアドレス')).toHaveValue(
    'admin@example.test',
  )
  await user.type(screen.getByLabelText('パスワード'), 'retry-password')
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
  expect(mocks.login).toHaveBeenLastCalledWith(
    'admin@example.test',
    'retry-password',
  )
  expect(mocks.login).toHaveBeenCalledTimes(2)
})

it('Firebase接続が無効なら資格情報を送信しない', () => {
  mocks.enabled = false
  showLogin()
  fireEvent.submit(screen.getByLabelText('パスワード').closest('form')!)
  expect(mocks.login).not.toHaveBeenCalled()
  expect(mocks.navigate).not.toHaveBeenCalled()
})

it('認証監視の失敗後に再ログインすると購読を再開する', async () => {
  mocks.initialStatus = 'error'
  showLogin()
  mocks.initialStatus = 'signedOut'
  let finish: () => void = () => {}
  mocks.login.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const user = await fill()
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
  expect(mocks.observe).toHaveBeenCalledTimes(2)
  await act(async () => {
    mocks.listener?.({ status: 'admin', message: null })
    finish()
  })
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/', replace: true }),
  )
})
