# Model Routing + Credit-Based Billing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement dynamic model routing (GPT-5.2 via Helicone proxy) and a credit-based billing system (1 credit = 1,000 tokens) with real-time enforcement, Stripe metered billing, and unified chat/generation through the Mastra supervisor.

**Architecture:** Local DB (`credits_remaining` on profiles) for real-time enforcement, Helicone as LLM proxy for observability, Stripe meters + credit grants for billing. All AI calls unified through `/api/agent` — `/api/chat` removed. Agent registry refactored from singletons to a per-request factory function.

**Tech Stack:** Stripe Billing (meters, credit grants), Helicone AI Gateway, Mastra agents (factory pattern), OpenAI GPT-5.2 via `@ai-sdk/openai`, Supabase (platform DB)

---

## Context for the Implementer

- **Design doc:** `docs/plans/2026-02-15-model-routing-credits-design.md`
- **Current git state:** `main` branch, 174 tests passing, 0 tsc errors
- **Project:** VibeStack platform — AI app builder (Next.js 16 + Supabase + Mastra agents)
- **Generated apps** run in Daytona sandboxes (Vite + React), NOT on the platform itself
- **The platform** is Next.js App Router with SSE streaming from Mastra agent pipelines

### Key files you'll touch (read these first)

| File | Lines | Purpose |
|------|-------|---------|
| `supabase/migrations/001_init.sql` | 213 | Platform DB schema — profiles, projects tables |
| `lib/agents/registry.ts` | 497 | 9 Mastra agents + supervisor, model constants at L33-35 |
| `app/api/agent/route.ts` | 162 | SSE route — supervisor.network() call, chunk → StreamEvent bridge |
| `app/api/chat/route.ts` | 72 | **TO DELETE** — Anthropic chat route (replaced by supervisor) |
| `app/api/stripe/webhook/route.ts` | 149 | Stripe webhooks — checkout, subscription lifecycle |
| `app/api/stripe/checkout/route.ts` | 108 | Stripe checkout session creation |
| `components/builder-chat.tsx` | 763 | Chat UI — uses `useChat` for `/api/chat`, SSE for `/api/agent` |
| `components/prompt-bar.tsx` | 129 | Model selector UI (L33-37: models array) |
| `lib/types.ts` | 410 | StreamEvent union, Project interface, agent event types |
| `lib/sse.ts` | 57 | SSE stream helper — no changes needed |
| `tests/agent-registry.test.ts` | 103 | Agent registry unit tests |
| `.env.example` | 43 | Environment variables template |
| `.env.local` | 69 | Actual env vars (gitignored) |

---

## Task 1: Database Migration — Credits Schema

**Files:**
- Create: `supabase/migrations/002_credits.sql`
- Test: `tests/credits-schema.test.ts`

**Step 1: Write the migration SQL**

Create `supabase/migrations/002_credits.sql`:

```sql
-- ============================================================================
-- 002: Credit-Based Billing Schema
-- Adds credit tracking to profiles and usage audit log
-- ============================================================================

-- Add credit columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS credits_remaining INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS credits_monthly INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ;

-- Update existing pro users to have pro credits
UPDATE profiles SET credits_monthly = 2000, credits_remaining = 2000 WHERE plan = 'pro';

-- Usage events audit log
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('chat', 'generation')),
  model TEXT NOT NULL DEFAULT 'gpt-5.2',
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

-- Index for querying user's usage history
CREATE INDEX idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX idx_usage_events_created_at ON usage_events(created_at DESC);

-- RPC: Atomic credit deduction + usage logging
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_project_id UUID DEFAULT NULL,
  p_model TEXT DEFAULT 'gpt-5.2',
  p_event_type TEXT DEFAULT 'generation',
  p_tokens_input INTEGER DEFAULT 0,
  p_tokens_output INTEGER DEFAULT 0,
  p_tokens_total INTEGER DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  -- Atomic deduction
  UPDATE profiles
    SET credits_remaining = credits_remaining - p_credits
    WHERE id = p_user_id
    RETURNING credits_remaining INTO v_remaining;

  -- Audit log
  INSERT INTO usage_events (
    user_id, project_id, event_type, model,
    tokens_input, tokens_output, tokens_total, credits_used
  ) VALUES (
    p_user_id, p_project_id, p_event_type, p_model,
    p_tokens_input, p_tokens_output, p_tokens_total, p_credits
  );

  RETURN v_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2: Update TypeScript types**

In `lib/types.ts`, add after the `Project` interface (line 236):

```typescript
// ============================================================================
// Billing & Credits
// ============================================================================

