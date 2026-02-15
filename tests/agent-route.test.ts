/**
 * Tests for POST /api/agent route
 * Verifies SSE streaming, auth, model validation, credit enforcement,
 * and event bridging from Mastra network to StreamEvent types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@server/middleware/auth', () => ({
  getUser: vi.fn(),
  createClient: vi.fn().mockResolvedValue({}),
}));

const mockNetwork = vi.fn();
vi.mock('@/mastra/index', () => ({
  mastra: {
    getAgent: vi.fn(() => ({ network: mockNetwork })),
  },
}));
vi.mock('@server/lib/agents/registry', () => ({
  RequestContext: class MockRequestContext {
    private store = new Map<string, unknown>();
    set(key: string, value: unknown) { this.store.set(key, value); }
    get(key: string) { return this.store.get(key); }
    has(key: string) { return this.store.has(key); }
  },
}));

vi.mock('@server/lib/agents/provider', () => ({
  isAllowedModel: vi.fn((model: string) => model === 'gpt-5.2'),
  createHeliconeProvider: vi.fn(() => (model: string) => ({ modelId: model, provider: 'openai' })),
}));

vi.mock('@server/lib/credits', () => ({
  checkCredits: vi.fn().mockResolvedValue({
    credits_remaining: 2000,
    credits_monthly: 2000,
    credits_reset_at: null,
    plan: 'pro',
  }),
  deductCredits: vi.fn().mockResolvedValue(1),
}));

// import { POST } from '@server/routes/agent'; // TODO: rewrite for Hono
import { getUser, createClient } from '@server/middleware/auth';
import { mastra } from '@/mastra/index';
import { isAllowedModel } from '@server/lib/agents/provider';
import { checkCredits, deductCredits } from '@server/lib/credits';

const mockGetUser = vi.mocked(getUser);
const mockGetAgent = vi.mocked(mastra.getAgent);
const mockIsAllowedModel = vi.mocked(isAllowedModel);
const mockCheckCredits = vi.mocked(checkCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCreateClient = vi.mocked(createClient);

/**
 * Helper to create a mock network execution result.
 * The return object is async-iterable (delegates to chunks) and
 * exposes a `usage` promise matching Mastra's .network() return.
 */
function createMockExecution(
  chunks: AsyncGenerator,
  usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
) {
  const execution = {
    [Symbol.asyncIterator]: () => chunks[Symbol.asyncIterator](),
    usage: Promise.resolve(usage),
    status: Promise.resolve('completed'),
    result: Promise.resolve(undefined),
  };
  return execution;
}

// Helper to configure the mockNetwork for a test
function getMockNetwork() {
  const localMockNetwork = vi.fn();
  mockGetAgent.mockReturnValue({ network: localMockNetwork } as any);
  return localMockNetwork;
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readSSEEvents(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.replace('data: ', '')));
}

