import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { StoreEditor } from './store-editor'
import { createTestStores } from '../../../tests/fixtures/stores'

const mock = vi.hoisted(() => ({
  save: vi.fn(),
  status: 'admin',
  refreshAccess: vi.fn(),
}))
vi.mock('../auth/admin-provider', () => ({
  useAdmin: () => ({ status: mock.status, refreshAccess: mock.refreshAccess }),
}))
vi.mock('./store-writer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./store-writer')>()),
  saveLocalStore: (...args: unknown[]) => mock.save(...args),
}))
beforeEach(() => {
  vi.clearAllMocks()
  mock.status = 'admin'
  mock.save.mockResolvedValue('fixed-new-id')
})
function setup(edit = false) {
  const onSaved = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  const original = {
    ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
    id: 'sample-tokyo-01',
  }
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
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
        onSaved={onSaved}
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onSaved, onClose }
}
it('Placesの店舗から新規登録し、空欄と0を区別して同じIDで送信する', async () => {
  const { user, onSaved } = setup()
  expect(screen.getByLabelText('店名')).toHaveValue('新しい店舗')
  expect(screen.queryByLabelText('緯度')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('経度')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('チェーン名')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('利用条件')).not.toBeInTheDocument()
  expect(
    Array.from((screen.getByLabelText('貸出状況') as HTMLSelectElement).options)
      .filter((option) => !option.disabled)
      .map((option) => option.text),
  ).toEqual(['利用可', '利用不可'])
  await user.selectOptions(screen.getByLabelText('コンビニの種類'), 'ローソン')
  await user.selectOptions(screen.getByLabelText('貸出状況'), 'unavailable')
  await user.type(screen.getByLabelText('男性用個室（室）'), '0')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('fixed-new-id'))
  expect(mock.save).toHaveBeenCalledWith(
    { id: 'fixed-new-id', googlePlaceId: 'ChIJ_new' },
    expect.objectContaining({
      chainName: 'ローソン',
      availability: 'unavailable',
      conditions: '',
      location: { lat: 35.68, lng: 139.76 },
      stalls: { male: 0, female: null, shared: null },
      lastConfirmedAt: null,
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
  await user.click(screen.getByRole('button', { name: '保存する' }))
  expect(await screen.findByText(/保存できませんでした/)).toBeVisible()
  expect(screen.getByLabelText('店名')).toHaveValue('変更した店名')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mock.save).toHaveBeenCalledTimes(2)
  expect(mock.save).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ location: { lat: 35.6818, lng: 139.764 } }),
  )
})
it('未確認チェックの切り替えで確認日の入力と保存を連動する', async () => {
  const { user, onSaved } = setup(true)
  expect(screen.getByLabelText('最終確認日')).toBeDisabled()
  await user.click(screen.getByLabelText('最終確認日は未確認'))
  expect(screen.getByLabelText('最終確認日')).toBeEnabled()
  await user.type(screen.getByLabelText('最終確認日'), '2026-11-03')
  await user.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalled())
  expect(mock.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ lastConfirmedAt: '2026-11-02T15:00:00.000Z' }),
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
