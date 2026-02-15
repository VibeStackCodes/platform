/**
 * Credit checking and deduction utilities
 *
 * Uses Supabase RPC for atomic credit operations.
 * Stripe meter events are fired asynchronously (fire-and-forget).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import type { UserCredits } from './types'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-01-28.clover' })
  : null

/** Check if user has sufficient credits */
export async function checkCredits(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserCredits | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('credits_remaining, credits_monthly, credits_reset_at, plan')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data as UserCredits
}

/** Deduct credits after generation and log usage */
export async function deductCredits(
  supabase: SupabaseClient,
  params: {
    userId: string
    projectId: string
    model: string
    eventType: 'chat' | 'generation'
    tokensInput: number
    tokensOutput: number
    tokensTotal: number
  },
): Promise<number> {
  const creditsUsed = Math.ceil(params.tokensTotal / 1000)

  const { error } = await supabase.rpc('deduct_credits', {
    p_user_id: params.userId,
    p_credits: creditsUsed,
    p_project_id: params.projectId,
    p_model: params.model,
    p_event_type: params.eventType,
    p_tokens_input: params.tokensInput,
    p_tokens_output: params.tokensOutput,
    p_tokens_total: params.tokensTotal,
  })

  if (error) {
    console.error('[credits] deduction failed:', error)
    return creditsUsed // Still return the amount for client-side display
  }

  // Fire-and-forget Stripe meter event
  reportToStripe(params.userId, params.tokensTotal, supabase).catch(console.error)

  return creditsUsed
}

/** Report usage to Stripe meter (async, non-blocking) */
async function reportToStripe(
  userId: string,
  tokensTotal: number,
  supabase: SupabaseClient,
): Promise<void> {
  if (!stripe) return

  // Look up Stripe customer ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (!profile?.stripe_customer_id) return

  await stripe.billing.meterEvents.create({
    event_name: 'vibestack_tokens',
    payload: {
      stripe_customer_id: profile.stripe_customer_id,
      value: String(tokensTotal),
    },
  })
}
