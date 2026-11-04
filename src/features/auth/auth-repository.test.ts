import { beforeEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({
  enabled: true,
  auth: {},
  db: {},
  getDoc: vi.fn(),
  prepare: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  listener: undefined as ((user: User | null) => Promise<void>) | undefined,
  unsubscribe: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({
  get usesFirebaseEmulators() {
    return mocks.enabled
  },
  getFirebaseServices: () => ({ auth: mocks.auth, db: mocks.db }),
}))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDocFromServer: (...args: unknown[]) => mocks.getDoc(...args),
}))
vi.mock('firebase/auth', () => ({
  browserSessionPersistence: 'session',
  setPersistence: (...args: unknown[]) => mocks.prepare(...args),
  onIdTokenChanged: (_auth: unknown, listener: typeof mocks.listener) => {
    mocks.listener = listener
    return mocks.unsubscribe
  },
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn()
  },
  signInWithPopup: (...args: unknown[]) => mocks.signIn(...args),
  signOut: (...args: unknown[]) => mocks.signOut(...args),
}))
import {
  checkAdminAccess,
  loginErrorMessage,
  loginWithGoogle,
  observeAdminSession,
  type AdminSession,
} from './auth-repository'

function user(
  email = 'admin@example.test',
  verified = true,
  provider = 'google.com',
) {
  return {
    email,
    getIdTokenResult: vi.fn().mockResolvedValue({
      claims: { email_verified: verified },
      signInProvider: provider,
    }),
  } as unknown as User
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = {}
  mocks.enabled = true
  mocks.listener = undefined
  mocks.prepare.mockResolvedValue(undefined)
  mocks.getDoc.mockResolvedValue({
    data: () => ({ email: 'admin@example.test' }),
  })
  mocks.signOut.mockImplementation(async () => {
    await mocks.listener?.(null)
  })
})

it('Google・メール確認済み・許可メールをすべて照合する', async () => {
  expect(
    await checkAdminAccess(user('ADMIN@EXAMPLE.TEST'), mocks.db as never),
  ).toBe(true)
  expect(
    await checkAdminAccess(user('other@example.test'), mocks.db as never),
  ).toBe(false)
  expect(
    await checkAdminAccess(
      user('admin@example.test', false),
      mocks.db as never,
    ),
  ).toBe(false)
  expect(
    await checkAdminAccess(
      user('admin@example.test', true, 'password'),
      mocks.db as never,
    ),
  ).toBe(false)
  mocks.getDoc.mockRejectedValue({ code: 'permission-denied' })
  expect(await checkAdminAccess(user(), mocks.db as never)).toBe(false)
  mocks.getDoc.mockRejectedValue({ code: 'unavailable' })
  await expect(
    checkAdminAccess(user(), mocks.db as never),
  ).rejects.toBeDefined()
})
it('タブ内セッションを準備し、対象外アカウントをサインアウトする', async () => {
  const changed = vi.fn<(state: AdminSession) => void>()
  const stop = observeAdminSession(changed)
  await waitFor(() => expect(mocks.listener).toBeDefined())
  await mocks.listener!(user('other@example.test'))
  expect(mocks.prepare).toHaveBeenCalledWith(mocks.auth, 'session')
  expect(mocks.signOut).toHaveBeenCalledOnce()
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      status: 'signedOut',
      message: expect.stringContaining('管理者に登録されていない'),
    }),
  )
  stop()
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
})
it('権限確認中のログアウト後に古い管理者判定を反映しない', async () => {
  let resolve: (value: unknown) => void = () => {}
  mocks.getDoc.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const changed = vi.fn()
  const stop = observeAdminSession(changed)
  await waitFor(() => expect(mocks.listener).toBeDefined())
  const pending = mocks.listener!(user())
  await waitFor(() => expect(mocks.getDoc).toHaveBeenCalled())
  await mocks.listener!(null)
  resolve({ data: () => ({ email: 'admin@example.test' }) })
  await pending
  expect(changed).toHaveBeenLastCalledWith({
    status: 'signedOut',
    message: null,
  })
  stop()
})
it('接続失敗は権限を与えず、クラウドモードでは認証を起動しない', async () => {
  const changed = vi.fn()
  mocks.getDoc.mockRejectedValue(new Error('offline'))
  const stop = observeAdminSession(changed)
  await waitFor(() => expect(mocks.listener).toBeDefined())
  await mocks.listener!(user())
  expect(changed).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'error' }),
  )
  stop()
  mocks.enabled = false
  mocks.prepare.mockClear()
  observeAdminSession(changed)()
  expect(mocks.prepare).not.toHaveBeenCalled()
  expect(() => loginWithGoogle()).toThrow('Local authentication only')
})
it('ポップアップキャンセル・ブロック・通信失敗を案内し、生のエラーを出さない', () => {
  expect(loginErrorMessage({ code: 'auth/popup-closed-by-user' })).toContain(
    'キャンセル',
  )
  expect(loginErrorMessage({ code: 'auth/popup-blocked' })).toContain(
    'ブロック',
  )
  expect(loginErrorMessage(new Error('secret-url'))).not.toContain('secret-url')
})
