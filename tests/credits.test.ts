import { checkCredits } from '@server/lib/credits'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

describe('Credit System', () => {
  it('checkCredits returns user credits', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                credits_remaining: 1500,
                credits_monthly: 2000,
                credits_reset_at: '2026-03-15T00:00:00Z',
                plan: 'pro',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    const credits = await checkCredits(mockSupabase, 'user-123')
    expect(credits).not.toBeNull()
    if (!credits) return
    expect(credits.credits_remaining).toBe(1500)
    expect(credits.plan).toBe('pro')
  })

  it('checkCredits returns null on error', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'not found' },
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    const credits = await checkCredits(mockSupabase, 'user-999')
    expect(credits).toBeNull()
  })

  it('credit math: 1 credit = 1000 tokens', () => {
    const tokensUsed = 5432
    const creditsUsed = Math.ceil(tokensUsed / 1000)
    expect(creditsUsed).toBe(6) // Rounds up
  })

  it('credit math: exact boundary', () => {
    expect(Math.ceil(1000 / 1000)).toBe(1)
    expect(Math.ceil(1001 / 1000)).toBe(2)
    expect(Math.ceil(999 / 1000)).toBe(1)
    // oxlint-disable-next-line oxc/erasing-op -- intentional: verifying 0 tokens = 0 credits
    expect(Math.ceil(0 / 1000)).toBe(0)
  })

  it('B2: settlement logic - refund difference when actual < reserved', () => {
    const reserved = 50
    const actual = 30
    const diff = reserved - actual // 20 credits refunded
    expect(diff).toBe(20)
    expect(diff > 0).toBe(true) // positive = refund
  })

  it('B2: settlement logic - charge difference when actual > reserved', () => {
    const reserved = 50
    const actual = 80
    const diff = reserved - actual // -30 credits charged
    expect(diff).toBe(-30)
    expect(diff < 0).toBe(true) // negative = additional charge
  })

  it('B2: settlement logic - no-op when actual = reserved', () => {
    const reserved = 50
    const actual = 50
    const diff = reserved - actual // 0 credits
    expect(diff).toBe(0)
  })

  it('B2: settlement logic - full refund when actual = 0 (error case)', () => {
    const reserved = 50
    const actual = 0
    const diff = reserved - actual // 50 credits refunded
    expect(diff).toBe(50)
    expect(diff).toBe(reserved) // full refund
  })
})
