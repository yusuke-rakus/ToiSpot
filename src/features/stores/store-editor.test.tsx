import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { StoreEditor } from './store-editor'
import type { Store } from './store-schema'
import { createTestStores } from '../../../tests/fixtures/stores'
import { chooseSelectOption, openSelect } from '../../../tests/select'

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
  expect(screen.getByRole('dialog', { name: '登録を申請' })).toBeVisible()
  expect(screen.getByText(/管理者が承認した後に地図へ反映/)).toBeVisible()
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

it('既存店舗の修正を申請し、失敗時も入力と申請先を維持する', async () => {
  mock.status = 'signedOut'
  mock.request
    .mockRejectedValueOnce({ code: 'permission-denied' })
    .mockResolvedValueOnce('request-fixed')
  const { user, onRequested } = setup(true, undefined, true)
  await user.clear(screen.getByLabelText('店名'))
  await user.type(screen.getByLabelText('店名'), '修正を提案した店名')
  await user.click(screen.getByRole('button', { name: '申請する' }))
  expect(
    await screen.findByText(/店舗情報が更新・登録された可能性/),
  ).toBeVisible()
  expect(screen.getByLabelText('店名')).toHaveValue('修正を提案した店名')
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
      name: '修正を提案した店名',
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
    expect(screen.getByRole('button', { name: '申請する' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '申請する' }))
    expect(mock.request).not.toHaveBeenCalled()
  },
)

it('直接保存フォーム中にログアウトしても申請へ切り替えない', async () => {
  const { user, rerender } = setup(true)
  await user.type(screen.getByLabelText('店名'), '編集中')
  mock.status = 'signedOut'
  rerender()
  expect(screen.getByRole('button', { name: '保存する' })).toBeDisabled()
  expect(
    screen.queryByRole('button', { name: '申請する' }),
  ).not.toBeInTheDocument()
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
  expect(screen.getByLabelText('店名')).toHaveValue('新しい店舗')
  expect(screen.queryByLabelText('緯度')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('経度')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('コンビニの種類')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('利用条件')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('設備区分')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('最終確認日')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('男性用個室（室）')).not.toBeInTheDocument()
  const availabilityOptions = await openSelect(user, '貸出状況')
  expect(
    availabilityOptions
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['利用可', '利用不可'])
  await user.keyboard('{Escape}')
  await chooseSelectOption(user, '貸出状況', '利用可')
  for (const label of [
    '男性用個室（室）',
    '女性用個室（室）',
    '共用個室（室）',
    '男性用小便器（基）',
  ]) {
    const select = screen.getByRole('combobox', { name: label })
    expect(select).toHaveTextContent(/^0$/)
    const options = await openSelect(user, label)
    expect(
      options.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['0', '1', '2', '3', '4', '5'])
    await user.keyboard('{Escape}')
  }
  await chooseSelectOption(user, '男性用個室（室）', '5')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('fixed-new-id'))
  expect(mock.save).toHaveBeenCalledWith(
    { id: 'fixed-new-id', googlePlaceId: 'ChIJ_new' },
    expect.objectContaining({
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
  expect(screen.queryByLabelText('男性用個室（室）')).not.toBeInTheDocument()
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
  expect(await screen.findByText(/保存できませんでした/)).toBeVisible()
  expect(screen.getByLabelText('店名')).toHaveValue('変更した店名')
  expect(screen.getByLabelText('男性用個室（室）')).toHaveTextContent(/^2$/)
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mock.save).toHaveBeenCalledTimes(2)
  expect(mock.save).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ location: { lat: 35.6818, lng: 139.764 } }),
  )
})
it('範囲外の登録済み設備数は選び直すまで保存できない', async () => {
  const { user, onSaved } = setup(true, {
    stalls: { male: 6, female: null, shared: 2 },
  })
  const select = screen.getByLabelText('男性用個室（室）')
  expect(select).toHaveTextContent('登録済み（6）')
  const options = await openSelect(user, '男性用個室（室）')
  expect(
    options.getByRole('option', { name: '登録済み（6）' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await user.keyboard('{Escape}')
  expect(screen.getByLabelText('女性用個室（室）')).toHaveTextContent(/^0$/)
  await user.click(screen.getByRole('button', { name: '保存する' }))
  expect(await screen.findByText('0〜5から選択してください')).toBeVisible()
  expect(mock.save).not.toHaveBeenCalled()
  await chooseSelectOption(user, '男性用個室（室）', '5')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mock.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ stalls: { male: 5, female: 0, shared: 2 } }),
  )
})
it('貸出状況を切り替えても選択を保持し、利用不可では設備数をnullにして保存する', async () => {
  const { user, onSaved } = setup(true)
  await chooseSelectOption(user, '男性用個室（室）', '3')
  await chooseSelectOption(user, '貸出状況', '利用不可')
  expect(screen.queryByLabelText('男性用個室（室）')).not.toBeInTheDocument()
  await chooseSelectOption(user, '貸出状況', '利用可')
  expect(screen.getByLabelText('男性用個室（室）')).toHaveTextContent(/^3$/)
  expect(screen.getByLabelText('共用個室（室）')).toHaveTextContent(/^2$/)
  await chooseSelectOption(user, '貸出状況', '利用不可')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mock.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      availability: 'unavailable',
      stalls: { male: null, female: null, shared: null },
      urinals: null,
    }),
  )
})
it('保存中の連打と閉じる操作を抑え、未保存の破棄を確認する', async () => {
  mock.save.mockReturnValue(new Promise(() => {}))
  const { user, onClose } = setup(true)
  await user.type(screen.getByLabelText('店名'), '変更')
  await user.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(screen.getByText('未保存の入力を破棄しますか？')).toBeVisible()
  expect(onClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '入力を続ける' }))
  await user.dblClick(screen.getByRole('button', { name: '保存する' }))
  expect(mock.save).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '入力を閉じる' })).toBeDisabled()
})
it('権限エラーで再判定を行い、入力を保持する', async () => {
  mock.save.mockRejectedValue({ code: 'permission-denied' })
  const { user } = setup(true)
  await user.click(screen.getByRole('button', { name: '保存する' }))
  expect(await screen.findByText(/保存する権限がありません/)).toBeVisible()
  expect(mock.refreshAccess).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('店名')).toHaveValue(
    'サンプルコンビニ 丸の内中央店',
  )
})

it('破棄確認は安全な選択肢にフォーカスし、Escapeで編集へ戻れる', async () => {
  const { user, onClose } = setup(true)
  await user.type(screen.getByLabelText('店名'), '変更')
  await user.click(screen.getByRole('button', { name: '入力を閉じる' }))
  const dialog = screen.getByRole('alertdialog', {
    name: '未保存の入力を破棄しますか？',
  })
  expect(
    within(dialog).getByRole('button', { name: '入力を続ける' }),
  ).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByLabelText('店名')).toHaveValue(
    'サンプルコンビニ 丸の内中央店変更',
  )
  expect(screen.getByRole('button', { name: '入力を閉じる' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'キャンセル' }))
  await user.click(screen.getByRole('button', { name: '破棄して閉じる' }))
  expect(onClose).toHaveBeenCalledOnce()
})