export interface UserCredits {
  credits_remaining: number;
  credits_monthly: number;
  credits_reset_at: string | null;
  plan: 'free' | 'pro';
}

export interface UsageEvent {
  id: string;
  user_id: string;
  project_id: string | null;
  event_type: 'chat' | 'generation';
  model: string;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  credits_used: number;
  stripe_meter_event_id: string | null;
  created_at: string;
}
```

Add `CreditsUsedEvent` to the `StreamEvent` union (after line 275):

```typescript
  | CreditsUsedEvent
```

Add the event interface (after `AgentCompleteEvent`, line 391):

```typescript
export interface CreditsUsedEvent {
  type: "credits_used";
  creditsUsed: number;
  creditsRemaining: number;
  tokensTotal: number;
}
```

**Step 3: Write the test**

Create `tests/credits-schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { UserCredits, UsageEvent, CreditsUsedEvent, StreamEvent } from '@/lib/types';

describe('Credits Types', () => {
  it('UserCredits interface has required fields', () => {
    const credits: UserCredits = {
      credits_remaining: 2000,
      credits_monthly: 2000,
      credits_reset_at: '2026-03-15T00:00:00Z',
      plan: 'pro',
    };
    expect(credits.credits_remaining).toBe(2000);
    expect(credits.plan).toBe('pro');
  });

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
    };
    expect(event.credits_used).toBe(2);
  });

  it('CreditsUsedEvent is part of StreamEvent union', () => {
    const event: StreamEvent = {
      type: 'credits_used',
      creditsUsed: 5,
      creditsRemaining: 1995,
      tokensTotal: 5000,
    };
    expect(event.type).toBe('credits_used');
  });

  it('free plan defaults', () => {
    const free: UserCredits = {
      credits_remaining: 200,
      credits_monthly: 200,
      credits_reset_at: null,
      plan: 'free',
    };
    expect(free.credits_monthly).toBe(200);
  });

  it('pro plan defaults', () => {
    const pro: UserCredits = {
      credits_remaining: 2000,
      credits_monthly: 2000,
      credits_reset_at: '2026-03-15T00:00:00Z',
      plan: 'pro',
    };
    expect(pro.credits_monthly).toBe(2000);
  });
});
```

**Step 4: Run tests**

```bash
pnpm test tests/credits-schema.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Run full suite + type check**

```bash
npx tsc --noEmit && pnpm test
```

Expected: 0 type errors, all tests pass.

**Step 6: Commit**

```bash
git add supabase/migrations/002_credits.sql lib/types.ts tests/credits-schema.test.ts
git commit -m "feat: add credits schema migration and billing types"
```

---

## Task 2: Helicone Provider Factory

**Files:**
- Create: `lib/agents/provider.ts`
- Modify: `.env.example` — add `HELICONE_API_KEY`
- Test: `tests/agent-provider.test.ts`

**Step 1: Create the Helicone provider factory**

Create `lib/agents/provider.ts`:

```typescript
/**
 * Helicone-proxied OpenAI provider factory
 *
 * All LLM calls route through Helicone for observability and per-user tracking.
 * Falls back to direct OpenAI if HELICONE_API_KEY is not set (local dev).
 */
import { createOpenAI } from '@ai-sdk/openai';

const HELICONE_GATEWAY = 'https://oai.helicone.ai/v1';

/**
 * Creates an OpenAI provider instance routed through Helicone.
 * Each request is tagged with the user ID for per-user cost tracking.
 *
 * @param userId - Supabase user ID for Helicone-User-Id header
 * @returns OpenAI provider function — call with model name, e.g. provider('gpt-5.2')
 */
export function createHeliconeProvider(userId: string) {
  const apiKey = process.env.HELICONE_API_KEY;

  if (!apiKey) {
    // Fall back to direct OpenAI (local dev without Helicone)
    return createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: HELICONE_GATEWAY,
    headers: {
      'Helicone-Auth': `Bearer ${apiKey}`,
      'Helicone-User-Id': userId,
    },
  });
}

/** Allowed models — only gpt-5.2 is enabled for now */
export const ALLOWED_MODELS = ['gpt-5.2'] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/** Validate that a model string is allowed */
export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}
```

**Step 2: Add HELICONE_API_KEY to .env.example**

In `.env.example`, add after the OpenAI section (line 19):

