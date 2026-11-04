import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './query-client'

describe('Firestore取得用キャッシュの基盤', () => {
  it('同一条件の新鮮な取得結果を再利用する', async () => {
    const client = createQueryClient()
    const queryFn = vi.fn().mockResolvedValue([{ id: 'store-1' }])
    const options = { queryKey: ['stores', 'same-area'], queryFn }

    await client.fetchQuery(options)
    await client.fetchQuery(options)

    expect(queryFn).toHaveBeenCalledTimes(1)
    client.clear()
  })

  it('失敗した取得を自動で繰り返さない', async () => {
    const client = createQueryClient()
    const queryFn = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(
      client.fetchQuery({ queryKey: ['stores', 'offline'], queryFn }),
    ).rejects.toThrow('offline')

    expect(queryFn).toHaveBeenCalledTimes(1)
    client.clear()
  })
})
