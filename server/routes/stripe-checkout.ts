/**
 * Stripe Checkout Hono Route
 * Creates a Stripe Checkout session for Pro plan subscription
 */

import { Hono } from 'hono'
import { Stripe } from 'stripe'
import { getProfileForCheckout, setStripeCustomerId } from '../lib/db/queries'
import { authMiddleware } from '../middleware/auth'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is required')
  return new Stripe(key, { apiVersion: '2026-01-28.clover' })
}

export const stripeCheckoutRoutes = new Hono()

// All routes require authentication
stripeCheckoutRoutes.use('*', authMiddleware)

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for Pro subscription
 */
stripeCheckoutRoutes.post('/', async (c) => {
  try {
    const user = c.var.user

    // Get user's email and existing Stripe customer ID from profiles
    const profile = await getProfileForCheckout(user.id)
    const email = profile?.email || user.email

    if (!email) {
      return c.json({ error: 'User email not found' }, 400)
    }

    // Create or retrieve Stripe customer
    const stripe = getStripe()
    let customerId = profile?.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          supabase_user_id: user.id,
        },
      })
      customerId = customer.id

      // Update profiles table with customer ID
      await setStripeCustomerId(user.id, customerId)
    }

    // Get origin for success/cancel URLs
    const origin = c.req.header('origin') || 'http://localhost:3000'

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'VibeStack Pro',
              description: '2,000 credits/month (~7 app generations) with priority support',
            },
            unit_amount: 2000, // $20.00
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: {
        supabase_user_id: user.id,
      },
    })

    return c.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create checkout session',
      },
      500,
    )
  }
})