```
# Helicone LLM Proxy (observability + per-user cost tracking)
HELICONE_API_KEY=sk-helicone-your-key
```

**Step 3: Write the test**

Create `tests/agent-provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @ai-sdk/openai before importing
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn((config: Record<string, unknown>) => {
    // Return a function that captures the config for assertions
    const provider = (model: string) => ({ model, ...config });
    provider._config = config;
    return provider;
  }),
}));

describe('Agent Provider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('routes through Helicone when HELICONE_API_KEY is set', async () => {
    process.env.HELICONE_API_KEY = 'sk-helicone-test';
    process.env.OPENAI_API_KEY = 'sk-openai-test';

    const { createHeliconeProvider } = await import('@/lib/agents/provider');
    const { createOpenAI } = await import('@ai-sdk/openai');

    createHeliconeProvider('user-123');

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://oai.helicone.ai/v1',
        headers: expect.objectContaining({
          'Helicone-Auth': 'Bearer sk-helicone-test',
          'Helicone-User-Id': 'user-123',
        }),
      })
    );
  });

  it('falls back to direct OpenAI when HELICONE_API_KEY is not set', async () => {
    delete process.env.HELICONE_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-openai-test';

    const { createHeliconeProvider } = await import('@/lib/agents/provider');
    const { createOpenAI } = await import('@ai-sdk/openai');

    createHeliconeProvider('user-123');

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-openai-test',
      })
    );
    // Should NOT have Helicone headers
    expect(createOpenAI).not.toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.stringContaining('helicone'),
      })
    );
  });

  it('isAllowedModel validates correctly', async () => {
    const { isAllowedModel } = await import('@/lib/agents/provider');

    expect(isAllowedModel('gpt-5.2')).toBe(true);
    expect(isAllowedModel('gpt-5-mini')).toBe(false);
    expect(isAllowedModel('claude-sonnet')).toBe(false);
  });

  it('ALLOWED_MODELS contains only gpt-5.2', async () => {
    const { ALLOWED_MODELS } = await import('@/lib/agents/provider');
    expect(ALLOWED_MODELS).toEqual(['gpt-5.2']);
  });
});
```

**Step 4: Run tests**

```bash
pnpm test tests/agent-provider.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add lib/agents/provider.ts .env.example tests/agent-provider.test.ts
git commit -m "feat: add Helicone provider factory for model routing"
```

---

## Task 3: Registry Refactor — Singleton → Factory

This is the biggest change. The agent registry currently exports singleton agents. We need to export a factory function that creates agents per-request with the user's model choice + Helicone headers.

**Files:**
- Modify: `lib/agents/registry.ts` — refactor to factory pattern
- Modify: `lib/agents/index.ts` — update barrel exports
- Modify: `tests/agent-registry.test.ts` — update for factory pattern

**Step 1: Refactor registry.ts**

Replace the entire content of `lib/agents/registry.ts`. Key changes:
- Remove model constants (L33-35)
- Remove singleton agent exports
- Add `createAgentNetwork(model, userId)` factory function
- Keep `mastra` instance export (needed for Mastra internals)
- Memory config stays on the supervisor (thread/resource scoping)

The new file structure:

```typescript
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { /* all tool imports unchanged */ } from './tools';
import { generateShadcnManifest } from '@/lib/shadcn-manifest';
import { createHeliconeProvider, type AllowedModel } from './provider';

// Lazy shadcn manifest cache (unchanged)
let _manifestCache: string | null = null;
function getShadcnManifestString(): string { /* unchanged */ }

/**
 * Creates the full 9-agent supervisor network for a specific request.
 *
 * @param model - User-selected model (e.g., 'gpt-5.2')
 * @param userId - Supabase user ID (for Helicone tracking + memory scoping)
 * @returns { supervisor, mastra } — the supervisor agent and Mastra instance
 */
export function createAgentNetwork(model: AllowedModel, userId: string) {
  const provider = createHeliconeProvider(userId);

  // All agents use the user-selected model through Helicone
  const primaryModel = provider(model);
  // Validator agents can use a cheaper model variant
  const validatorModel = provider(model);  // Same for now; can split later

  const analystAgent = new Agent({
    id: 'analyst',
    name: 'Analyst',
    model: primaryModel,
    // ... (instructions + tools unchanged)
  });

  // ... (all other agents with same instructions/tools, using primaryModel or validatorModel)

  const supervisorAgent = new Agent({
    id: 'supervisor',
    name: 'Supervisor',
    model: primaryModel,
    // ... instructions unchanged
    agents: {
      analyst: analystAgent,
      infraEngineer: infraAgent,
      databaseAdmin: dbaAgent,
      backendEngineer: backendAgent,
      frontendEngineer: frontendAgent,
      codeReviewer: reviewerAgent,
      qaEngineer: qaAgent,
      devOpsEngineer: devOpsAgent,
    },
    ...(process.env.DATABASE_URL
      ? {
          memory: new Memory({
            storage: new PostgresStore({
              id: 'supervisor-memory',
              connectionString: process.env.DATABASE_URL,
            }),
            options: {
              lastMessages: false,
              workingMemory: {
                enabled: true,
                scope: 'resource',
                template: `/* unchanged */`,
              },
            },
          }),
        }
      : {}),
  });

  return { supervisor: supervisorAgent };
}

/**
 * Central Mastra instance — lightweight, used for Mastra internals only.
 * Agents are created per-request via createAgentNetwork().
 */
export const mastra = new Mastra({});
```

