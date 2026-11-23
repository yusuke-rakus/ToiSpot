import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createTestStores } from '../../../tests/fixtures/stores'
import type { MapEntry } from '../places/map-entries'
import { FilterControls } from './filter-controls'
import { EMPTY_SEARCH_FILTERS, type SearchFilters } from './search-filters'

const entries: MapEntry[] = createTestStores('2026-11-03T00:00:00.000Z').map(
  ({ id, data }) => ({
    key: id,
    name: data.name,
    location: data.location,
    registration: 'registered',
    store: { ...data, id },
  }),
)

function Controls({
  onChange = () => {},
}: {
  onChange?: (filters: SearchFilters) => void
}) {
  const [filters, setFilters] = useState(EMPTY_SEARCH_FILTERS)
  return (
    <FilterControls
      filters={filters}
      entries={entries}
      onChange={(value) => {
        setFilters(value)
        onChange(value)
      }}
    />
  )
}

describe('絞り込み操作', () => {
  it('利用可のみは直接適用でき、全解除できる', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controls onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: '利用可のみ' }))
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_SEARCH_FILTERS,
      availableOnly: true,
    })
    await user.click(
      screen.getByRole('button', { name: '検索条件をすべて解除' }),
    )
    expect(onChange).toHaveBeenLastCalledWith(EMPTY_SEARCH_FILTERS)
  })

  it('設備条件は適用まで変えず、キャンセルで破棄する', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controls onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: '設備' }))
    let dialog = screen.getByRole('dialog', { name: '設備で絞り込む' })
    await user.click(
      within(dialog).getByRole('checkbox', { name: '女性用個室' }),
    )
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '設備' }))
    dialog = screen.getByRole('dialog', { name: '設備で絞り込む' })
    await user.click(within(dialog).getByRole('checkbox', { name: '共用個室' }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: /^適用/ }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      ...EMPTY_SEARCH_FILTERS,
      equipment: ['shared'],
    })
  })
})
