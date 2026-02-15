/**
 * Tests for POST /api/agent route
 * Verifies SSE streaming, auth, and event bridging from Mastra network to StreamEvent types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => ({
  getUser: vi.fn(),
}));

vi.mock('@/lib/agents/registry', () => ({
  supervisorAgent: {
    network: vi.fn(),
  },
}));

import { POST } from '@/app/api/agent/route';
import { getUser } from '@/lib/supabase-server';
import { supervisorAgent } from '@/lib/agents/registry';

const mockGetUser = vi.mocked(getUser);
const mockNetwork = vi.mocked(supervisorAgent.network);

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

describe('POST /api/agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 'user-123', email: 'test@test.com' } as any);
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

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue(null);
    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('returns SSE response with correct headers', async () => {
    async function* emptyStream() { /* no chunks */ }
    mockNetwork.mockResolvedValue(emptyStream() as any);

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('emits stage_update generating and complete events', async () => {
    async function* emptyStream() { /* no chunks */ }
    mockNetwork.mockResolvedValue(emptyStream() as any);

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    expect(events[0]).toEqual({ type: 'stage_update', stage: 'generating' });
    expect(events[events.length - 1]).toEqual({ type: 'stage_update', stage: 'complete' });
  });

  it('bridges agent-execution-start to agent_start', async () => {
    async function* chunks() {
      yield { type: 'agent-execution-start', payload: { agentId: 'analyst', agentName: 'Analyst' } };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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
    async function* chunks() {
      yield { type: 'agent-execution-end', payload: { agentId: 'analyst', agentName: 'Analyst', tokensUsed: 150, durationMs: 2000 } };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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
    async function* chunks() {
      yield { type: 'tool-execution-end', payload: { toolName: 'write-file', result: { path: '/workspace/src/App.tsx', bytesWritten: 42 }, agentId: 'frontend-engineer' } };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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
    async function* chunks() {
      yield { type: 'tool-execution-end', payload: { toolName: 'run-build', agentId: 'qa-engineer' } };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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

  it('calls network with correct memory params', async () => {
    async function* emptyStream() {}
    mockNetwork.mockResolvedValue(emptyStream() as any);

    const req = createRequest({ message: 'Build a todo app', projectId: 'proj-42' });
    await POST(req as any);

    expect(mockNetwork).toHaveBeenCalledWith('Build a todo app', {
      memory: {
        thread: 'proj-42',
        resource: 'user-123',
      },
    });
  });

  it('bridges agent-execution-event-text-delta to agent_progress', async () => {
    async function* chunks() {
      yield { type: 'agent-execution-event-text-delta', payload: { agentId: 'analyst', textDelta: 'Analyzing requirements...' } };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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
    async function* chunks() {
      yield { type: 'network-execution-event-step-finish', payload: {} };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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

  it('bridges workflow-execution-suspended to plan_ready', async () => {
    async function* chunks() {
      yield { type: 'workflow-execution-suspended', payload: { suspendPayload: { appName: 'Todo App', features: [] } } };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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
    async function* chunks() {
      yield { type: 'agent-execution-start', payload: {} };
      yield { type: 'agent-execution-end', payload: {} };
      yield { type: 'tool-execution-end', payload: { toolName: 'run-build' } };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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
    async function* chunks() {
      yield { type: 'agent-execution-start', payload: { agentId: 'analyst', agentName: 'Analyst' } };
      yield { type: 'agent-execution-event-text-delta', payload: { agentId: 'analyst', textDelta: 'Step 1' } };
      yield { type: 'agent-execution-event-text-delta', payload: { agentId: 'analyst', textDelta: 'Step 2' } };
      yield { type: 'agent-execution-end', payload: { agentId: 'analyst', tokensUsed: 100, durationMs: 1000 } };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

    const req = createRequest({ message: 'Build an app', projectId: 'proj-1' });
    const res = await POST(req as any);
    const events = await readSSEEvents(res);

    const progressEvents = events.filter((e: any) => e.type === 'agent_progress');
    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0]).toMatchObject({ message: 'Step 1' });
    expect(progressEvents[1]).toMatchObject({ message: 'Step 2' });
  });

  it('handles chunks with no payload at all', async () => {
    async function* chunks() {
      yield { type: 'agent-execution-start' };
      yield { type: 'agent-execution-end', payload: null };
    }
    mockNetwork.mockResolvedValue(chunks() as any);

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
});
