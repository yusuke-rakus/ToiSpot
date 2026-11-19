import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createTestStores } from '../../../tests/fixtures/stores'
import type { MapEntry } from '../places/map-entries'
import { StorePanel } from './store-panel'

type Props = ComponentProps<typeof StorePanel>
const { id, data } = createTestStores('2026-11-03T00:00:00.000Z')[0]
const store = { ...data, id }
const registered: MapEntry = {
  key: `store:${id}`,
  name: store.name,
  location: store.location,
  registration: 'registered',
  store,
}
const unregistered: MapEntry = {
  key: 'place:unregistered',
  name: 'ローソン 未登録店',
  location: store.location,
  registration: 'missing',
  place: {
    id: 'unregistered',
    name: 'ローソン 未登録店',
    address: '東京都千代田区',
    location: store.location,
    attributions: [],
  },
}

function props(overrides: Partial<Props> = {}): Props {
  return {
    query: {
      data: { stores: [store], invalidCount: 0, truncated: false },
      enabled: true,
      isPending: false,
      isFetching: false,
      isError: false,
    } as Props['query'],
    selectedContent: null,
    entries: [registered, unregistered],
    placesStatus: 'success',
    onSelectStore: vi.fn(),
    onSelectPlace: vi.fn(),
    onRefresh: vi.fn(),
    onRetryPlaces: vi.fn(),
    registrationFetching: false,
    registrationError: false,
    ...overrides,
  }
}

describe('検索結果の店舗一覧', () => {
  it('登録済みと未登録を合わせた件数と住所・検索地点からの距離を表示する', () => {
    render(<StorePanel {...props({ searchCenter: store.location })} />)
    expect(screen.getByText('2件')).toBeInTheDocument()
    expect(screen.getByText('登録店舗 1件')).toBeInTheDocument()
    expect(screen.getByText(store.address)).toBeVisible()
    expect(screen.getByText('東京都千代田区')).toBeVisible()
    expect(screen.getAllByText('検索地点から約0m（直線距離）')).toHaveLength(2)
    expect(screen.getByText('データなし')).toBeVisible()
    expect(
      screen.getByRole('button', { name: `${store.name}の詳細を見る` }),
    ).toHaveAccessibleDescription('利用可 検索地点から約0m（直線距離）')
    expect(
      screen.getByRole('button', { name: `${unregistered.name}の詳細を見る` }),
    ).toHaveAccessibleDescription('データなし 検索地点から約0m（直線距離）')
    expect(
      screen.queryByRole('heading', { name: 'トイレ情報' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '店舗情報を更新' }),
    ).not.toBeInTheDocument()
  })

  it('条件に一致する結果がなくても検索を再試行できる', async () => {
    const user = userEvent.setup()
    const onClearFilters = vi.fn()
    const onRetryPlaces = vi.fn()
    render(
      <StorePanel
        {...props({
          entries: [],
          unfilteredEntries: [registered, unregistered],
          hasFilters: true,
          onClearFilters,
          onRetryPlaces,
          placesStatus: 'error',
        })}
      />,
    )
    expect(
      screen.getByText('取得できた店舗に、条件に一致する店舗はありません。'),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'コンビニ検索を再試行' }),
    )
    expect(onRetryPlaces).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '検索条件を解除' }))
    expect(onClearFilters).toHaveBeenCalledOnce()
  })
})
