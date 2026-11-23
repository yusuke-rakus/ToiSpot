import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createTestStores } from '../../../tests/fixtures/stores'
import { storeInputSchema } from '../stores/store-schema'
import type { StoreRequest } from './store-request-schema'
import { StoreRequestsPage } from './store-requests-page'

const mock = vi.hoisted(() => ({
  status: 'admin',
  requests: [] as StoreRequest[],
  count: vi.fn(),
  list: vi.fn(),
  current: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  refreshAccess: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({
  firebaseEnabled: true,
  firebaseQueryScope: ['test', 'requests'],
  usesFirebaseEmulators: false,
  firebaseConnection: { enabled: true },
}))
vi.mock('../auth/admin-provider', () => ({
  useAdmin: () => ({
    status: mock.status,
    refreshAccess: mock.refreshAccess,
    busy: false,
    logout: vi.fn(),
  }),
}))
vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <button>テーマを変更</button>,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string
    children: ReactNode
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('./store-request-repository', () => ({
  StoreRequestConflictError: class extends Error {},
  fetchPendingStoreRequestCount: (...args: unknown[]) => mock.count(...args),
  fetchPendingStoreRequests: (...args: unknown[]) => mock.list(...args),
  readStoreForRequest: (...args: unknown[]) => mock.current(...args),
  approveStoreRequest: (...args: unknown[]) => mock.approve(...args),
  rejectStoreRequest: (...args: unknown[]) => mock.reject(...args),
}))

const base = createTestStores('2026-11-03T00:00:00.000Z')[0].data
const version = new Timestamp(1793664000, 123456000)
const request: StoreRequest = {
  id: 'request-1',
  kind: 'create',
  targetStoreId: 'request-1',
  googlePlaceId: base.googlePlaceId,
  input: { ...storeInputSchema.parse(base), name: '申請されたコンビニ' },
  baseUpdatedAt: null,
  status: 'pending',
  createdAt: '2026-11-11T00:00:00.000Z',
  reviewedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.status = 'admin'
  mock.requests = [request]
  mock.count.mockImplementation(async () => mock.requests.length)
  mock.list.mockImplementation(async () => ({
    requests: mock.requests,
    nextCursor: null,
  }))
  mock.current.mockResolvedValue({
    store: { ...base, id: 'existing' },
    baseUpdatedAt: version,
  })
  mock.approve.mockImplementation(async () => {
    mock.requests = []
  })
  mock.reject.mockImplementation(async () => {
    mock.requests = []
  })
})

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <StoreRequestsPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

it('未ログインで申請ページを開いても非公開データを取得しない', () => {
  mock.status = 'signedOut'
  setup()
  expect(screen.getByRole('link', { name: '管理者ログイン' })).toHaveAttribute(
    'href',
    '/admin-login',
  )
  expect(mock.list).not.toHaveBeenCalled()
  expect(mock.count).not.toHaveBeenCalled()
})

it('確認を確定したときだけ選択した申請を承認する', async () => {
  const user = setup()
  await user.click(
    await screen.findByRole('button', { name: /申請されたコンビニ/ }),
  )
  await user.click(screen.getByRole('button', { name: '承認する' }))
  const confirmation = screen.getByRole('alertdialog')
  expect(mock.approve).not.toHaveBeenCalled()
  await user.click(
    within(confirmation).getByRole('button', { name: '承認して反映' }),
  )
  await waitFor(() =>
    expect(mock.approve).toHaveBeenCalledExactlyOnceWith(request.id),
  )
})

it('ナノ秒だけ異なる古い修正申請も承認できず、却下はできる', async () => {
  mock.requests = [
    {
      ...request,
      kind: 'update',
      targetStoreId: 'existing',
      baseUpdatedAt: version,
    },
  ]
  mock.current.mockResolvedValue({
    store: { ...base, id: 'existing' },
    baseUpdatedAt: new Timestamp(version.seconds, version.nanoseconds + 1),
  })
  const user = setup()
  await user.click(
    await screen.findByRole('button', { name: /申請されたコンビニ/ }),
  )
  await screen.findByText(base.name, { exact: true })
  expect(mock.current).toHaveBeenCalledWith('existing', expect.any(AbortSignal))
  expect(screen.getByRole('button', { name: '承認する' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '却下する' }))
  await waitFor(() =>
    expect(mock.reject).toHaveBeenCalledExactlyOnceWith(request.id),
  )
  expect(mock.approve).not.toHaveBeenCalled()
})

it('承認の通信失敗では申請を残し、再試行できる', async () => {
  mock.approve.mockRejectedValueOnce(new Error('network failure'))
  const user = setup()
  await user.click(
    await screen.findByRole('button', { name: /申請されたコンビニ/ }),
  )
  await user.click(screen.getByRole('button', { name: '承認する' }))
  await user.click(screen.getByRole('button', { name: '承認して反映' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '承認する' })).toBeEnabled(),
  )
  expect(mock.approve).toHaveBeenCalledExactlyOnceWith(request.id)
  await user.click(screen.getByRole('button', { name: '承認する' }))
  await user.click(screen.getByRole('button', { name: '承認して反映' }))
  await waitFor(() => expect(mock.approve).toHaveBeenCalledTimes(2))
  expect(mock.approve).toHaveBeenLastCalledWith(request.id)
})
