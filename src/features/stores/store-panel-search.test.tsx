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
    selectedStore: null,
    pointContent: null,
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
      screen.queryByRole('heading', { name: 'トイレ情報' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '店舗情報を更新' }),
    ).not.toBeInTheDocument()
  })

  it('条件一致なしと取得失敗を区別し、元の結果を根拠に前回取得の案内を保つ', async () => {
    const user = userEvent.setup()
    const onClearFilters = vi.fn()
    render(
      <StorePanel
        {...props({
          entries: [],
          unfilteredEntries: [registered, unregistered],
          hasFilters: true,
          onClearFilters,
          placesStatus: 'error',
          viewportSearch: true,
          placesLimited: true,
        })}
      />,
    )
    expect(
      screen.getByText('取得できた店舗に、条件に一致する店舗はありません。'),
    ).toBeVisible()
    expect(screen.getByText('コンビニを検索できませんでした。')).toBeVisible()
    expect(
      screen.getByText('前回取得したコンビニを表示しています。'),
    ).toBeVisible()
    expect(
      screen.getByText(
        '取得上限に達したため、一部のコンビニを表示しています。',
      ),
    ).toBeVisible()
    expect(
      screen.queryByText('周辺にコンビニが見つかりません。'),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '検索条件を解除' }))
    expect(onClearFilters).toHaveBeenCalledOnce()
  })
})
