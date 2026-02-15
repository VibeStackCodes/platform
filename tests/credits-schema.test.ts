import { describe, expect, it } from 'vitest'
import type { StreamEvent, UsageEvent, UserCredits } from '@/lib/types'

describe('Credits Types', () => {
  it('UserCredits interface has required fields', () => {
    const credits: UserCredits = {
      credits_remaining: 2000,
      credits_monthly: 2000,
      credits_reset_at: '2026-03-15T00:00:00Z',
      plan: 'pro',
    }
    expect(credits.credits_remaining).toBe(2000)
    expect(credits.plan).toBe('pro')
  })

  it('UsageEvent interface has required fields', () => {
    const event: UsageEvent = {
      id: 'test-id',
      user_id: 'user-id',
      project_id: 'project-id',
      event_type: 'generation',
      model: 'gpt-5.2',
      tokens_input: 1000,
      tokens_output: 500,
      tokens_total: 1500,
      credits_used: 2,
      stripe_meter_event_id: null,
      created_at: '2026-02-15T00:00:00Z',
    }
    expect(event.credits_used).toBe(2)
  })

  it('CreditsUsedEvent is part of StreamEvent union', () => {
    const event: StreamEvent = {
      type: 'credits_used',
      creditsUsed: 5,
      creditsRemaining: 1995,
      tokensTotal: 5000,
    }
    expect(event.type).toBe('credits_used')
  })

  it('free plan defaults', () => {
    const free: UserCredits = {
      credits_remaining: 200,
      credits_monthly: 200,
      credits_reset_at: null,
      plan: 'free',
    }
    expect(free.credits_monthly).toBe(200)
  })

  it('pro plan defaults', () => {
    const pro: UserCredits = {
      credits_remaining: 2000,
      credits_monthly: 2000,
      credits_reset_at: '2026-03-15T00:00:00Z',
      plan: 'pro',
    }
    expect(pro.credits_monthly).toBe(2000)
  })
})