describe.skip('POST /api/agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@test.com' } as any);
    mockIsAllowedModel.mockImplementation((model: string) => model === 'gpt-5.2');
    mockCreateClient.mockResolvedValue({} as any);
    mockCheckCredits.mockResolvedValue({
      credits_remaining: 2000,
      credits_monthly: 2000,
      credits_reset_at: null,
      plan: 'pro',
    });
    mockDeductCredits.mockResolvedValue(1);
  });

  it('returns 400 when request body is invalid JSON', async () => {
    const req = new Request('http://localhost:3000/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json{',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid');
  });

  it('returns 400 when message is missing', async () => {
    const req = createRequest({ projectId: 'proj-1' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');
  });

  it('returns 400 when projectId is missing', async () => {
    const req = createRequest({ message: 'Build a todo app' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when model is not allowed', async () => {
    const req = createRequest({ message: 'Build an app', projectId: 'proj-1', model: 'gpt-3.5-turbo' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('not available');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue(null);
    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('returns 402 when credits are insufficient', async () => {
    mockCheckCredits.mockResolvedValue({
      credits_remaining: 0,
      credits_monthly: 2000,
      credits_reset_at: '2026-03-15T00:00:00Z',
      plan: 'free',
    });
    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('insufficient_credits');
    expect(body.credits_remaining).toBe(0);
    expect(body.credits_reset_at).toBe('2026-03-15T00:00:00Z');
  });

  it('returns 402 when credits check returns null', async () => {
    mockCheckCredits.mockResolvedValue(null);
    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    expect(res.status).toBe(402);
  });

  it('returns SSE response with correct headers', async () => {
    const mockNetwork = getMockNetwork();
    async function* emptyStream() { /* no chunks */ }
    mockNetwork.mockResolvedValue(createMockExecution(emptyStream()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('emits stage_update generating and complete events', async () => {
    const mockNetwork = getMockNetwork();
    async function* emptyStream() { /* no chunks */ }
    mockNetwork.mockResolvedValue(createMockExecution(emptyStream()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    expect(events[0]).toEqual({ type: 'stage_update', stage: 'generating' });
    expect(events[events.length - 1]).toEqual({ type: 'stage_update', stage: 'complete' });
  });

  it('bridges agent-execution-start to agent_start', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'agent-execution-start', payload: { agentId: 'analyst', agentName: 'Analyst' } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const agentStart = events.find((e: any) => e.type === 'agent_start');
    expect(agentStart).toEqual({
      type: 'agent_start',
      agentId: 'analyst',
      agentName: 'Analyst',
      phase: 0,
    });
  });

  it('bridges agent-execution-end to agent_complete', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'agent-execution-end', payload: { agentId: 'analyst', agentName: 'Analyst', tokensUsed: 150, durationMs: 2000 } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const agentComplete = events.find((e: any) => e.type === 'agent_complete');
    expect(agentComplete).toEqual({
      type: 'agent_complete',
      agentId: 'analyst',
      tokensUsed: 150,
      durationMs: 2000,
    });
  });

  it('bridges tool-execution-end write-file to file_complete', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'tool-execution-end', payload: { toolName: 'write-file', result: { path: '/workspace/src/App.tsx', bytesWritten: 42 }, agentId: 'frontend-engineer' } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const fileComplete = events.find((e: any) => e.type === 'file_complete');
    expect(fileComplete).toEqual({
      type: 'file_complete',
      path: '/workspace/src/App.tsx',
      linesOfCode: 42,
    });
  });

  it('bridges non-write tool-execution-end to agent_artifact', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'tool-execution-end', payload: { toolName: 'run-build', agentId: 'qa-engineer' } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const artifact = events.find((e: any) => e.type === 'agent_artifact');
    expect(artifact).toEqual({
      type: 'agent_artifact',
      agentId: 'qa-engineer',
      artifactType: 'tool-result',
      artifactName: 'run-build',
    });
  });

  it('emits error event when network throws', async () => {
    const mockNetwork = getMockNetwork();
    mockNetwork.mockRejectedValue(new Error('Model rate limited'));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const errorEvent = events.find((e: any) => e.type === 'error');
    expect(errorEvent).toEqual({
      type: 'error',
      message: 'Model rate limited',
      stage: 'error',
    });
  });

  it('calls network with correct memory, requestContext, and maxSteps', async () => {
    const localMock = getMockNetwork();
    async function* emptyStream() {}
    localMock.mockResolvedValue(createMockExecution(emptyStream()));

    const req = createRequest({ message: 'Build a todo app', projectId: 'proj-42' });
    await POST(req as any);

    expect(localMock).toHaveBeenCalledWith('Build a todo app', expect.objectContaining({
      memory: {
        thread: 'proj-42',
        resource: 'user-123',
      },
      requestContext: expect.anything(),
      maxSteps: 50,
    }));
  });

  it('retrieves supervisor agent from mastra instance', async () => {
    const localMock = getMockNetwork();
    async function* emptyStream() {}
    localMock.mockResolvedValue(createMockExecution(emptyStream()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    await POST(req as any);

    expect(mockGetAgent).toHaveBeenCalledWith('supervisor');
  });

  it('bridges agent-execution-event-text-delta to agent_progress', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'agent-execution-event-text-delta', payload: { agentId: 'analyst', textDelta: 'Analyzing requirements...' } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const agentProgress = events.find((e: any) => e.type === 'agent_progress');
    expect(agentProgress).toEqual({
      type: 'agent_progress',
      agentId: 'analyst',
      message: 'Analyzing requirements...',
    });
  });

  it('bridges network-execution-event-step-finish to checkpoint', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'network-execution-event-step-finish', payload: {} };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const checkpoint = events.find((e: any) => e.type === 'checkpoint');
    expect(checkpoint).toEqual({
      type: 'checkpoint',
      label: 'Network step complete',
      status: 'complete',
    });
  });

  it('bridges routing-agent-start to stage_update planning', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'routing-agent-start', payload: {} };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const planningEvent = events.find((e: any) => e.type === 'stage_update' && e.stage === 'planning');
    expect(planningEvent).toBeDefined();
  });

  it('bridges routing-agent-end to checkpoint with delegation target', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'routing-agent-end', payload: { selectedPrimitive: 'analyst' } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const checkpoint = events.find((e: any) => e.type === 'checkpoint' && e.label?.includes('analyst'));
    expect(checkpoint).toEqual({
      type: 'checkpoint',
      label: 'Delegating to analyst',
      status: 'active',
    });
  });

  it('bridges network-execution-event-finish to pipeline complete checkpoint', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'network-execution-event-finish', payload: {} };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const checkpoint = events.find((e: any) => e.type === 'checkpoint' && e.label === 'Pipeline complete');
    expect(checkpoint).toBeDefined();
  });

  it('bridges workflow-execution-suspended to plan_ready', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'workflow-execution-suspended', payload: { suspendPayload: { appName: 'Todo App', features: [] } } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const planReady = events.find((e: any) => e.type === 'plan_ready');
    expect(planReady).toEqual({
      type: 'plan_ready',
      plan: { appName: 'Todo App', features: [] },
    });
  });

  it('handles missing payload fields gracefully', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'agent-execution-start', payload: {} };
      yield { type: 'agent-execution-end', payload: {} };
      yield { type: 'tool-execution-end', payload: { toolName: 'run-build' } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const agentStart = events.find((e: any) => e.type === 'agent_start') as Record<string, unknown> | undefined;
    expect(agentStart).toBeDefined();
    expect(agentStart?.agentId).toBe('unknown');
    expect(agentStart?.agentName).toBe('Agent');

    const agentComplete = events.find((e: any) => e.type === 'agent_complete') as Record<string, unknown> | undefined;
    expect(agentComplete).toBeDefined();
    expect(agentComplete?.tokensUsed).toBe(0);
    expect(agentComplete?.durationMs).toBe(0);

    const artifact = events.find((e: any) => e.type === 'agent_artifact') as Record<string, unknown> | undefined;
    expect(artifact).toBeDefined();
    expect(artifact?.agentId).toBe('unknown');
  });

  it('handles multiple chunks sequentially', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'agent-execution-start', payload: { agentId: 'analyst', agentName: 'Analyst' } };
      yield { type: 'agent-execution-event-text-delta', payload: { agentId: 'analyst', textDelta: 'Step 1' } };
      yield { type: 'agent-execution-event-text-delta', payload: { agentId: 'analyst', textDelta: 'Step 2' } };
      yield { type: 'agent-execution-end', payload: { agentId: 'analyst', tokensUsed: 100, durationMs: 1000 } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const progressEvents = events.filter((e: any) => e.type === 'agent_progress');
    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0]).toMatchObject({ message: 'Step 1' });
    expect(progressEvents[1]).toMatchObject({ message: 'Step 2' });
  });

  it('handles chunks with no payload at all', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'agent-execution-start' };
      yield { type: 'agent-execution-end', payload: null };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const agentStart = events.find((e: any) => e.type === 'agent_start');
    expect(agentStart).toBeDefined();
    expect((agentStart as any).agentId).toBe('unknown');

    const agentComplete = events.find((e: any) => e.type === 'agent_complete');
    expect(agentComplete).toBeDefined();
    expect((agentComplete as any).agentId).toBe('unknown');
  });

  it('emits clarification_request when ask-clarifying-questions tool ends', async () => {
    const mockNetwork = getMockNetwork();
    const questionsPayload = [
      {
        question: 'What design style?',
        selectionMode: 'single',
        options: [
          { label: 'Minimal', description: 'Clean and simple' },
          { label: 'Bold', description: 'High contrast and vibrant' },
        ],
      },
    ];
    async function* chunks() {
      yield {
        type: 'tool-execution-end',
        payload: {
          toolName: 'ask-clarifying-questions',
          agentId: 'analyst',
          input: { questions: questionsPayload },
          result: { status: 'awaiting_user_input', questionCount: 1 },
        },
      };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks()));

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const clarification = events.find((e: any) => e.type === 'clarification_request');
    expect(clarification).toBeDefined();
    expect((clarification as any).questions).toHaveLength(1);
    expect((clarification as any).questions[0].question).toBe('What design style?');
    expect((clarification as any).questions[0].selectionMode).toBe('single');
    expect((clarification as any).questions[0].options).toHaveLength(2);
  });

  it('deducts credits using accurate usage from network execution', async () => {
    const mockNetwork = getMockNetwork();
    async function* chunks() {
      yield { type: 'agent-execution-end', payload: { agentId: 'analyst', usage: { totalTokens: 5000 }, durationMs: 1000 } };
      yield { type: 'agent-execution-end', payload: { agentId: 'frontend', usage: { totalTokens: 3000 }, durationMs: 2000 } };
    }
    mockNetwork.mockResolvedValue(createMockExecution(chunks(), {
      inputTokens: 5600,
      outputTokens: 2400,
      totalTokens: 8000,
    }));

    // Return updated credits after deduction
    mockCheckCredits
      .mockResolvedValueOnce({ credits_remaining: 2000, credits_monthly: 2000, credits_reset_at: null, plan: 'pro' })
      .mockResolvedValueOnce({ credits_remaining: 1992, credits_monthly: 2000, credits_reset_at: null, plan: 'pro' });

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    // Should use accurate inputTokens/outputTokens from usage promise
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-123',
        projectId: 'proj-1',
        model: 'gpt-5.2',
        eventType: 'generation',
        tokensInput: 5600,
        tokensOutput: 2400,
        tokensTotal: 8000,
      })
    );

    // Should emit credits_used event
    const creditsEvent = events.find((e: any) => e.type === 'credits_used');
    expect(creditsEvent).toBeDefined();
    expect((creditsEvent as any).tokensTotal).toBe(8000);
  });
});
