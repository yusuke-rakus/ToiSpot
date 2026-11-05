import { StrictMode, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewportSearch } from './use-viewport-search'
import type { MapViewport } from './search-area'

const initial: MapViewport = {
  center: { lat: 35.68, lng: 139.76 },
  bounds: { north: 35.7, south: 35.66, east: 139.78, west: 139.74 },
  zoom: 14,
}
let view: MapViewport
const onSearch = vi.fn()
const onSuspend = vi.fn()
const createMap = () =>
  ({
    getCenter: () => ({ toJSON: () => view.center }),
    getBounds: () => ({ toJSON: () => view.bounds }),
    getZoom: () => view.zoom,
  }) as unknown as google.maps.Map
function setup(ready = true) {
  return renderHook(
    ({ map, ready }) =>
      useViewportSearch({
        map,
        ready,
        enabled: true,
        minZoom: 13,
        onSearch,
        onSuspend,
      }),
    {
      initialProps: { map: createMap(), ready },
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>{children}</StrictMode>
      ),
    },
  )
}
beforeEach(() => {
  vi.useFakeTimers()
  view = structuredClone(initial)
  vi.clearAllMocks()
})
afterEach(() => vi.useRealTimers())

describe('表示範囲に連動する検索', () => {
  it('地図・位置取得完了を待ち、300ms後に一度だけ検索する', () => {
    const { result, rerender } = setup(false)
    act(() => vi.advanceTimersByTime(1000))
    expect(onSearch).not.toHaveBeenCalled()
    rerender({ map: createMap(), ready: true })
    act(() => vi.advanceTimersByTime(299))
    expect(onSearch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(initial)
    act(() => {
      result.current.onIdle()
      vi.advanceTimersByTime(1000)
    })
    expect(onSearch).toHaveBeenCalledOnce()
  })
  it('連続操作の最後の範囲だけを検索し、移動開始で古い処理を中断する', () => {
    const { result } = setup()
    act(() => vi.advanceTimersByTime(300))
    onSearch.mockClear()
    act(() => {
      view = { ...view, center: { lat: 35.69, lng: 139.77 } }
      result.current.onChange(view)
      result.current.onIdle()
      vi.advanceTimersByTime(200)
    })
    act(() => {
      view = { ...view, zoom: 15 }
      result.current.onChange(view)
      result.current.onIdle()
      vi.advanceTimersByTime(299)
    })
    expect(onSearch).not.toHaveBeenCalled()
    expect(onSuspend).toHaveBeenCalledWith(false)
    act(() => vi.advanceTimersByTime(1))
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(view)
  })
  it('13未満では待機・手動検索を止め、13へ戻ると再開する', () => {
    const { result } = setup()
    act(() => {
      view = { ...view, zoom: 12.9 }
      result.current.onChange(view)
      result.current.onIdle()
      result.current.searchNow()
      vi.advanceTimersByTime(1000)
    })
    expect(onSuspend).toHaveBeenLastCalledWith(true)
    expect(onSearch).not.toHaveBeenCalled()
    act(() => {
      view = { ...view, zoom: 13 }
      result.current.onChange(view)
      result.current.onIdle()
      vi.advanceTimersByTime(300)
    })
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(view)
  })
  it('店舗選択の移動・地図インスタンス交換で再検索しない', () => {
    const { result, rerender } = setup()
    act(() => vi.advanceTimersByTime(300))
    onSearch.mockClear()
    act(() => {
      const center = { lat: 35.69, lng: 139.77 }
      result.current.suppressPan(center, 15)
      view = { ...view, center, zoom: 15 }
      result.current.onChange(view)
      result.current.onIdle()
      vi.advanceTimersByTime(1000)
    })
    rerender({ map: createMap(), ready: true })
    act(() => vi.advanceTimersByTime(1000))
    expect(onSearch).not.toHaveBeenCalled()
    act(() => {
      result.current.searchNow()
      result.current.onIdle()
      vi.advanceTimersByTime(1000)
    })
    expect(onSearch).toHaveBeenCalledExactlyOnceWith(view)
  })
  it('アンマウントしたら待機要求を送信しない', () => {
    const { unmount } = setup()
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(onSearch).not.toHaveBeenCalled()
  })
})
