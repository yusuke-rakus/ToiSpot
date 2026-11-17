import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDestinationSearch } from './use-destination-search'

const center = { lat: 35.68, lng: 139.76 }
const selectedLocation = { lat: 34.7, lng: 135.5 }
const fetchSuggestions = vi.fn()
const importLibrary = vi.fn()
const onSelect = vi.fn()
let tokenCount = 0

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function createSuggestion(id = 'osaka', label = '大阪駅') {
  const fetchFields = vi.fn().mockResolvedValue(undefined)
  const place = {
    location: { toJSON: () => selectedLocation },
    fetchFields,
  }
  const prediction = {
    placeId: id,
    mainText: { text: label },
    text: { text: `${label} 日本` },
    secondaryText: null,
    toPlace: vi.fn(() => place),
  }
  return { result: { placePrediction: prediction }, prediction, place }
}

function setup() {
  return renderHook(() => useDestinationSearch({ center, onSelect }))
}

async function tick(ms = 750) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  tokenCount = 0
  importLibrary.mockResolvedValue({
    AutocompleteSuggestion: {
      fetchAutocompleteSuggestions: fetchSuggestions,
    },
    AutocompleteSessionToken: class {
      id = ++tokenCount
    },
  })
  fetchSuggestions.mockResolvedValue({ suggestions: [] })
  vi.stubGlobal('google', { maps: { importLibrary } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('場所候補の検索', () => {
  it('入力2文字以上・停止750ms後に、日本全国を対象として検索する', async () => {
    const { result } = setup()
    await tick()
    expect(importLibrary).not.toHaveBeenCalled()
    act(() => {
      result.current.begin()
      result.current.setQuery('新')
    })
    await tick()
    expect(fetchSuggestions).not.toHaveBeenCalled()
    act(() => result.current.setQuery(' 新宿 '))
    await tick(749)
    expect(fetchSuggestions).not.toHaveBeenCalled()
    await tick(1)
    expect(fetchSuggestions).toHaveBeenCalledExactlyOnceWith({
      input: '新宿',
      sessionToken: expect.any(Object),
      includedRegionCodes: ['jp'],
      language: 'ja',
      region: 'jp',
      locationBias: { center, radius: 5000 },
    })
    expect(result.current.status).toBe('success')
  })

  it('連続入力では最後の入力から750ms待ち、日本語変換中は検索しない', async () => {
    const { result } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('新宿')
    })
    await tick(500)
    act(() => result.current.setQuery('新宿駅'))
    await tick(749)
    expect(fetchSuggestions).not.toHaveBeenCalled()
    act(() => result.current.setComposing(true))
    await tick(1000)
    expect(fetchSuggestions).not.toHaveBeenCalled()
    act(() => result.current.setComposing(false))
    await tick(749)
    expect(fetchSuggestions).not.toHaveBeenCalled()
    await tick(1)
    expect(fetchSuggestions).toHaveBeenCalledOnce()
    expect(fetchSuggestions.mock.calls[0][0].input).toBe('新宿駅')
  })

  it('同じ検索操作はtokenを共有し、クリア・キャンセル後は新しくする', async () => {
    const { result } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('新宿')
    })
    await tick()
    const firstToken = fetchSuggestions.mock.calls[0][0].sessionToken
    act(() => result.current.setQuery('新宿駅'))
    await tick()
    expect(fetchSuggestions.mock.calls[1][0].sessionToken).toBe(firstToken)
    act(() => result.current.setQuery(''))
    await tick()
    expect(fetchSuggestions).toHaveBeenCalledTimes(2)
    act(() => result.current.setQuery('大阪'))
    await tick()
    const nextToken = fetchSuggestions.mock.calls[2][0].sessionToken
    expect(nextToken).not.toBe(firstToken)
    act(() => result.current.cancel())
    act(() => {
      result.current.begin()
      result.current.setQuery('京都')
    })
    await tick()
    expect(fetchSuggestions.mock.calls[3][0].sessionToken).not.toBe(nextToken)
  })

  it('古い入力の応答が新しい候補を上書きせず、クリア後も復活しない', async () => {
    const oldResponse = deferred<{ suggestions: unknown[] }>()
    const latestResponse = deferred<{ suggestions: unknown[] }>()
    fetchSuggestions
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(latestResponse.promise)
    const { result } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('新宿')
    })
    await tick()
    act(() => result.current.setQuery('大阪'))
    await tick()
    await act(async () => {
      latestResponse.resolve({ suggestions: [createSuggestion().result] })
    })
    expect(result.current.suggestions[0].label).toBe('大阪駅')
    await act(async () => {
      oldResponse.resolve({
        suggestions: [createSuggestion('shinjuku', '新宿駅').result],
      })
    })
    expect(result.current.suggestions[0].label).toBe('大阪駅')
    act(() => result.current.setQuery(''))
    expect(result.current.suggestions).toEqual([])
  })

  it('元のpredictionからlocationだけを取得し、選択後は新しいセッションになる', async () => {
    const suggestion = createSuggestion()
    fetchSuggestions.mockResolvedValue({ suggestions: [suggestion.result] })
    const { result } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('大阪')
    })
    await tick()
    const firstToken = fetchSuggestions.mock.calls[0][0].sessionToken
    await act(async () => {
      await result.current.select(result.current.suggestions[0])
    })
    expect(suggestion.prediction.toPlace).toHaveBeenCalledOnce()
    expect(suggestion.place.fetchFields).toHaveBeenCalledExactlyOnceWith({
      fields: ['location'],
    })
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({
      placeId: 'osaka',
      label: '大阪駅',
      location: selectedLocation,
    })
    expect(result.current.open).toBe(false)
    act(() => {
      result.current.begin()
      result.current.setQuery('京都')
    })
    await tick()
    expect(fetchSuggestions.mock.calls[1][0].sessionToken).not.toBe(firstToken)
    act(() => result.current.cancel())
    expect(result.current.query).toBe('大阪駅')
  })

  it('座標取得失敗で選択せず、再検索には新しいtokenを使う', async () => {
    const suggestion = createSuggestion()
    suggestion.place.fetchFields.mockRejectedValue(new Error('secret URL'))
    fetchSuggestions.mockResolvedValue({ suggestions: [suggestion.result] })
    const { result } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('大阪')
    })
    await tick()
    const oldToken = fetchSuggestions.mock.calls[0][0].sessionToken
    await act(async () => {
      await result.current.select(result.current.suggestions[0])
    })
    expect(onSelect).not.toHaveBeenCalled()
    expect(result.current.open).toBe(true)
    expect(result.current.error).toContain('位置を取得できませんでした')
    expect(result.current.error).not.toContain('secret')
    act(() => result.current.retrySearch())
    await tick()
    expect(fetchSuggestions.mock.calls[1][0].sessionToken).not.toBe(oldToken)
  })

  it('選択済みの場所を再び開くだけでは検索せず、実際の入力編集後に検索する', async () => {
    fetchSuggestions.mockResolvedValue({
      suggestions: [createSuggestion().result],
    })
    const { result } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('大阪')
    })
    await tick()
    await act(async () => {
      await result.current.select(result.current.suggestions[0])
    })
    act(() => result.current.begin())
    expect(result.current.query).toBe('大阪駅')
    await tick(2000)
    expect(fetchSuggestions).toHaveBeenCalledOnce()
    act(() => result.current.setQuery('京都駅'))
    await tick(749)
    expect(fetchSuggestions).toHaveBeenCalledOnce()
    await tick(1)
    expect(fetchSuggestions).toHaveBeenCalledTimes(2)
    expect(fetchSuggestions.mock.calls[1][0].input).toBe('京都駅')
  })

  it('検索をキャンセルして復元した場所を開いても問い合わせず、明示的な再検索で取得する', async () => {
    fetchSuggestions.mockResolvedValue({
      suggestions: [createSuggestion().result],
    })
    const { result } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('大阪')
    })
    await tick()
    await act(async () => {
      await result.current.select(result.current.suggestions[0])
    })
    act(() => {
      result.current.begin()
      result.current.setQuery('新宿')
    })
    await tick(300)
    act(() => result.current.cancel())
    act(() => result.current.begin())
    expect(result.current.query).toBe('大阪駅')
    await tick(2000)
    expect(fetchSuggestions).toHaveBeenCalledOnce()
    act(() => result.current.retrySearch())
    await tick(749)
    expect(fetchSuggestions).toHaveBeenCalledOnce()
    await tick(1)
    expect(fetchSuggestions).toHaveBeenCalledTimes(2)
    expect(fetchSuggestions.mock.calls[1][0].input).toBe('大阪駅')
  })

  it('キャンセル後に遅れて返った座標を選択せず、アンマウントで待機要求を送らない', async () => {
    const response = deferred<undefined>()
    const suggestion = createSuggestion()
    suggestion.place.fetchFields.mockReturnValue(response.promise)
    fetchSuggestions.mockResolvedValue({ suggestions: [suggestion.result] })
    const { result, unmount } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('大阪')
    })
    await tick()
    act(() => void result.current.select(result.current.suggestions[0]))
    act(() => result.current.cancel())
    await act(async () => response.resolve(undefined))
    expect(onSelect).not.toHaveBeenCalled()
    act(() => {
      result.current.begin()
      result.current.setQuery('京都')
    })
    unmount()
    await tick()
    expect(fetchSuggestions).toHaveBeenCalledOnce()
  })

  it('候補取得の失敗を安全なメッセージで表示し、自動で再試行しない', async () => {
    fetchSuggestions.mockRejectedValue(new Error('request URL with key'))
    const { result } = setup()
    act(() => {
      result.current.begin()
      result.current.setQuery('大阪')
    })
    await tick()
    expect(result.current.error).toBe(
      '場所の候補を取得できませんでした。もう一度お試しください。',
    )
    await tick(2000)
    expect(fetchSuggestions).toHaveBeenCalledOnce()
  })
})
