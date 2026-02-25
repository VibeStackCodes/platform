/**
 * Credit checking and deduction utilities
 *
 * Uses pessimistic credit reservation to prevent race conditions:
 * 1. Reserve credits before generation starts (atomic operation)
 * 2. Deduct/refund difference after generation completes (settlement)
 *
 * Stripe meter events are fired asynchronously (fire-and-forget).
 */

import { sql } from 'drizzle-orm'
import { db } from './db/client'

/**
 * Atomically reserve credits before generation starts.
 * Returns true if reservation succeeded, false if insufficient credits.
 * Reserved credits are deducted from available balance immediately.
 * After generation, call settleCredits() to adjust to actual usage.
 */
export async function reserveCredits(userId: string, amount: number): Promise<boolean> {
  try {
    // Use raw SQL for atomic operation with WHERE guard
    const result = await db.execute(
      sql`UPDATE profiles
          SET credits_remaining = credits_remaining - ${amount}
          WHERE id = ${userId} AND credits_remaining >= ${amount}
          RETURNING credits_remaining`,
    )
    return result.rows.length > 0
  } catch (error) {
    console.error('[credits] reservation failed:', error)
    return false
  }
}

/**
 * Settle credits after generation completes.
 * If actual usage < reserved: refund the difference.
 * If actual usage > reserved: deduct the additional amount.
 */
export async function settleCredits(
  userId: string,
  reserved: number,
  actual: number,
): Promise<{ creditsRemaining: number }> {
  const diff = reserved - actual // positive = refund, negative = additional charge
  try {
    const result = await db.execute(
      sql`UPDATE profiles
          SET credits_remaining = GREATEST(0, credits_remaining + ${diff})
          WHERE id = ${userId}
          RETURNING credits_remaining`,
    )
    return { creditsRemaining: (result.rows[0]?.credits_remaining as number) ?? 0 }
  } catch (error) {
    console.error('[credits] settlement failed:', error)
    return { creditsRemaining: 0 }
  }
}

