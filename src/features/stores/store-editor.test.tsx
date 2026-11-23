import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { StoreEditor } from './store-editor'
import type { Store } from './store-schema'
import { createTestStores } from '../../../tests/fixtures/stores'
import { chooseSelectOption } from '../../../tests/select'

const mock = vi.hoisted(() => ({
  save: vi.fn(),
  request: vi.fn(),
  status: 'admin',
  refreshAccess: vi.fn(),
}))
vi.mock('../auth/admin-provider', () => ({
  useAdmin: () => ({ status: mock.status, refreshAccess: mock.refreshAccess }),
}))
vi.mock('./store-writer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store-writer')>()),
  saveConfiguredStore: (...args: unknown[]) => mock.save(...args),
}))
vi.mock('../store-requests/store-request-repository', () => ({
  submitStoreRequest: (...args: unknown[]) => mock.request(...args),
}))
beforeEach(() => {
  vi.clearAllMocks()
  mock.status = 'admin'
  mock.save.mockResolvedValue('fixed-new-id')
  mock.request.mockResolvedValue('request-fixed')
})
function setup(
  edit = false,
  existingValues?: Partial<Store>,
  requesting = false,
) {
  const onSaved = vi.fn().mockResolvedValue(undefined)
  const onRequested = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  const original = {
    ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
    id: 'sample-tokyo-01',
    ...existingValues,
  }
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const show = () => (
    <QueryClientProvider client={client}>
      <StoreEditor
        target={
          edit
            ? {
                id: original.id,
                googlePlaceId: original.googlePlaceId,
                original,
              }
            : { id: 'fixed-new-id', googlePlaceId: 'ChIJ_new' }
        }
        place={{
          id: 'ChIJ_new',
          name: '新しい店舗',
          address: '東京都の架空住所',
          location: { lat: 35.68, lng: 139.76 },
          attributions: [],
        }}
        mode={requesting ? 'request' : 'direct'}
        requestTarget={
          requesting
            ? {
                requestId: 'request-fixed',
                targetStoreId: edit ? original.id : 'request-fixed',
                kind: edit ? 'update' : 'create',
                googlePlaceId: edit ? original.googlePlaceId : 'ChIJ_new',
                baseUpdatedAt: null,
              }
            : undefined
        }
        onSaved={onSaved}
        onRequested={onRequested}
        onClose={onClose}
      />
    </QueryClientProvider>
  )
  const view = render(show())
  return {
    user: userEvent.setup(),
    onSaved,
    onRequested,
    onClose,
    rerender: () => view.rerender(show()),
  }
}

it('未ログインでも新規登録を申請し、店舗へ直接保存しない', async () => {
  mock.status = 'signedOut'
  const { user, onSaved, onRequested } = setup(false, undefined, true)
  await chooseSelectOption(user, '貸出状況', '利用不可')
  await user.click(screen.getByRole('button', { name: '申請する' }))
  await waitFor(() => expect(onRequested).toHaveBeenCalledOnce())
  expect(mock.request).toHaveBeenCalledWith(
    {
      requestId: 'request-fixed',
      targetStoreId: 'request-fixed',
      kind: 'create',
      googlePlaceId: 'ChIJ_new',
      baseUpdatedAt: null,
    },
    expect.objectContaining({
      name: '新しい店舗',
      location: { lat: 35.68, lng: 139.76 },
      availability: 'unavailable',
    }),
  )
  expect(mock.save).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it.each([false, true])(
  '未ログインの申請では店名と住所を変更できず、元の値を送信する（既存店舗: %s）',
  async (edit) => {
    mock.status = 'signedOut'
    const { user, onRequested } = setup(edit, undefined, true)
    const name = screen.getByRole('textbox', { name: '店名' })
    const address = screen.getByRole('textbox', { name: '住所' })
    const originalName = (name as HTMLInputElement).value
    const originalAddress = (address as HTMLInputElement).value
    await user.type(name, '変更した店名')
    await user.type(address, '変更した住所')
    await chooseSelectOption(user, '貸出状況', '利用不可')
    await user.type(screen.getByLabelText('備考'), '貸出状況を確認しました')
    await user.click(screen.getByRole('button', { name: '申請する' }))
    await waitFor(() => expect(onRequested).toHaveBeenCalledOnce())
    expect(mock.request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: edit ? 'update' : 'create' }),
      expect.objectContaining({
        name: originalName,
        address: originalAddress,
        availability: 'unavailable',
        notes: expect.stringContaining('貸出状況を確認しました'),
      }),
    )
  },
)