**IMPORTANT:** Do NOT change any agent instructions, tool assignments, or memory config. Only change:
1. Remove `const ORCHESTRATOR_MODEL/CODEGEN_MODEL/VALIDATOR_MODEL`
2. Wrap all agent creation inside `createAgentNetwork()`
3. Agents use `primaryModel` (from provider) instead of string constants
4. Export `createAgentNetwork` instead of individual agent singletons
5. `mastra` export becomes a bare `new Mastra({})` — agents are per-request now

**Step 2: Update barrel exports**

In `lib/agents/index.ts`, update exports:

```typescript
export { createAgentNetwork, mastra } from './registry';
export { createHeliconeProvider, isAllowedModel, ALLOWED_MODELS } from './provider';
export type { AllowedModel } from './provider';
```

**Step 3: Update tests**

Rewrite `tests/agent-registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the provider to avoid real OpenAI/Helicone calls
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => {
    const provider = (model: string) => `mock-model:${model}`;
    return provider;
  }),
}));

describe('Agent Registry', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('createAgentNetwork returns supervisor agent', async () => {
    const { createAgentNetwork } = await import('@/lib/agents/registry');
    const { supervisor } = createAgentNetwork('gpt-5.2', 'test-user-id');
    expect(supervisor).toBeDefined();
    expect(supervisor.id).toBe('supervisor');
  });

  it('supervisor has all 8 sub-agents registered', async () => {
    const { createAgentNetwork } = await import('@/lib/agents/registry');
    const { supervisor } = createAgentNetwork('gpt-5.2', 'test-user-id');
    const subAgents = supervisor.listAgents();
    expect(Object.keys(subAgents)).toHaveLength(8);
  });

  it('exports mastra instance', async () => {
    const { mastra } = await import('@/lib/agents/registry');
    expect(mastra).toBeDefined();
  });

  it('each sub-agent has correct tools', async () => {
    const { createAgentNetwork } = await import('@/lib/agents/registry');
    const { supervisor } = createAgentNetwork('gpt-5.2', 'test-user-id');
    const agents = supervisor.listAgents();

    // Supervisor has no direct tools (pure orchestrator)
    const supervisorTools = supervisor.listTools();
    expect(Object.keys(supervisorTools)).toHaveLength(0);

    // Check key agent tool assignments
    expect(Object.keys(agents.analyst.listTools())).toContain('searchDocs');
    expect(Object.keys(agents.infraEngineer.listTools())).toContain('createSandbox');
    expect(Object.keys(agents.codeReviewer.listTools())).toContain('readFile');
    expect(Object.keys(agents.codeReviewer.listTools())).not.toContain('writeFile');
  });

  it('supervisor memory does not throw without DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { createAgentNetwork } = await import('@/lib/agents/registry');
    const { supervisor } = createAgentNetwork('gpt-5.2', 'test-user-id');
    expect(() => supervisor.getMemory()).not.toThrow();
  });
});
```

**Step 4: Run tests**

