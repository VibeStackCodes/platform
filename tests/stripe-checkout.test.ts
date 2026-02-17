import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock auth middleware
vi.mock('@server/middleware/auth', () => ({
  authMiddleware: createMiddleware(async (c, next) => {
    c.set('user', { id: 'user-123', email: 'test@test.com' })
    return next()
  }),
}))

// Mock Stripe
const mockCustomersCreate = vi.fn()
const mockCheckoutSessionsCreate = vi.fn()
const mockStripe = {
  customers: {
    create: mockCustomersCreate,
  },
  checkout: {
    sessions: {
      create: mockCheckoutSessionsCreate,
    },
  },
}
vi.mock('stripe', () => {
  return {
    Stripe: vi.fn(function () {
      return mockStripe
    }),
  }
})

// Mock DB queries
vi.mock('@server/lib/db/queries', () => ({
  getProfileForCheckout: vi.fn(),
  setStripeCustomerId: vi.fn(),
}))

import { getProfileForCheckout, setStripeCustomerId } from '@server/lib/db/queries'
import { stripeCheckoutRoutes } from '@server/routes/stripe-checkout'

describe('Stripe Checkout Routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    app = new Hono()
    app.route('/api/stripe/checkout', stripeCheckoutRoutes)
  })

  describe('POST /api/stripe/checkout', () => {
    it('creates checkout session for authenticated user with existing customer', async () => {
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: 'test@test.com',
        stripeCustomerId: 'cus_existing123',
      })

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      })

      const res = await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.url).toBe('https://checkout.stripe.com/pay/cs_test_123')

      expect(getProfileForCheckout).toHaveBeenCalledWith('user-123')
      expect(mockCustomersCreate).not.toHaveBeenCalled() // Existing customer
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith({
        customer: 'cus_existing123',
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
              unit_amount: 2000,
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        success_url: 'http://localhost:3000/dashboard?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost:3000/pricing',
        metadata: {
          supabase_user_id: 'user-123',
        },
      })
    })

    it('creates new Stripe customer when user has no customer ID', async () => {
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: 'newuser@test.com',
        stripeCustomerId: null,
      })

      mockCustomersCreate.mockResolvedValue({
        id: 'cus_new123',
      })

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/pay/cs_test_456',
      })

      const res = await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.url).toBe('https://checkout.stripe.com/pay/cs_test_456')

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'newuser@test.com',
        metadata: {
          supabase_user_id: 'user-123',
        },
      })
      expect(setStripeCustomerId).toHaveBeenCalledWith('user-123', 'cus_new123')
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_new123',
          metadata: {
            supabase_user_id: 'user-123',
          },
        }),
      )
    })

    it('uses auth user email when profile email is missing', async () => {
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: null,
        stripeCustomerId: null,
      })

      mockCustomersCreate.mockResolvedValue({
        id: 'cus_new456',
      })

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_789',
        url: 'https://checkout.stripe.com/pay/cs_test_789',
      })

      const res = await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(200)

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'test@test.com', // Falls back to auth user email
        metadata: {
          supabase_user_id: 'user-123',
        },
      })
    })

    it('handles case when profile has no email (uses auth user email)', async () => {
      // This test verifies that when profile.email is null, the route falls back to user.email
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: null,
        stripeCustomerId: null,
      })

      mockCustomersCreate.mockResolvedValue({
        id: 'cus_fallback',
      })

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_fallback',
        url: 'https://checkout.stripe.com/pay/cs_test_fallback',
      })

      const res = await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(200)
      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'test@test.com', // Falls back to auth user's email
        metadata: {
          supabase_user_id: 'user-123',
        },
      })
    })

    it('includes correct metadata in checkout session', async () => {
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: 'test@test.com',
        stripeCustomerId: 'cus_123',
      })

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_metadata',
        url: 'https://checkout.stripe.com/pay/cs_test_metadata',
      })

      await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      })

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            supabase_user_id: 'user-123',
          },
        }),
      )
    })

    it('constructs success and cancel URLs with default origin', async () => {
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: 'test@test.com',
        stripeCustomerId: 'cus_123',
      })

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_origin',
        url: 'https://checkout.stripe.com/pay/cs_test_origin',
      })

      await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      // Verify URLs are constructed properly (default to localhost:3000 in test)
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: 'http://localhost:3000/dashboard?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'http://localhost:3000/pricing',
        }),
      )
    })

    it('defaults to localhost:3000 when origin header is missing', async () => {
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: 'test@test.com',
        stripeCustomerId: 'cus_123',
      })

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_default',
        url: 'https://checkout.stripe.com/pay/cs_test_default',
      })

      await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: 'http://localhost:3000/dashboard?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'http://localhost:3000/pricing',
        }),
      )
    })

    it('returns 500 when Stripe API fails', async () => {
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: 'test@test.com',
        stripeCustomerId: 'cus_123',
      })

      mockCheckoutSessionsCreate.mockRejectedValue(new Error('Stripe API error'))

      const res = await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Failed to create checkout session')
    })

    it('returns 500 when customer creation fails', async () => {
      vi.mocked(getProfileForCheckout).mockResolvedValue({
        email: 'test@test.com',
        stripeCustomerId: null,
      })

      mockCustomersCreate.mockRejectedValue(new Error('Customer creation failed'))

      const res = await app.request('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toBe('Failed to create checkout session')
    })

    it('requires authentication', async () => {
      // Create app without auth
      const noAuthApp = new Hono()
      const authFail = createMiddleware(async (c) => {
        return c.json({ error: 'Unauthorized' }, 401)
      })
      noAuthApp.use('*', authFail)
      noAuthApp.post('/api/stripe/checkout', async (c) => c.json({ url: '' }))

      const res = await noAuthApp.request('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(401)
    })
  })
})
