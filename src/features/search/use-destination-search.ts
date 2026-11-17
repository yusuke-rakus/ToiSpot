import { useCallback, useEffect, useRef, useState } from 'react'
import type { MapPoint } from '@/features/map/map-config'

export const DESTINATION_SEARCH_DELAY_MS = 750

export type SearchDestination = {
  placeId: string
  label: string
  location: MapPoint
}

export type DestinationSuggestion = {
  id: string
  label: string
  description: string
  prediction: google.maps.places.PlacePrediction
}

type SearchStatus = 'idle' | 'loading' | 'success' | 'error' | 'selecting'

export function useDestinationSearch({
  center,
  enabled = true,
  onSelect,
}: {
  center: MapPoint
  enabled?: boolean
  onSelect: (destination: SearchDestination) => void
}) {
  const [query, setQueryValue] = useState('')
  const [open, setOpen] = useState(false)
  const [composing, setComposingValue] = useState(false)
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [hasSearchInput, setHasSearchInput] = useState(false)
  const generation = useRef(0)
  const selecting = useRef(false)
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  )
  const committedLabel = useRef('')
  const centerRef = useRef(center)
  const selectRef = useRef(onSelect)
  const mounted = useRef(false)

  useEffect(() => {
    centerRef.current = center
    selectRef.current = onSelect
  }, [center, onSelect])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
      session.current = null
    }
  }, [])

  const resetResults = useCallback(() => {
    generation.current += 1
    selecting.current = false
    setSuggestions([])
    setStatus('idle')
    setError(null)
  }, [])

  const setQuery = useCallback(
    (value: string) => {
      resetResults()
      if (!value.trim()) session.current = null
      setHasSearchInput(Boolean(value.trim()))
      setQueryValue(value)
    },
    [resetResults],
  )

  const setComposing = useCallback(
    (value: boolean) => {
      resetResults()
      setComposingValue(value)
      if (!value) setHasSearchInput(true)
    },
    [resetResults],
  )

  const begin = useCallback(() => {
    if (enabled) setOpen(true)
  }, [enabled])

  const cancel = useCallback(() => {
    resetResults()
    session.current = null
    setHasSearchInput(false)
    setComposingValue(false)
    setQueryValue(committedLabel.current)
    setOpen(false)
  }, [resetResults])

  useEffect(() => {
    if (!enabled) {
      generation.current += 1
      selecting.current = false
      session.current = null
    }
  }, [enabled])

  useEffect(() => {
    const input = query.trim()
    if (!enabled || !open || !hasSearchInput || composing || input.length < 2)
      return
    const requestGeneration = ++generation.current
    const timer = window.setTimeout(async () => {
      setStatus('loading')
      setError(null)
      try {
        if (typeof google === 'undefined' || !google.maps?.importLibrary)
          throw new Error('Maps unavailable')
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await google.maps.importLibrary(
            'places',
          )) as google.maps.PlacesLibrary
        if (!mounted.current || generation.current !== requestGeneration) return
        session.current ??= new AutocompleteSessionToken()
        const { suggestions: results } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: session.current,
            includedRegionCodes: ['jp'],
            language: 'ja',
            region: 'jp',
            locationBias: { center: centerRef.current, radius: 5000 },
          })
        if (!mounted.current || generation.current !== requestGeneration) return
        setSuggestions(
          results
            .flatMap(({ placePrediction }) =>
              placePrediction
                ? [
                    {
                      id: placePrediction.placeId,
                      label:
                        placePrediction.mainText?.text ??
                        placePrediction.text.text,
                      description: placePrediction.secondaryText?.text ?? '',
                      prediction: placePrediction,
                    },
                  ]
                : [],
            )
            .slice(0, 5),
        )
        setStatus('success')
      } catch {
        if (!mounted.current || generation.current !== requestGeneration) return
        // SDKのエラーにはリクエストURL等が含まれるため、画面やログへ出さない。
        setSuggestions([])
        setStatus('error')
        setError('場所の候補を取得できませんでした。もう一度お試しください。')
      }
    }, DESTINATION_SEARCH_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      if (generation.current === requestGeneration) generation.current += 1
    }
  }, [query, open, composing, enabled, retry, hasSearchInput])

  const select = useCallback(async (suggestion: DestinationSuggestion) => {
    if (selecting.current) return
    selecting.current = true
    const requestGeneration = ++generation.current
    setHasSearchInput(false)
    setStatus('selecting')
    setError(null)
    // fetchFieldsでセッションが終了する。失敗してもこのtokenを再利用しない。
    session.current = null
    try {
      const place = suggestion.prediction.toPlace()
      await place.fetchFields({ fields: ['location'] })
      if (!mounted.current || generation.current !== requestGeneration) return
      const location = place.location?.toJSON()
      if (
        !location ||
        !Number.isFinite(location.lat) ||
        !Number.isFinite(location.lng) ||
        Math.abs(location.lat) > 90 ||
        Math.abs(location.lng) > 180
      )
        throw new Error('Location unavailable')
      committedLabel.current = suggestion.label
      selecting.current = false
      setQueryValue(suggestion.label)
      setSuggestions([])
      setStatus('idle')
      setOpen(false)
      selectRef.current({
        placeId: suggestion.id,
        label: suggestion.label,
        location,
      })
    } catch {
      if (!mounted.current || generation.current !== requestGeneration) return
      selecting.current = false
      setSuggestions([])
      setStatus('error')
      setError(
        'この場所の位置を取得できませんでした。候補を検索し直してください。',
      )
    }
  }, [])

  const retrySearch = useCallback(() => {
    resetResults()
    setHasSearchInput(true)
    setRetry((value) => value + 1)
  }, [resetResults])

  return {
    query,
    setQuery,
    open,
    begin,
    cancel,
    composing,
    setComposing,
    suggestions,
    status,
    error,
    select,
    retrySearch,
  }
}
