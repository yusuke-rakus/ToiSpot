import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DestinationSearch } from './destination-search'

const fetchSuggestions = vi.fn()
const fetchFields = vi.fn()
const onSelect = vi.fn()
const center = { lat: 35.68, lng: 139.76 }
const label = '駅名・地名・住所・店舗名で周辺を検索'

async function tick(ms = 750) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
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
  it('候補を選ぶ前は確定せず、候補の選択で地図へ座標を渡す', async () => {
    render(<DestinationSearch center={center} onSelect={onSelect} />)
    const input = screen.getByRole('combobox', { name: label })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '大阪' } })
    await tick()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(fetchFields).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await act(async () => fireEvent.keyDown(input, { key: 'Enter' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      placeId: 'osaka-station',
      label: '大阪駅',
      location: { lat: 34.7, lng: 135.5 },
    })
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

  it('候補のキャンセルで場所を確定せず、外部から閉じたときは保留中の検索も止める', async () => {
    const { rerender } = render(
      <DestinationSearch center={center} onSelect={onSelect} />,
    )
    const input = screen.getByRole('combobox', { name: label })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '大阪' } })
    await tick()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(fetchFields).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '京都' } })
    rerender(
      <DestinationSearch center={center} onSelect={onSelect} closeSignal={1} />,
    )
    await tick()
    expect(fetchSuggestions).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
