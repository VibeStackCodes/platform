# Model Routing + Credit-Based Billing Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement dynamic model routing (GPT-5.2 via Helicone proxy) and a credit-based billing system where users consume credits (1 credit = 1,000 tokens) per AI interaction, with real-time enforcement and Stripe metered billing.

**Architecture:** Local DB (`credits_remaining`) for real-time enforcement, Helicone for LLM proxy/observability, Stripe meters + credit grants for billing. All AI calls unified through `/api/agent` (Mastra supervisor) — `/api/chat` removed.

**Tech Stack:** Stripe Billing (meters, credit grants, webhooks), Helicone AI Gateway, Mastra agents, OpenAI GPT-5.2, Supabase (platform DB)

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Credit unit | 1 credit = 1,000 tokens | Maps directly to API cost; model-agnostic (expensive models burn faster) |
| Free tier | 200 credits/mo (~1 app build) | Enough to try the product, converts to Pro |
| Pro tier | 2,000 credits/mo @ $20/mo | ~7 app builds, 46% margin on GPT-5.2 |
| Billing what | Everything (chat + generation) | All AI calls cost credits — unified billing |
| Out-of-credits | Complete current, block next | In-flight generations finish; no partial/broken output |
| Model selector | GPT-5.2 only (others disabled) | UI shows 3 models, only gpt-5.2 enabled with "Coming soon" on others |
| Chat route | Remove `/api/chat`, unify on `/api/agent` | Mastra supervisor handles all phases (analyst for chat, full pipeline for generation) |
| LLM proxy | Helicone from day one | Observability dashboards, per-user tracking, future Stripe LLM proxy integration |
| Token tracking | Mastra `totalTokens` + Helicone | Mastra for real-time credit deduction, Helicone for admin observability |
| Stripe features | Meters + Credit Grants | Meters for usage recording, credit grants auto-created on subscription |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend                                               │
│  - Model Selector (gpt-5.2 only, others "Coming soon") │
│  - Credit Display (remaining / total)                   │
│  - Out-of-credits modal with upgrade CTA                │
│  - SSE to /api/agent for ALL messages (no useChat)      │
├─────────────────────────────────────────────────────────┤
│  API: /api/agent                                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Credit Guard                                   │    │
│  │  1. Query profiles.credits_remaining            │    │
│  │  2. If <= 0 → return 402                        │    │
│  │  3. If > 0 → proceed                            │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Post-execution                                 │    │
│  │  1. Sum totalTokens from all agents             │    │
│  │  2. credits_used = ceil(totalTokens / 1000)     │    │
│  │  3. Deduct from profiles.credits_remaining      │    │
│  │  4. Insert usage_events row                     │    │
│  │  5. Send Stripe meter event (async)             │    │
│  │  6. SSE: emit credits_used to client            │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  AI Layer                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Helicone     │  │ Mastra       │  │ Stripe       │  │
│  │ Gateway      │  │ Supervisor   │  │ Meters       │  │
│  │              │  │              │  │              │  │
│  │ baseURL:     │  │ 9 agents     │  │ vibestack_   │  │
│  │ oai.helicone │  │ totalTokens  │  │ tokens       │  │
│  │ .ai/v1       │  │ per agent    │  │              │  │
│  │              │  │              │  │ Credit       │  │
│  │ User-Id      │  │ Factory fn   │  │ Grants       │  │
│  │ header       │  │ per request  │  │ per sub      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Database (Supabase)                                    │
│  profiles: +credits_remaining, +credits_monthly,        │
│            +credits_reset_at                            │
│  usage_events: new table (audit log)                    │
│  projects.model: wire up (already exists, unused)       │
└─────────────────────────────────────────────────────────┘
```

## Database Schema Changes

### Alter `profiles` table

```sql
ALTER TABLE profiles
  ADD COLUMN credits_remaining INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN credits_monthly INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN credits_reset_at TIMESTAMPTZ;
```

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `credits_remaining` | INTEGER | 200 | Real-time balance, decremented after each API call |
| `credits_monthly` | INTEGER | 200 | Plan allocation (200=free, 2000=pro) |
| `credits_reset_at` | TIMESTAMPTZ | NULL | Next Stripe subscription renewal date |

### New `usage_events` table

```sql
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('chat', 'generation')),
  model TEXT NOT NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_total INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  stripe_meter_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_events_select ON usage_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY usage_events_insert ON usage_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### RPC: `deduct_credits`

