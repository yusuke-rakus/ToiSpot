import type { MapEntry } from '../places/map-entries'

export const equipmentLabels = {
  female: '女性用個室',
  shared: '共用個室',
  male: '男性用個室',
  urinal: '男性用小便器',
} as const

export const chainLabels = {
  'seven-eleven': 'セブン-イレブン',
  lawson: 'ローソン',
  familymart: 'ファミリーマート',
  other: 'その他',
} as const

export type EquipmentFilter = keyof typeof equipmentLabels
export type ChainFilter = keyof typeof chainLabels
export type SearchFilters = {
  availableOnly: boolean
  equipment: EquipmentFilter[]
  chains: ChainFilter[]
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  availableOnly: false,
  equipment: [],
  chains: [],
}

// 店名から判定するチェーンを、地図のピンと検索条件で共通にする。
export function classifyChain(name: string): ChainFilter {
  const normalized = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{Dash}]/gu, '')
  if (/^(セブンー?イレブン|7eleven|seveneleven)/.test(normalized))
    return 'seven-eleven'
  if (/^(ローソン|lawson)/.test(normalized)) return 'lawson'
  if (/^(ファミリーマート|familymart)/.test(normalized)) return 'familymart'
  return 'other'
}

export function activeFilterCount(filters: SearchFilters) {
  return (
    Number(filters.availableOnly) +
    filters.equipment.length +
    filters.chains.length
  )
}

export function filterMapEntries(entries: MapEntry[], filters: SearchFilters) {
  return entries.filter((entry) => {
    const store = entry.store
    if (filters.availableOnly && store?.availability !== 'available')
      return false
    if (
      filters.chains.length > 0 &&
      !filters.chains.includes(classifyChain(entry.name))
    )
      return false
    if (filters.equipment.length > 0) {
      if (store?.availability !== 'available') return false
      return filters.equipment.some((equipment) => {
        const count =
          equipment === 'urinal' ? store.urinals : store.stalls[equipment]
        return count !== null && count > 0
      })
    }
    return true
  })
}
