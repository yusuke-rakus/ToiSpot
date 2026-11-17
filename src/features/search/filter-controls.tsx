import { useId, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { MapEntry } from '../places/map-entries'
import {
  activeFilterCount,
  chainLabels,
  equipmentLabels,
  EMPTY_SEARCH_FILTERS,
  filterMapEntries,
  type SearchFilters,
} from './search-filters'

type Props = {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
  entries: MapEntry[]
  onOpenChange?: (open: boolean) => void
}
type Group = 'equipment' | 'chains'
export function FilterControls({
  filters,
  onChange,
  entries,
  onOpenChange,
}: Props) {
  const [open, setOpen] = useState<Group | null>(null)
  const [draft, setDraft] = useState(filters)
  const id = useId()
  function changeOpen(group: Group, next: boolean) {
    if (next) setDraft(filters)
    setOpen(next ? group : null)
    onOpenChange?.(next)
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="検索条件">
      <Button
        variant={filters.availableOnly ? 'default' : 'outline'}
        className="h-9 gap-1 rounded-full px-3 text-xs"
        aria-pressed={filters.availableOnly}
        onClick={() =>
          onChange({ ...filters, availableOnly: !filters.availableOnly })
        }
      >
        {filters.availableOnly && (
          <Check className="size-3" aria-hidden="true" />
        )}
        利用可のみ
      </Button>
      {(['equipment', 'chains'] as const).map((group) => {
        const label = group === 'equipment' ? '設備' : 'チェーン'
        const labels = group === 'equipment' ? equipmentLabels : chainLabels
        const selected = filters[group].length
        return (
          <Popover
            key={group}
            open={open === group}
            onOpenChange={(next) => changeOpen(group, next)}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 gap-1 rounded-full px-3 text-xs"
                aria-label={`${label}${selected ? `（${selected}）` : ''}`}
                onPointerDown={() => {
                  if (document.activeElement instanceof HTMLInputElement)
                    document.activeElement.blur()
                }}
              >
                {label}
                {selected > 0 && (
                  <span className="tabular-nums">{selected}</span>
                )}
                <ChevronDown className="size-3" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              collisionPadding={12}
              aria-label={`${label}で絞り込む`}
              onEscapeKeyDown={(event) => event.stopPropagation()}
            >
              <h3 className="text-sm font-semibold">{label}で絞り込む</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                選んだ項目のいずれかに一致する店舗を表示します。
                {group === 'equipment' && '設備が不明の店舗は含みません。'}
              </p>
              <div className="my-3">
                {Object.entries(labels).map(([value, text]) => (
                  <label
                    key={value}
                    htmlFor={`${id}-${value}`}
                    className="flex min-h-9 cursor-pointer items-center gap-3 text-sm"
                  >
                    <Checkbox
                      id={`${id}-${value}`}
                      checked={(draft[group] as string[]).includes(value)}
                      onCheckedChange={() =>
                        setDraft((previous) => ({
                          ...previous,
                          [group]: (previous[group] as string[]).includes(value)
                            ? previous[group].filter((item) => item !== value)
                            : [...previous[group], value],
                        }))
                      }
                    />
                    {text}
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button
                  variant="ghost"
                  className="h-9 px-2 text-xs"
                  onClick={() => setDraft({ ...draft, [group]: [] })}
                >
                  クリア
                </Button>
                <Button
                  className="h-9"
                  onClick={() => {
                    onChange({ ...filters, [group]: draft[group] })
                    changeOpen(group, false)
                  }}
                >
                  適用（
                  {
                    filterMapEntries(entries, {
                      ...filters,
                      [group]: draft[group],
                    }).length
                  }
                  件）
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )
      })}
      {activeFilterCount(filters) > 0 && (
        <Button
          variant="ghost"
          className="h-9 px-2 text-xs text-muted-foreground"
          aria-label="検索条件をすべて解除"
          onClick={() => onChange(EMPTY_SEARCH_FILTERS)}
        >
          解除
        </Button>
      )}
    </div>
  )
}