it('管理者の直接保存では店名と住所を編集できる', async () => {
  const { user, onSaved } = setup(true)
  const name = screen.getByLabelText('店名')
  const address = screen.getByLabelText('住所')
  await user.clear(name)
  await user.type(name, '変更した店名')
  await user.clear(address)
  await user.type(address, '変更した住所')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  expect(mock.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ name: '変更した店名', address: '変更した住所' }),
  )
})

it('既存店舗の修正を申請し、失敗時も入力と申請先を維持する', async () => {
  mock.status = 'signedOut'
  mock.request
    .mockRejectedValueOnce({ code: 'permission-denied' })
    .mockResolvedValueOnce('request-fixed')
  const { user, onRequested } = setup(true, undefined, true)
  await user.clear(screen.getByLabelText('備考'))
  await user.type(screen.getByLabelText('備考'), '修正を提案した備考')
  await user.click(screen.getByRole('button', { name: '申請する' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '申請する' })).toBeEnabled(),
  )
  expect(onRequested).not.toHaveBeenCalled()
  expect(mock.refreshAccess).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '申請する' }))
  await waitFor(() => expect(onRequested).toHaveBeenCalledOnce())
  expect(mock.request).toHaveBeenCalledTimes(2)
  expect(mock.request.mock.calls[0][0]).toEqual(mock.request.mock.calls[1][0])
  expect(mock.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: 'update',
      targetStoreId: 'sample-tokyo-01',
    }),
    expect.objectContaining({
      notes: '修正を提案した備考',
      location: { lat: 35.6818, lng: 139.764 },
    }),
  )
  expect(mock.save).not.toHaveBeenCalled()
})

it.each(['loading', 'error'])(
  '認証状態が%sの場合は申請を送信できない',
  async (status) => {
    mock.status = status
    const { user } = setup(true, undefined, true)
    await user.click(screen.getByRole('button', { name: '申請する' }))
    expect(mock.request).not.toHaveBeenCalled()
  },
)

it('直接保存フォーム中にログアウトしても申請へ切り替えない', async () => {
  const { user, rerender } = setup(true)
  await user.type(screen.getByLabelText('店名'), '編集中')
  mock.status = 'signedOut'
  rerender()
  expect(screen.getByLabelText('店名')).toHaveValue(
    'サンプルコンビニ 丸の内中央店編集中',
  )
  await user.click(screen.getByRole('button', { name: '保存する' }))
  expect(mock.request).not.toHaveBeenCalled()
  expect(mock.save).not.toHaveBeenCalled()
})

it('申請フォーム中に管理者になっても直接保存へ切り替えない', async () => {
  mock.status = 'signedOut'
  const { user, rerender, onRequested } = setup(true, undefined, true)
  mock.status = 'admin'
  rerender()
  await user.click(screen.getByRole('button', { name: '申請する' }))
  await waitFor(() => expect(onRequested).toHaveBeenCalledOnce())
  expect(mock.request).toHaveBeenCalledOnce()
  expect(mock.save).not.toHaveBeenCalled()
})

