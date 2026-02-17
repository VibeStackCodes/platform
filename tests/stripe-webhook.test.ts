import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stripe } from 'stripe'

// Mock Stripe
const mockConstructEvent = vi.fn()
const mockStripe = {
  webhooks: {
    constructEvent: mockConstructEvent,
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
  updateProfilePlan: vi.fn(),
  getProfileByStripeId: vi.fn(),
  updateProfileByStripeId: vi.fn(),
}))

import { getProfileByStripeId, updateProfileByStripeId, updateProfilePlan } from '@server/lib/db/queries'
import { stripeWebhookRoutes } from '@server/routes/stripe-webhook'

describe('Stripe Webhook Routes', () => {
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
    app = new Hono()
    app.route('/api/stripe/webhook', stripeWebhookRoutes)
  })

  describe('POST /api/stripe/webhook', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'checkout.session.completed' }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data).toEqual({ error: 'Missing stripe-signature header' })
      expect(mockConstructEvent).not.toHaveBeenCalled()
    })

    it('returns 400 when signature verification fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature')
      })

      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'invalid-signature',
        },
        body: JSON.stringify({ type: 'checkout.session.completed' }),
      })

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data).toEqual({ error: 'Invalid signature' })
    })

    it('handles checkout.session.completed event and upgrades user to pro', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_123',
        object: 'event',
        api_version: '2026-01-28',
        created: Date.now() / 1000,
        data: {
          object: {
            id: 'cs_test_123',
            object: 'checkout.session',
            metadata: {
              supabase_user_id: 'user-456',
            },
          } as Stripe.Checkout.Session,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'checkout.session.completed',
      }

      mockConstructEvent.mockReturnValue(mockEvent)
      vi.mocked(updateProfilePlan).mockResolvedValue(undefined)

      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual({ received: true })
      expect(updateProfilePlan).toHaveBeenCalledWith('user-456', 'pro', 2000, 2000)
    })

    it('handles checkout.session.completed without user metadata gracefully', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_123',
        object: 'event',
        api_version: '2026-01-28',
        created: Date.now() / 1000,
        data: {
          object: {
            id: 'cs_test_123',
            object: 'checkout.session',
            metadata: {}, // No supabase_user_id
          } as Stripe.Checkout.Session,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'checkout.session.completed',
      }

      mockConstructEvent.mockReturnValue(mockEvent)

      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res.status).toBe(200)
      expect(updateProfilePlan).not.toHaveBeenCalled()
    })

    it('handles customer.subscription.deleted event and downgrades user', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_456',
        object: 'event',
        api_version: '2026-01-28',
        created: Date.now() / 1000,
        data: {
          object: {
            id: 'sub_test_123',
            object: 'subscription',
            customer: 'cus_test_123',
          } as Stripe.Subscription,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'customer.subscription.deleted',
      }

      mockConstructEvent.mockReturnValue(mockEvent)
      vi.mocked(getProfileByStripeId).mockResolvedValue({
        id: 'user-789',
        creditsMonthly: 2000,
      })
      vi.mocked(updateProfileByStripeId).mockResolvedValue(undefined)

      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res.status).toBe(200)
      expect(getProfileByStripeId).toHaveBeenCalledWith('cus_test_123')
      expect(updateProfileByStripeId).toHaveBeenCalledWith('cus_test_123', {
        plan: 'free',
        creditsMonthly: 200,
        creditsRemaining: 200,
        creditsResetAt: null,
      })
    })

    it('handles customer.subscription.deleted without profile gracefully', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_456',
        object: 'event',
        api_version: '2026-01-28',
        created: Date.now() / 1000,
        data: {
          object: {
            id: 'sub_test_123',
            object: 'subscription',
            customer: 'cus_unknown',
          } as Stripe.Subscription,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'customer.subscription.deleted',
      }

      mockConstructEvent.mockReturnValue(mockEvent)
      vi.mocked(getProfileByStripeId).mockResolvedValue(null)

      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res.status).toBe(200)
      expect(updateProfileByStripeId).not.toHaveBeenCalled()
    })

    it('handles customer.subscription.updated event', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_789',
        object: 'event',
        api_version: '2026-01-28',
        created: Date.now() / 1000,
        data: {
          object: {
            id: 'sub_test_123',
            object: 'subscription',
            customer: 'cus_test_123',
            status: 'active',
          } as Stripe.Subscription,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'customer.subscription.updated',
      }

      mockConstructEvent.mockReturnValue(mockEvent)
      vi.mocked(getProfileByStripeId).mockResolvedValue({
        id: 'user-999',
        creditsMonthly: 2000,
      })
      vi.mocked(updateProfileByStripeId).mockResolvedValue(undefined)

      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res.status).toBe(200)
      expect(updateProfileByStripeId).toHaveBeenCalledWith('cus_test_123', { plan: 'pro' })
    })

    it('ignores unknown event types with 200 response', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_unknown',
        object: 'event',
        api_version: '2026-01-28',
        created: Date.now() / 1000,
        data: {
          object: {} as any,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'payment_intent.created', // Unhandled event type
      }

      mockConstructEvent.mockReturnValue(mockEvent)

      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toEqual({ received: true })
      expect(updateProfilePlan).not.toHaveBeenCalled()
      expect(updateProfileByStripeId).not.toHaveBeenCalled()
    })

    it('idempotency: same checkout.session.completed event can be processed twice', async () => {
      // Stripe's webhook system handles idempotency, but we verify the handler
      // doesn't fail on duplicate events
      const mockEvent: Stripe.Event = {
        id: 'evt_duplicate',
        object: 'event',
        api_version: '2026-01-28',
        created: Date.now() / 1000,
        data: {
          object: {
            id: 'cs_test_123',
            object: 'checkout.session',
            metadata: {
              supabase_user_id: 'user-456',
            },
          } as Stripe.Checkout.Session,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'checkout.session.completed',
      }

      mockConstructEvent.mockReturnValue(mockEvent)
      vi.mocked(updateProfilePlan).mockResolvedValue(undefined)

      // First request
      const res1 = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res1.status).toBe(200)
      expect(updateProfilePlan).toHaveBeenCalledTimes(1)

      // Second request with same event
      const res2 = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res2.status).toBe(200)
      expect(updateProfilePlan).toHaveBeenCalledTimes(2)

      // Note: True idempotency would require tracking processed event IDs in the DB.
      // This test verifies the handler doesn't fail on duplicate calls.
    })

    it('returns 500 when webhook processing throws an error', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_error',
        object: 'event',
        api_version: '2026-01-28',
        created: Date.now() / 1000,
        data: {
          object: {
            id: 'cs_test_123',
            object: 'checkout.session',
            metadata: {
              supabase_user_id: 'user-456',
            },
          } as Stripe.Checkout.Session,
        },
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        type: 'checkout.session.completed',
      }

      mockConstructEvent.mockReturnValue(mockEvent)
      vi.mocked(updateProfilePlan).mockRejectedValue(new Error('Database connection failed'))

      const res = await app.request('/api/stripe/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=signature',
        },
        body: JSON.stringify(mockEvent),
      })

      expect(res.status).toBe(500)
      const data = await res.json()
      expect(data.error).toContain('Database connection failed')
    })
  })
})
