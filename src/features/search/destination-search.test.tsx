import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationSearch } from './destination-search'

const fetchSuggestions = vi.fn()
const fetchFields = vi.fn()
const onSelect = vi.fn()
const center = { lat: 35.68, lng: 139.76 }
const label = '駅名・地名・住所・店舗名で周辺を検索'

function mockMedia(mobile: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: mobile,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

async function tick(ms = 750) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mockMedia(false)
  fetchFields.mockResolvedValue(undefined)
  fetchSuggestions.mockResolvedValue({
    suggestions: [
      {
        placePrediction: {
          placeId: 'osaka-station',
          mainText: { text: '大阪駅' },
          secondaryText: { text: '大阪府大阪市北区' },
          toPlace: () => ({
            location: { toJSON: () => ({ lat: 34.7, lng: 135.5 }) },
            fetchFields,
          }),
        },
      },
    ],
  })
  vi.stubGlobal('google', {
    maps: {
      importLibrary: vi.fn().mockResolvedValue({
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: fetchSuggestions,
        },
        AutocompleteSessionToken: class {},
      }),
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('場所検索の操作', () => {
  it('フォーカス・入力待機・クリアでも店舗一覧を維持し、受付案内を表示しない', async () => {
    render(
      <DestinationSearch center={center} onSelect={onSelect}>
        <div data-testid="stores">既存の店舗一覧</div>
      </DestinationSearch>,
    )
    const stores = screen.getByTestId('stores')
    const input = screen.getByRole('combobox')
    act(() => input.focus())
    expect(screen.getByTestId('stores')).toBe(stores)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/2文字以上|場所を選ぶと|入力を止めると/),
    ).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await tick(1000)
    expect(fetchSuggestions).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '大阪' } })
    await tick(749)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('stores')).toBe(stores)
    await tick(1)
    expect(screen.getByRole('option', { name: /大阪駅/ })).toBeVisible()
    expect(screen.getByTestId('stores')).toBe(stores)
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('stores')).toBe(stores)
    expect(
      screen.queryByText(/2文字以上|場所を選ぶと|入力を止めると/),
    ).not.toBeInTheDocument()
  })

  it('候補を自動確定せず、上下キーとEnterで選び、Google Maps帰属を表示する', async () => {
    render(<DestinationSearch center={center} onSelect={onSelect} />)
    const input = screen.getByRole('combobox', { name: label })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '大阪' } })
    await tick()
    const option = screen.getByRole('option', { name: /大阪駅/ })
    expect(option).toHaveAttribute('aria-selected', 'false')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByAltText('Google Maps')).toHaveLength(2)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(fetchFields).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(option).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', option.id)
    await act(async () => fireEvent.keyDown(input, { key: 'Enter' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      placeId: 'osaka-station',
      label: '大阪駅',
      location: { lat: 34.7, lng: 135.5 },
    })
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('IME変換中に候補を取得せず、確定のEnterでも場所を選ばない', async () => {
    render(<DestinationSearch center={center} onSelect={onSelect} />)
    const input = screen.getByRole('combobox', { name: label })
    fireEvent.focus(input)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '大阪' } })
    await tick(2000)
    expect(fetchSuggestions).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input, { data: '大阪' })
    await tick()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('候補選択後も入力のフォーカスを保ち、そのまま次の場所を入力して検索できる', async () => {
    render(<DestinationSearch center={center} onSelect={onSelect} />)
    const input = screen.getByRole('combobox', { name: label })
    act(() => input.focus())
    fireEvent.change(input, { target: { value: '大阪' } })
    await tick()
    const option = screen.getByRole('option', { name: /大阪駅/ })
    fireEvent.pointerDown(option)
    await act(async () => fireEvent.click(option))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('aria-expanded', 'false')

    fireEvent.change(input, { target: { value: '京都駅' } })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await tick(749)
    expect(fetchSuggestions).toHaveBeenCalledOnce()
    await tick(1)
    expect(fetchSuggestions).toHaveBeenCalledTimes(2)
    expect(fetchSuggestions.mock.calls[1][0].input).toBe('京都駅')
  })

  it('Escapeと外部のcloseSignalで候補を閉じ、地図の選択は変更しない', async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <DestinationSearch
        center={center}
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />,
    )
    const input = screen.getByRole('combobox', { name: label })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '大阪' } })
    await tick()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '京都' } })
    rerender(
      <DestinationSearch
        center={center}
        onSelect={onSelect}
        onOpenChange={onOpenChange}
        closeSignal={1}
      />,
    )
    await tick()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(fetchSuggestions).toHaveBeenCalledOnce()
  })

  it('スマホでは入力フォーカスで条件が現れ、閉じると同じ検索ボックスへ戻る', async () => {
    mockMedia(true)
    render(
      <DestinationSearch
        center={center}
        onSelect={onSelect}
        controls={<button>設備</button>}
      />,
    )
    const input = screen.getByRole('combobox', { name: label })
    expect(
      screen.queryByRole('button', { name: '設備' }),
    ).not.toBeInTheDocument()
    act(() => input.focus())
    expect(screen.getByRole('button', { name: '設備' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: '大阪' } })
    await tick()
    expect(screen.getByRole('option', { name: /大阪駅/ })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '検索を閉じる' }))
    expect(
      screen.queryByRole('button', { name: '設備' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: label })).toBe(input)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