```bash
pnpm test tests/agent-registry.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Type check + full suite**

```bash
npx tsc --noEmit && pnpm test
```

Expected: 0 type errors, all tests pass. **If other tests import `supervisorAgent` from registry, they will break — fix any broken imports to use `createAgentNetwork` instead.**

**Step 6: Commit**

```bash
git add lib/agents/registry.ts lib/agents/index.ts lib/agents/provider.ts tests/agent-registry.test.ts
git commit -m "refactor: convert agent registry from singletons to per-request factory"
```

---

## Task 4: Agent Route — Credit Guard + Deduction

**Files:**
- Modify: `app/api/agent/route.ts` — add credit check, model param, post-execution deduction
- Create: `lib/credits.ts` — credit checking and deduction helpers
- Test: `tests/credits.test.ts`

**Step 1: Create credit helpers**

Create `lib/credits.ts`:

```typescript
/**
 * Credit checking and deduction utilities
 *
 * Uses Supabase RPC for atomic credit operations.
 * Stripe meter events are fired asynchronously (fire-and-forget).
 */
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserCredits } from './types';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-01-28.clover' })
  : null;

/** Check if user has sufficient credits */
export async function checkCredits(
  supabase: SupabaseClient,
  userId: string
): Promise<UserCredits | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('credits_remaining, credits_monthly, credits_reset_at, plan')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as UserCredits;
}

/** Deduct credits after generation and log usage */
export async function deductCredits(
  supabase: SupabaseClient,
  params: {
    userId: string;
    projectId: string;
    model: string;
    eventType: 'chat' | 'generation';
    tokensInput: number;
    tokensOutput: number;
    tokensTotal: number;
  }
): Promise<number> {
  const creditsUsed = Math.ceil(params.tokensTotal / 1000);

  const { data: remaining, error } = await supabase.rpc('deduct_credits', {
    p_user_id: params.userId,
    p_credits: creditsUsed,
    p_project_id: params.projectId,
    p_model: params.model,
    p_event_type: params.eventType,
    p_tokens_input: params.tokensInput,
    p_tokens_output: params.tokensOutput,
    p_tokens_total: params.tokensTotal,
  });

  if (error) {
    console.error('[credits] deduction failed:', error);
    return creditsUsed; // Still return the amount for client-side display
  }

  // Fire-and-forget Stripe meter event
  reportToStripe(params.userId, params.tokensTotal, supabase).catch(console.error);

  return creditsUsed;
}