```sql
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_project_id UUID DEFAULT NULL,
  p_model TEXT DEFAULT 'gpt-5.2',
  p_tokens_input INTEGER DEFAULT 0,
  p_tokens_output INTEGER DEFAULT 0,
  p_tokens_total INTEGER DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
  remaining INTEGER;
BEGIN
  UPDATE profiles
    SET credits_remaining = credits_remaining - p_credits
    WHERE id = p_user_id
    RETURNING credits_remaining INTO remaining;

  INSERT INTO usage_events (user_id, project_id, event_type, model,
    tokens_input, tokens_output, tokens_total, credits_used)
  VALUES (p_user_id, p_project_id, 'generation', p_model,
    p_tokens_input, p_tokens_output, p_tokens_total, p_credits);

  RETURN remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Plan mapping

| Plan | `credits_monthly` | Allocation | Monthly Cost |
|------|-------------------|------------|-------------|
| `free` | 200 | ~1 app build | $0 |
| `pro` | 2,000 | ~7 app builds | $20/mo |

## Stripe Integration

### Resources to create

1. **Meter**: `vibestack_tokens` (sum aggregation)
2. **Product**: "VibeStack Token Usage" (metered)
3. **Price**: $0.01 per credit, metered, monthly — linked to meter
4. **Credit Grant**: Auto-created per subscription period

### Webhook enhancements

```
checkout.session.completed →
  profiles.plan = 'pro'
  profiles.credits_monthly = 2000
  profiles.credits_remaining = 2000
  profiles.credits_reset_at = subscription.current_period_end
  Stripe: create credit grant (2000 credits)

customer.subscription.deleted →
  profiles.plan = 'free'
  profiles.credits_monthly = 200
  profiles.credits_remaining = MIN(remaining, 200)

invoice.paid (recurring renewal) →
  profiles.credits_remaining = profiles.credits_monthly
  profiles.credits_reset_at = subscription.current_period_end
  Stripe: create new credit grant

customer.subscription.updated →
  Sync plan status
```

### Usage recording

After each generation/chat, fire-and-forget meter event:

```typescript
stripe.billing.meterEvents.create({
  event_name: 'vibestack_tokens',
  payload: {
    stripe_customer_id: profile.stripe_customer_id,
    value: String(totalTokensUsed),
  },
}).catch(console.error);
```

## Helicone Proxy

### OpenAI gateway

All Mastra agents route through Helicone:

```typescript
import { createOpenAI } from '@ai-sdk/openai';

function createHeliconeProvider(userId: string) {
  return createOpenAI({
    baseURL: 'https://oai.helicone.ai/v1',
    headers: {
      'Helicone-Auth': `Bearer ${process.env.HELICONE_API_KEY}`,
      'Helicone-User-Id': userId,
    },
  });
}
```

### Environment variables

```
HELICONE_API_KEY=sk-helicone-...
```

## Model Routing

### Agent factory (replaces singletons)

Registry refactored from singleton agents to a factory:

```typescript
export function createAgentNetwork(model: string, userId: string) {
  const provider = createHeliconeProvider(userId);
  const modelInstance = provider(model);

  const supervisorAgent = new Agent({
    id: 'supervisor',
    model: modelInstance,
    // ... agents also use modelInstance or provider('gpt-5.2') ...
  });

  return supervisorAgent; // or .network()
}
```

### Model selector

- UI already has 3 models: `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5-mini`
- Only `gpt-5.2` enabled; others show "Coming soon" badge
- Selected model passed to `/api/agent` in request body
- Route validates model is in allowed list

## Frontend Changes

### Remove `/api/chat` dependency

- Delete `app/api/chat/route.ts`
- Refactor `builder-chat.tsx`: replace Vercel AI SDK `useChat` with direct SSE to `/api/agent`
- All messages (chat + generation) flow through supervisor

### Credit display

- Show `credits_remaining / credits_monthly` in header/sidebar
- Update in real-time as SSE streams `credits_used` events
- When credits hit 0: modal with "Upgrade to Pro" or "Resets on {date}"

### 402 handling

- On 402 from `/api/agent`: show out-of-credits modal
- Free users: "Upgrade to Pro for 2,000 credits/month"
- Pro users: "Credits reset on {credits_reset_at}"

## Cost Analysis

### GPT-5.2 pricing

- Input: $1.75/M tokens
- Output: $14.00/M tokens
- Cached input: $0.175/M tokens

### Per-generation cost (estimated)

- ~300K tokens (70% input, 30% output)
- Input cost: 210K × $1.75/M = $0.37
- Output cost: 90K × $14.00/M = $1.26
- **Total: ~$1.63 per generation**

### Margin analysis (Pro $20/mo, 2M tokens = 2,000 credits)

- Raw cost: ~$10.85 (at 2M tokens)
- Revenue: $20
- **Margin: ~46%**

## Sources

- [OpenAI GPT-5.2 Pricing](https://platform.openai.com/docs/pricing)
- [Helicone Rate Limiting](https://docs.helicone.ai/features/advanced-usage/custom-rate-limits)
- [Stripe Credit-Based Pricing](https://docs.stripe.com/billing/subscriptions/usage-based/use-cases/credits-based-pricing-model)
- [Stripe LLM Token Billing](https://docs.stripe.com/billing/token-billing)
- [Stripe Billing Upgrades Blog](https://stripe.com/blog/create-new-monetization-opportunities-with-recent-stripe-billing-upgrades)
- [Lovable Plans & Credits](https://docs.lovable.dev/introduction/plans-and-credits)
- [Bolt.new Pricing](https://bolt.new/pricing)
