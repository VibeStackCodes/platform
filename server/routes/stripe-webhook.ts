/**
 * Stripe Webhook Hono Route
 * Handles Stripe webhook events for subscription lifecycle
 */

import { describeRoute } from 'hono-openapi'
import { Hono } from 'hono'
import { Stripe } from 'stripe'
import { getProfileByStripeId, updateProfileByStripeId, updateProfilePlan } from '../lib/db/queries'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is required')
  return new Stripe(key, { apiVersion: '2026-01-28.clover' })
}

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is required')
  return secret
}

export const stripeWebhookRoutes = new Hono()

// NO auth middleware — Stripe calls this directly

/**
 * POST /api/stripe/webhook
 * Processes Stripe webhook events (subscription lifecycle)
 */
stripeWebhookRoutes.post(
  '/',
  describeRoute({
    summary: 'Handle Stripe webhook events',
    description: 'No auth middleware — Stripe calls this directly. Validates signature before processing.',
    tags: ['stripe'],
    responses: {
      200: { description: 'Webhook received and processed' },
      400: { description: 'Missing signature or invalid payload' },
      500: { description: 'Webhook processing failed' },
    },
  }),
  async (c) => {
  try {
    // Get raw body for signature verification
    const body = await c.req.text()
    const signature = c.req.header('stripe-signature')

    if (!signature) {
      return c.json({ error: 'Missing stripe-signature header' }, 400)
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = getStripe().webhooks.constructEvent(body, signature, getWebhookSecret())
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return c.json({ error: 'Invalid signature' }, 400)
    }

    // Handle different event types
    // NOTE: Using Drizzle queries directly (bypasses RLS via DATABASE_URL)
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id

        if (!userId) {
          console.error('No supabase_user_id in session metadata')
          break
        }

        // Update user plan to 'pro'
        await updateProfilePlan(userId, 'pro', 2000, 2000)
        console.log(`User ${userId} upgraded to Pro plan`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by Stripe customer ID
        const profile = await getProfileByStripeId(customerId)

        if (!profile) {
          console.error('Failed to find user by customer ID')
          break
        }

        // Downgrade user plan to 'free'
        await updateProfileByStripeId(customerId, {
          plan: 'free',
          creditsMonthly: 200,
          creditsRemaining: 200,
          creditsResetAt: null,
        })
        console.log(`User ${profile.id} downgraded to Free plan`)
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Only process subscription renewals (not initial payment)
        if (!invoice.parent?.subscription_details) break

        const profile = await getProfileByStripeId(customerId)

        if (!profile) break

        // Reset credits for the new billing period
        await updateProfileByStripeId(customerId, {
          creditsRemaining: profile.creditsMonthly,
          creditsResetAt: new Date((invoice.lines.data[0]?.period?.end ?? 0) * 1000),
        })
        console.log(`User ${profile.id} credits reset to ${profile.creditsMonthly}`)
        break
      }

      case 'customer.subscription.updated': {
        // Handle subscription updates (e.g., plan changes, cancellations)
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by Stripe customer ID
        const profile = await getProfileByStripeId(customerId)

        if (!profile) {
          console.error('Failed to find user by customer ID')
          break
        }

        // Update plan based on subscription status
        const plan = subscription.status === 'active' ? 'pro' : 'free'
        await updateProfileByStripeId(customerId, { plan })
        console.log(`User ${profile.id} plan updated to ${plan}`)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    // Return 200 to acknowledge receipt
    return c.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      },
      500,
    )
  }
  },
)
