import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ArrowLeft, MapPin, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { MapPoint } from '@/features/map/map-config'
import {
  useDestinationSearch,
  type SearchDestination,
} from './use-destination-search'

const mobileQuery = '(width < 64rem)'
const inputLabel = '駅名・地名・住所・店舗名で周辺を検索'

function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(mobileQuery)
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

function isMobile() {
  return window.matchMedia?.(mobileQuery).matches ?? false
}

export function DestinationSearch({
  center,
  disabled = false,
  onSelect,
  onOpenChange,
  closeSignal = 0,
  controls,
  children,
  filterOpen = false,
  filterCount = 0,
}: {
  center: MapPoint
  disabled?: boolean
  onSelect: (destination: SearchDestination) => void
  onOpenChange?: (open: boolean) => void
  closeSignal?: number
  controls?: ReactNode
  children?: ReactNode
  filterOpen?: boolean
  filterCount?: number
}) {
  const search = useDestinationSearch({
    center,
    enabled: !disabled,
    onSelect: (destination) => {
      onSelect(destination)
      if (mobile) inputRef.current?.blur()
    },
  })
  const mobile = useSyncExternalStore(subscribe, isMobile, () => false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousCloseSignal = useRef(closeSignal)
  const onOpenChangeRef = useRef(onOpenChange)
  const id = useId()
  const listId = `${id}-destinations`
  const busy = search.status === 'loading' || search.status === 'selecting'
  const { cancel, open } = search

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])
  useEffect(() => {
    onOpenChangeRef.current?.(open)
  }, [open])
  useEffect(() => {
    if (previousCloseSignal.current !== closeSignal || disabled) cancel()
    previousCloseSignal.current = closeSignal
  }, [closeSignal, disabled, cancel])
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target) &&
        !(
          event.target instanceof Element &&
          event.target.closest('[data-map-filter-popover]')
        )
      )
        cancel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, cancel])

  const showSuggestions =
    search.open && !filterOpen && !search.composing && search.status !== 'idle'
  const activeSuggestion = search.suggestions[activeIndex]

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (
      event.nativeEvent.isComposing ||
      search.composing ||
      event.keyCode === 229
    )
      return
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      if (mobile) inputRef.current?.blur()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      search.begin()
      if (search.suggestions.length > 0)
        setActiveIndex((current) =>
          event.key === 'ArrowDown'
            ? (current + 1) % search.suggestions.length
            : (current <= 0 ? search.suggestions.length : current) - 1,
        )
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (showSuggestions && activeSuggestion && !busy)
        void search.select(activeSuggestion)
    }
  }

  function renderInput() {
    return (
      <div className="relative flex min-w-0 flex-1 items-center">
        {search.open ? (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0.5 z-10 size-11"
            aria-label="検索を閉じる"
            onClick={() => {
              cancel()
              inputRef.current?.blur()
            }}
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        ) : (
          <Search
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <Input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={inputLabel}
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={
            showSuggestions && activeSuggestion
              ? `${listId}-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          enterKeyHint="search"
          placeholder="駅・地名・店名で検索"
          className="h-12 rounded-none border-0 bg-transparent pl-10 pr-20 text-base shadow-none focus-visible:ring-0"
          value={search.query}
          disabled={disabled}
          onFocus={() => {
            setActiveIndex(-1)
            search.begin()
          }}
          onChange={(event) => {
            setActiveIndex(-1)
            search.begin()
            search.setQuery(event.target.value)
          }}
          onCompositionStart={() => {
            setActiveIndex(-1)
            search.setComposing(true)
          }}
          onCompositionEnd={(event) => {
            search.begin()
            search.setQuery(event.currentTarget.value)
            search.setComposing(false)
          }}
          onKeyDown={handleKeyDown}
        />
        {mobile && !search.open && filterCount > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-11 size-11 text-xs"
            aria-label={`適用中の条件${filterCount}項目を表示`}
            onClick={() => search.begin()}
          >
            {filterCount}
          </Button>
        )}
        {search.query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0.5 size-10"
            aria-label="場所の入力をクリア"
            onClick={() => {
              setActiveIndex(-1)
              search.setQuery('')
              search.begin()
              inputRef.current?.focus()
            }}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    )
  }

  function renderSuggestions() {
    const statusMessage =
      search.status === 'loading'
        ? '場所の候補を検索中'
        : search.status === 'selecting'
          ? '選んだ場所の位置を確認中'
          : (search.error ??
            (search.suggestions.length > 0
              ? `${search.suggestions.length}件の候補があります。`
              : '候補が見つかりません。地名や住所を変えてお試しください。'))
    return (
      <>
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          {busy && <Spinner aria-hidden="true" />}
          <p role="status" aria-live="polite" aria-atomic="true">
            {statusMessage}
          </p>
        </div>
        <ul id={listId} role="listbox" aria-label="場所の候補" className="py-1">
          {search.suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              aria-disabled={search.status === 'selecting'}
              className={`flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted ${index === activeIndex ? 'bg-muted' : ''} ${search.status === 'selecting' ? 'pointer-events-none opacity-60' : ''}`}
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => {
                if (!busy) void search.select(suggestion)
              }}
            >
              <MapPin
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">{suggestion.label}</p>
                {suggestion.description && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {suggestion.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {search.status === 'error' && (
          <div className="px-4 pb-3">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                setActiveIndex(-1)
                search.retrySearch()
              }}
            >
              候補を再検索
            </Button>
          </div>
        )}
        <div className="flex shrink-0 justify-end border-t px-4 pt-3 pb-2">
          <img
            src={`${import.meta.env.BASE_URL}icons/google-maps-dark.svg`}
            alt="Google Maps"
            className="h-4 w-auto dark:hidden"
          />
          <img
            src={`${import.meta.env.BASE_URL}icons/google-maps-light.svg`}
            alt="Google Maps"
            className="hidden h-4 w-auto dark:block"
          />
        </div>
      </>
    )
  }

  return (
    <div
      ref={rootRef}
      className="flex max-h-[var(--search-available-height,70dvh)] min-h-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-lg"
      data-map-search-panel=""
      onBlur={(event) => {
        const next = event.relatedTarget
        if (
          next instanceof Node &&
          (event.currentTarget.contains(next) ||
            (next instanceof Element &&
              next.closest('[data-map-filter-popover]')))
        )
          return
        if (next) cancel()
      }}
    >
      <div className="flex shrink-0 items-center">{renderInput()}</div>
      <div
        className={`${search.open || filterOpen ? '' : 'hidden lg:block'} shrink-0 border-t px-3 py-2`}
        data-map-filter-row=""
        hidden={mobile && !search.open && !filterOpen}
      >
        {controls}
      </div>
      {showSuggestions && (
        <div className="max-h-[40dvh] min-h-0 shrink-0 overflow-y-auto overscroll-contain border-t">
          {renderSuggestions()}
        </div>
      )}
      <div className="hidden min-h-0 overflow-hidden lg:flex lg:flex-1 lg:flex-col">
        {children}
      </div>
    </div>
  )
}
