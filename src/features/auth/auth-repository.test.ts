import { beforeEach, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({
  enabled: true,
  initializationError: false,
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
  firebaseConnection: { error: null },
  usesFirebaseEmulators: false,
  get firebaseEnabled() {
    return mocks.enabled
  },
  getFirebaseServices: () => {
    if (!mocks.enabled) throw new Error('Firebase接続は無効です。')
    if (mocks.initializationError) throw new Error('private-config-value')
    return { auth: mocks.auth, db: mocks.db }
  },
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
  signInWithEmailAndPassword: (...args: unknown[]) => mocks.signIn(...args),
  signOut: (...args: unknown[]) => mocks.signOut(...args),
}))
import {
  checkAdminAccess,
  loginErrorMessage,
  loginWithPassword,
  logoutAdmin,
  observeAdminSession,
  type AdminSession,
} from './auth-repository'

function user(uid = 'manager-uid', verified = false, provider = 'password') {
  return {
    uid,
    email: 'admin@example.test',
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
  mocks.initializationError = false
  mocks.listener = undefined
  mocks.prepare.mockResolvedValue(undefined)
  mocks.getDoc.mockResolvedValue({
    data: () => ({ uid: 'manager-uid' }),
  })
  mocks.signOut.mockImplementation(async () => {
    await mocks.listener?.(null)
  })
})

it('許可UIDとpasswordプロバイダーを照合し、メール確認を要求しない', async () => {
  expect(await checkAdminAccess(user(), mocks.db as never)).toBe(true)
  expect(await checkAdminAccess(user('other-uid'), mocks.db as never)).toBe(
    false,
  )
  expect(
    await checkAdminAccess(user('manager-uid', true), mocks.db as never),
  ).toBe(true)
  expect(
    await checkAdminAccess(
      user('manager-uid', true, 'google.com'),
      mocks.db as never,
    ),
  ).toBe(false)
  for (const data of [
    undefined,
    {},
    { email: 'admin@example.test' },
    { uid: '' },
  ]) {
    mocks.getDoc.mockResolvedValueOnce({ data: () => data })
    expect(await checkAdminAccess(user(), mocks.db as never)).toBe(false)
  }
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
  await mocks.listener!(user('other-uid'))
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
  resolve({ data: () => ({ uid: 'manager-uid' }) })
  await pending
  expect(changed).toHaveBeenLastCalledWith({
    status: 'signedOut',
    message: null,
  })
  stop()
})
it('接続失敗は権限を与えず、無効状態では認証を起動しない', async () => {
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
  await expect(
    loginWithPassword('admin@example.test', 'test-password'),
  ).rejects.toThrow('Firebase接続は無効')
})
it('認証情報の誤りは共通メッセージにし、生のエラーを出さない', () => {
  const invalid = loginErrorMessage({ code: 'auth/invalid-credential' })
  for (const code of [
    'auth/user-not-found',
    'auth/wrong-password',
    'auth/invalid-login-credentials',
  ]) {
    expect(loginErrorMessage({ code })).toBe(invalid)
  }
  expect(invalid).toContain('メールアドレスまたはパスワード')
  expect(loginErrorMessage({ code: 'auth/invalid-email' })).toContain('形式')
  expect(loginErrorMessage({ code: 'auth/missing-password' })).toContain('入力')
  expect(loginErrorMessage({ code: 'auth/too-many-requests' })).toContain(
    'しばらく',
  )
  expect(
    loginErrorMessage({ code: 'auth/admin-restricted-operation' }),
  ).toContain('登録済み')
  expect(loginErrorMessage({ code: 'auth/user-disabled' })).toContain('無効')
  expect(loginErrorMessage({ code: 'auth/unauthorized-domain' })).toContain(
    'ドメイン設定',
  )
  expect(loginErrorMessage({ code: 'auth/network-request-failed' })).toContain(
    '通信',
  )
  expect(loginErrorMessage(new Error('secret-url'))).not.toContain('secret-url')
  expect(loginErrorMessage(new Error('secret-url'))).not.toContain('Emulator')
})

it('セッション準備後、クラウドでも同じAuthでパスワード認証とログアウトを行う', async () => {
  let resolve: () => void = () => {}
  mocks.prepare.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  const pending = loginWithPassword('admin@example.test', 'test-password')
  expect(mocks.signIn).not.toHaveBeenCalled()
  resolve()
  await pending
  expect(mocks.signIn).toHaveBeenCalledWith(
    mocks.auth,
    'admin@example.test',
    'test-password',
  )
  await logoutAdmin()
  expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth)
})

it('セッション準備に失敗した場合は認証せず、再試行できる', async () => {
  mocks.prepare.mockRejectedValueOnce(new Error('storage unavailable'))
  await expect(
    loginWithPassword('admin@example.test', 'test-password'),
  ).rejects.toThrow()
  expect(mocks.signIn).not.toHaveBeenCalled()
  await loginWithPassword('admin@example.test', 'test-password')
  expect(mocks.signIn).toHaveBeenCalledOnce()
})

it('SDK初期化に失敗しても画面を落とさず、生の設定値を表示しない', () => {
  mocks.initializationError = true
  const changed = vi.fn()
  expect(() => observeAdminSession(changed)()).not.toThrow()
  expect(changed).toHaveBeenLastCalledWith({
    status: 'error',
    message: '認証を開始できませんでした。管理者が接続設定を確認してください。',
  })
  expect(mocks.prepare).not.toHaveBeenCalled()
})
