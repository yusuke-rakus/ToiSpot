import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StoreDetails } from './store-panel'
import type { Store } from './store-schema'
import { createTestStores } from '../../../tests/fixtures/stores'

const store: Store = {
  ...createTestStores('2026-11-03T00:00:00.000Z')[0].data,
  id: 'detail',
  notes: '',
}

describe('トイレ情報の詳細', () => {
  it('利用可の設備をアイコン・名前・個数で表示し、0は省く', () => {
    render(
      <StoreDetails
        store={{
          ...store,
          stalls: { shared: 2, male: 0, female: null },
          urinals: 1,
        }}
      />,
    )
    const equipment = screen.getByLabelText('トイレ設備')
    expect(within(equipment).getAllByRole('term')).toHaveLength(3)
    expect(screen.getByText('共用個室').nextElementSibling).toHaveTextContent(
      '2室',
    )
    expect(screen.getByText('女性用個室').nextElementSibling).toHaveTextContent(
      '不明',
    )
    expect(
      screen.getByText('男性用小便器').nextElementSibling,
    ).toHaveTextContent('1基')
    expect(screen.queryByText('男性用個室')).not.toBeInTheDocument()
    expect(within(equipment).getByText('🚻')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(within(equipment).getByText('🚺')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(equipment.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.queryByText('設備の内訳')).not.toBeInTheDocument()
    expect(screen.queryByText(/最終確認日/)).not.toBeInTheDocument()
    expect(screen.queryByText('備考')).not.toBeInTheDocument()
    expect(screen.queryByText('記載なし')).not.toBeInTheDocument()
  })

  it('利用不可では店舗情報と貸出状況だけを表示する', () => {
    render(
      <StoreDetails
        store={{
          ...store,
          availability: 'unavailable',
          stalls: { shared: null, male: null, female: null },
          urinals: null,
        }}
      />,
    )
    expect(screen.getByRole('heading', { name: store.name })).toBeVisible()
    expect(screen.getByText(store.chainName)).toBeVisible()
    expect(screen.getByText(store.address)).toBeVisible()
    expect(screen.getByText('利用不可')).toBeVisible()
    expect(screen.queryByLabelText('トイレ設備')).not.toBeInTheDocument()
    expect(screen.queryByText('不明')).not.toBeInTheDocument()
    expect(screen.queryByText('備考')).not.toBeInTheDocument()
  })

  it('利用不可でも入力のある備考は表示する', () => {
    render(
      <StoreDetails
        store={{
          ...store,
          availability: 'unavailable',
          stalls: { shared: null, male: null, female: null },
          urinals: null,
          notes: '店内にトイレはありません。',
        }}
      />,
    )
    expect(screen.getByText('備考')).toBeVisible()
    expect(screen.getByText('店内にトイレはありません。')).toBeVisible()
  })

  it('全設備が0の場合は設備表示を省く', () => {
    render(
      <StoreDetails
        store={{
          ...store,
          stalls: { shared: 0, male: 0, female: 0 },
          urinals: 0,
        }}
      />,
    )
    expect(screen.getByText('利用可')).toBeVisible()
    expect(screen.queryByLabelText('トイレ設備')).not.toBeInTheDocument()
  })

  it('全設備が未確認の場合は各設備に不明と表示する', () => {
    render(
      <StoreDetails
        store={{
          ...store,
          stalls: { shared: null, male: null, female: null },
          urinals: null,
        }}
      />,
    )
    expect(screen.getAllByText('不明')).toHaveLength(4)
    expect(
      within(screen.getByLabelText('トイレ設備')).getAllByRole('term'),
    ).toHaveLength(4)
    expect(screen.getByText('🚹')).toHaveAttribute('aria-hidden', 'true')
  })
})