/** Report usage to Stripe meter (async, non-blocking) */
async function reportToStripe(
  userId: string,
  tokensTotal: number,
  supabase: SupabaseClient
): Promise<void> {
  if (!stripe) return;

  // Look up Stripe customer ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_customer_id) return;

  await stripe.billing.meterEvents.create({
    event_name: 'vibestack_tokens',
    payload: {
      stripe_customer_id: profile.stripe_customer_id,
      value: String(tokensTotal),
    },
  });
}
```

**Step 2: Rewrite agent route**

Replace `app/api/agent/route.ts` content. Key changes:
- Accept `model` in request body
- Validate model against `ALLOWED_MODELS`
- Query `credits_remaining` before starting pipeline
- Return 402 if insufficient credits
- Use `createAgentNetwork(model, userId)` instead of singleton `supervisorAgent`
- Sum `totalTokens` from all `agent-execution-end` chunks
- Call `deductCredits()` after pipeline completes
- Emit `credits_used` SSE event to client

```typescript
import { NextRequest } from 'next/server';
import { createSSEStream } from '@/lib/sse';
import type { StreamEvent } from '@/lib/types';
import { createAgentNetwork } from '@/lib/agents/registry';
import { isAllowedModel } from '@/lib/agents/provider';
import { getUser } from '@/lib/supabase-server';
import { createClient } from '@/lib/supabase-server';
import { checkCredits, deductCredits } from '@/lib/credits';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: { message?: string; projectId?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { message, projectId, model = 'gpt-5.2' } = body;

  if (!message || !projectId) {
    return new Response(JSON.stringify({ error: 'Missing message or projectId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isAllowedModel(model)) {
    return new Response(JSON.stringify({ error: `Model "${model}" is not available` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auth check
  const user = await getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Credit check
  const supabase = await createClient();
  const credits = await checkCredits(supabase, user.id);
  if (!credits || credits.credits_remaining <= 0) {
    return new Response(
      JSON.stringify({
        error: 'insufficient_credits',
        credits_remaining: credits?.credits_remaining ?? 0,
        credits_reset_at: credits?.credits_reset_at ?? null,
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create agent network for this request
  const { supervisor } = createAgentNetwork(model, user.id);

  return createSSEStream(async (emit: (event: StreamEvent) => void, signal: AbortSignal) => {
    let totalTokens = 0;

    try {
      emit({ type: 'stage_update', stage: 'generating' });

      const result = await supervisor.network(message, {
        memory: {
          thread: projectId,
          resource: user.id,
        },
      });

      for await (const chunk of result) {
        if (signal.aborted) {
          console.log('[agent] Client disconnected, stopping stream');
          break;
        }

        const payload = (chunk as any).payload ?? {};

        switch (chunk.type) {
          // ... (all existing chunk handlers unchanged)

          case 'agent-execution-end':
            const agentTokens = payload.usage?.totalTokens ?? payload.tokensUsed ?? 0;
            totalTokens += agentTokens;
            emit({
              type: 'agent_complete',
              agentId: payload.agentId ?? 'unknown',
              tokensUsed: agentTokens,
              durationMs: payload.durationMs ?? 0,
            });
            break;

          // ... (rest of switch unchanged)
        }
      }

      // Deduct credits after successful completion
      if (totalTokens > 0) {
        const creditsUsed = await deductCredits(supabase, {
          userId: user.id,
          projectId,
          model,
          eventType: 'generation',
          tokensInput: Math.round(totalTokens * 0.7),  // Estimate 70/30 split
          tokensOutput: Math.round(totalTokens * 0.3),
          tokensTotal: totalTokens,
        });

        const updatedCredits = await checkCredits(supabase, user.id);
        emit({
          type: 'credits_used',
          creditsUsed,
          creditsRemaining: updatedCredits?.credits_remaining ?? 0,
          tokensTotal: totalTokens,
        });
      }

      emit({ type: 'stage_update', stage: 'complete' });
    } catch (error) {
      // Still deduct credits on error (tokens were consumed)
      if (totalTokens > 0) {
        await deductCredits(supabase, {
          userId: user.id,
          projectId,
          model,
          eventType: 'generation',
          tokensInput: Math.round(totalTokens * 0.7),
          tokensOutput: Math.round(totalTokens * 0.3),
          tokensTotal: totalTokens,
        }).catch(console.error);
      }

      if (signal.aborted) {
        console.log('[agent] Stream aborted by client');
        return;
      }
      emit({
        type: 'error',
        message: error instanceof Error ? error.message : 'Agent pipeline failed',
        stage: 'error',
      });
    }
  });
}
```

**Step 3: Write tests**

Create `tests/credits.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkCredits } from '@/lib/credits';

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
    } as any;

    const credits = await checkCredits(mockSupabase, 'user-123');
    expect(credits).not.toBeNull();
    expect(credits!.credits_remaining).toBe(1500);
    expect(credits!.plan).toBe('pro');
  });

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
    } as any;

    const credits = await checkCredits(mockSupabase, 'user-999');
    expect(credits).toBeNull();
  });

  it('credit math: 1 credit = 1000 tokens', () => {
    const tokensUsed = 5432;
    const creditsUsed = Math.ceil(tokensUsed / 1000);
    expect(creditsUsed).toBe(6); // Rounds up
  });

  it('credit math: exact boundary', () => {
    expect(Math.ceil(1000 / 1000)).toBe(1);
    expect(Math.ceil(1001 / 1000)).toBe(2);
    expect(Math.ceil(999 / 1000)).toBe(1);
    expect(Math.ceil(0 / 1000)).toBe(0);
  });
});
```

**Step 4: Run tests**

```bash
pnpm test tests/credits.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Type check + full suite**

```bash
npx tsc --noEmit && pnpm test
```

**Step 6: Commit**

```bash
git add lib/credits.ts app/api/agent/route.ts tests/credits.test.ts
git commit -m "feat: add credit guard and deduction to agent route"
```

---

## Task 5: Stripe Webhook — Credit Grants on Subscription

**Files:**
- Modify: `app/api/stripe/webhook/route.ts` — add credit provisioning
- Modify: `app/api/stripe/checkout/route.ts` — update product description

**Step 1: Enhance webhook handler**

Add credit provisioning logic to the webhook. Key changes:

In `checkout.session.completed` handler (after line 59):
```typescript
// Update plan AND provision credits
const { error } = await supabase
  .from("profiles")
  .update({
    plan: "pro",
    credits_monthly: 2000,
    credits_remaining: 2000,
  })
  .eq("id", userId);
```

In `customer.subscription.deleted` handler (after line 87):
```typescript
// Downgrade plan AND reset to free credits
const { error: updateError } = await supabase
  .from("profiles")
  .update({
    plan: "free",
    credits_monthly: 200,
    credits_remaining: 200,
    credits_reset_at: null,
  })
  .eq("id", profile.id);
```

Add a new `invoice.paid` handler (after `customer.subscription.updated` case):
```typescript
case "invoice.paid": {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  // Only process subscription renewals (not initial payment)
  if (!invoice.subscription) break;

  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, credits_monthly")
    .eq("stripe_customer_id", customerId)
    .single();

  if (fetchError || !profile) break;

  // Reset credits for the new billing period
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      credits_remaining: profile.credits_monthly,
      credits_reset_at: new Date(
        (invoice.lines.data[0]?.period?.end ?? 0) * 1000
      ).toISOString(),
    })
    .eq("id", profile.id);

  if (!updateError) {
    console.log(`User ${profile.id} credits reset to ${profile.credits_monthly}`);
  }
  break;
}
```

**Step 2: Update checkout description**

In `app/api/stripe/checkout/route.ts` (line 79):
```typescript
description: "2,000 credits/month (~7 app generations) with priority support",
```

**Step 3: Run type check + tests**

```bash
npx tsc --noEmit && pnpm test
```

**Step 4: Commit**

```bash
git add app/api/stripe/webhook/route.ts app/api/stripe/checkout/route.ts
git commit -m "feat: add credit provisioning to Stripe webhooks"
```

---

## Task 6: Remove /api/chat — Unify on /api/agent

**Files:**
- Delete: `app/api/chat/route.ts`
- Modify: `components/builder-chat.tsx` — remove `useChat`, unify on SSE to `/api/agent`

**Step 1: Delete the chat route**

```bash
rm app/api/chat/route.ts
```

**Step 2: Refactor builder-chat.tsx**

This is the biggest frontend change. Currently `builder-chat.tsx` has two flows:
1. `useChat` → `/api/chat` (for planning phase with Claude)
2. `fetch` → `/api/agent` (for generation phase with Mastra)

After this change, ALL messages go through `/api/agent` (Mastra supervisor routes to analyst for chat, full pipeline for generation).

Key changes:
- Remove `useChat` import and hook usage (lines 4, 124-133)
- Remove `DefaultChatTransport` import (line 5)
- Add custom message state management (replacing `useChat`'s `messages`)
- All user messages sent via `fetch` to `/api/agent`
- Parse SSE responses for both chat and generation events
- The supervisor/analyst agent handles the planning phase now

**IMPORTANT**: The analyst agent's response comes through as `agent-execution-event-text-delta` chunks (via SSE), NOT as Vercel AI SDK `UIMessage` parts. You need to handle streaming text from SSE and build up messages client-side.

This is a significant refactor of the chat UI. The implementer should:
1. Replace `useChat` with a custom `messages` state array
2. Send messages via `fetch` to `/api/agent` (same pattern as `handleStartGeneration`)
3. Parse SSE events and append to messages
4. Handle `agent_start` (analyst responding) → `agent_progress` (text streaming) → `agent_complete` (done)
5. Keep all the tool rendering (show_plan, thinking_steps) — but these will come from Mastra agent tool calls now, not Vercel AI SDK tool calls. The format WILL differ.

**Note**: This task requires careful testing since it changes the entire chat UX. The implementer should verify:
- User can send a message and see the analyst respond
- Plan approval flow still works
- Generation trigger still works
- Credits display updates after generation

**Step 3: Type check + run tests**

```bash
npx tsc --noEmit && pnpm test
```

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor: remove /api/chat, unify all AI calls through /api/agent"
```

---

## Task 7: Frontend — Credit Display + Out-of-Credits UI

**Files:**
- Create: `components/credit-display.tsx` — credit counter component
- Modify: `components/builder-chat.tsx` — add credit display, 402 handling
- Modify: `components/prompt-bar.tsx` — disable unavailable models

**Step 1: Create credit display component**

Create `components/credit-display.tsx`:

```typescript
"use client";

import { Coins } from "lucide-react";

interface CreditDisplayProps {
  remaining: number;
  monthly: number;
  plan: "free" | "pro";
  resetAt?: string | null;
}

export function CreditDisplay({ remaining, monthly, plan, resetAt }: CreditDisplayProps) {
  const pct = monthly > 0 ? (remaining / monthly) * 100 : 0;
  const isLow = pct < 20;

  return (
    <div className="flex items-center gap-2 text-sm">
      <Coins className={`size-4 ${isLow ? "text-amber-500" : "text-muted-foreground"}`} />
      <span className={isLow ? "text-amber-500 font-medium" : "text-muted-foreground"}>
        {remaining.toLocaleString()} / {monthly.toLocaleString()}
      </span>
    </div>
  );
}
```

**Step 2: Update prompt-bar.tsx — disable unavailable models**

In `components/prompt-bar.tsx`, modify the models array (line 33-37):

```typescript
const models = [
  { id: "gpt-5.2", name: "GPT-5.2", provider: "openai" as const, available: true },
  { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max", provider: "openai" as const, available: false },
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai" as const, available: false },
];
```

In the model selector render loop, add disabled state for unavailable models:

```tsx
{models.map((m) => (
  <ModelSelectorItem
    key={m.id}
    isSelected={model === m.id}
    onSelect={() => {
      if (!m.available) return;
      setModel(m.id);
      setSelectorOpen(false);
    }}
    className={!m.available ? "opacity-50 cursor-not-allowed" : ""}
  >
    <ModelSelectorLogo provider={m.provider} />
    <span>{m.name}</span>
    {!m.available && (
      <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
    )}
  </ModelSelectorItem>
))}
```

**Step 3: Add 402 handling in builder-chat.tsx**

In the SSE fetch handler (around line 215), add 402 handling:

```typescript
if (response.status === 402) {
  const errorData = await response.json();
  // Show out-of-credits state
  setGenerationStatus("error");
  // Set a state that triggers the out-of-credits modal
  setCreditError({
    creditsRemaining: errorData.credits_remaining,
    resetAt: errorData.credits_reset_at,
  });
  return;
}
```

Add the `credits_used` event handler in `handleGenerationEvent`:

```typescript
case "credits_used":
  // Update credit display after generation
  setUserCredits(prev => prev ? {
    ...prev,
    credits_remaining: event.creditsRemaining,
  } : prev);
  break;
```

**Step 4: Type check + test**

```bash
npx tsc --noEmit && pnpm test
```

**Step 5: Commit**

```bash
git add components/credit-display.tsx components/prompt-bar.tsx components/builder-chat.tsx
git commit -m "feat: add credit display, model gating, and 402 handling"
```

---

## Task 8: Environment + CLAUDE.md Updates

**Files:**
- Modify: `.env.example` — add `HELICONE_API_KEY`
- Modify: `CLAUDE.md` — add HELICONE_API_KEY to env table, update architecture notes

**Step 1: Update .env.example**

Add after the OpenAI section:

```
# Helicone LLM Proxy (observability + per-user cost tracking)
HELICONE_API_KEY=sk-helicone-your-key
```

**Step 2: Update CLAUDE.md**

Add to the Environment Variables table:

```
| `HELICONE_API_KEY` | Helicone LLM proxy (observability) |
```

Update Architecture section to note:
- Agent registry uses factory pattern (per-request)
- All LLM calls route through Helicone proxy
- Credit guard on `/api/agent` returns 402 when depleted
- `/api/chat` removed — supervisor handles all phases

**Step 3: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: update env vars and architecture notes for credits system"
```

---

## Task 9: Final Integration Verification

**Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 2: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass.

**Step 3: Verify no broken imports**

```bash
grep -r "supervisorAgent" --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

If any file still imports `supervisorAgent` directly, fix it to use `createAgentNetwork`.

**Step 4: Build check**

```bash
pnpm build
```

Expected: Build succeeds.

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix: resolve integration issues from credits implementation"
```

---

## Summary

| Task | Files Changed | Description |
|------|--------------|-------------|
| 1 | 3 created | DB migration + billing types |
| 2 | 2 created, 1 modified | Helicone provider factory |
| 3 | 3 modified | Registry singleton → factory refactor |
| 4 | 2 created, 1 modified | Credit guard + deduction in agent route |
| 5 | 2 modified | Stripe webhook credit provisioning |
| 6 | 1 deleted, 1 modified | Remove /api/chat, unify on /api/agent |
| 7 | 1 created, 2 modified | Frontend credit display + model gating |
| 8 | 2 modified | Docs + env updates |
| 9 | verification | Integration checks |

**Total: ~9 tasks, ~15 files touched**

**Dependency order:**
```
Task 1 (DB) ──┬── Task 2 (Helicone) ── Task 3 (Registry) ── Task 4 (Route) ── Task 6 (Remove chat) ── Task 7 (Frontend)
              └── Task 5 (Stripe)
Task 8 (Docs) — independent
Task 9 (Verify) — last
```