it('Placesの店舗から新規登録し、選んだ設備数と初期値の0を同じIDで送信する', async () => {
  const { user, onSaved } = setup()
  await chooseSelectOption(user, '貸出状況', '利用可')
  await chooseSelectOption(user, '男性用個室（室）', '5')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('fixed-new-id'))
  expect(mock.save).toHaveBeenCalledWith(
    { id: 'fixed-new-id', googlePlaceId: 'ChIJ_new' },
    expect.objectContaining({
      name: '新しい店舗',
      address: '東京都の架空住所',
      availability: 'available',
      location: { lat: 35.68, lng: 139.76 },
      stalls: { male: 5, female: 0, shared: 0 },
      urinals: 0,
    }),
  )
  for (const field of [
    'chainName',
    'conditions',
    'genderLayout',
    'lastConfirmedAt',
  ])
    expect(mock.save.mock.calls[0][1]).not.toHaveProperty(field)
})
it('利用不可は設備入力なしで新規登録できる', async () => {
  const { user, onSaved } = setup()
  await chooseSelectOption(user, '貸出状況', '利用不可')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('fixed-new-id'))
  expect(mock.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      availability: 'unavailable',
      stalls: { male: null, female: null, shared: null },
      urinals: null,
    }),
  )
})
it('保存失敗でも編集内容を残し、再試行できる', async () => {
  mock.save
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce('sample-tokyo-01')
  const { user, onSaved } = setup(true)
  await user.clear(screen.getByLabelText('店名'))
  await user.type(screen.getByLabelText('店名'), '変更した店名')
  await chooseSelectOption(user, '男性用個室（室）', '2')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '保存する' })).toBeEnabled(),
  )
  expect(onSaved).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mock.save).toHaveBeenCalledTimes(2)
  expect(mock.save).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({
      name: '変更した店名',
      location: { lat: 35.6818, lng: 139.764 },
      stalls: expect.objectContaining({ male: 2 }),
    }),
  )
})
it('範囲外の登録済み設備数は選び直すまで保存できない', async () => {
  const { user, onSaved } = setup(true, {
    stalls: { male: 6, female: null, shared: 2 },
  })
  await user.click(screen.getByRole('button', { name: '保存する' }))
  expect(mock.save).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
  await chooseSelectOption(user, '男性用個室（室）', '5')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mock.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ stalls: { male: 5, female: 0, shared: 2 } }),
  )
})
it('利用不可から利用可に戻すと切り替え前の設備数で保存できる', async () => {
  const { user, onSaved } = setup(true)
  await chooseSelectOption(user, '男性用個室（室）', '3')
  await chooseSelectOption(user, '貸出状況', '利用不可')
  await chooseSelectOption(user, '貸出状況', '利用可')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mock.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      availability: 'available',
      stalls: expect.objectContaining({ male: 3, shared: 2 }),
    }),
  )
})
it('保存中は二重送信や入力の破棄を防ぐ', async () => {
  mock.save.mockReturnValue(new Promise(() => {}))
  const { user, onClose } = setup(true)
  await user.type(screen.getByLabelText('店名'), '変更')
  await user.dblClick(screen.getByRole('button', { name: '保存する' }))
  expect(mock.save).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: '入力を閉じる' }))
  expect(onClose).not.toHaveBeenCalled()
})
it('権限エラーで再判定を行い、入力を保持する', async () => {
  mock.save.mockRejectedValue({ code: 'permission-denied' })
  const { user } = setup(true)
  await user.type(screen.getByLabelText('店名'), '変更')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(mock.refreshAccess).toHaveBeenCalledOnce())
  expect(screen.getByLabelText('店名')).toHaveValue(
    'サンプルコンビニ 丸の内中央店変更',
  )
})

it('破棄を取り消すと入力を保持し、確定したときだけ閉じる', async () => {
  const { user, onClose } = setup(true)
  await user.type(screen.getByLabelText('店名'), '変更')
  await user.click(screen.getByRole('button', { name: '入力を閉じる' }))
  const dialog = screen.getByRole('alertdialog')
  expect(onClose).not.toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button', { name: '入力を続ける' }))
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByLabelText('店名')).toHaveValue(
    'サンプルコンビニ 丸の内中央店変更',
  )
  await user.click(screen.getByRole('button', { name: 'キャンセル' }))
  await user.click(screen.getByRole('button', { name: '破棄して閉じる' }))
  expect(onClose).toHaveBeenCalledOnce()
})
