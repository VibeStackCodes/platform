import { describe, it, expect } from 'vitest';
import { TraceCollector } from '@/lib/agents/observability';
import type { AgentEvent } from '@/lib/agents/schemas';

describe('TraceCollector', () => {
  it('records agent_start and creates a running trace', () => {
    const collector = new TraceCollector('project-1');
    const event: AgentEvent = {
      type: 'agent_start',
      agentId: 'planner',
      agentName: 'Planner',
      phase: 1,
    };
    collector.record(event);

    const traces = collector.getTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].agentId).toBe('planner');
    expect(traces[0].status).toBe('running');
  });

  it('updates trace on agent_artifact', () => {
    const collector = new TraceCollector('project-1');
    collector.record({ type: 'agent_start', agentId: 'data-architect', agentName: 'Data Architect', phase: 1 });
    collector.record({ type: 'agent_artifact', agentId: 'data-architect', artifactType: 'database-schema', artifactName: 'Schema' });

    const trace = collector.getTraces().find(t => t.agentId === 'data-architect');
    expect(trace?.artifactType).toBe('database-schema');
  });

  it('completes trace on agent_complete', () => {
    const collector = new TraceCollector('project-1');
    collector.record({ type: 'agent_start', agentId: 'planner', agentName: 'Planner', phase: 1 });
    collector.record({ type: 'agent_complete', agentId: 'planner', tokensUsed: 500, durationMs: 2000 });

    const trace = collector.getTraces().find(t => t.agentId === 'planner');
    expect(trace?.status).toBe('completed');
    expect(trace?.tokensUsed).toBe(500);
    expect(trace?.durationMs).toBe(2000);
  });

  it('returns correct summary', () => {
    const collector = new TraceCollector('project-1');
    collector.record({ type: 'agent_start', agentId: 'planner', agentName: 'Planner', phase: 1 });
    collector.record({ type: 'agent_complete', agentId: 'planner', tokensUsed: 500, durationMs: 2000 });
    collector.record({ type: 'agent_start', agentId: 'qa-engineer', agentName: 'QA', phase: 3 });

    const summary = collector.getSummary();
    expect(summary.totalAgents).toBe(2);
    expect(summary.completedAgents).toBe(1);
    expect(summary.totalTokens).toBe(500);
    expect(summary.totalDurationMs).toBe(2000);
  });

  it('tracks multiple agents independently', () => {
    const collector = new TraceCollector('project-1');
    collector.record({ type: 'agent_start', agentId: 'planner', agentName: 'Planner', phase: 1 });
    collector.record({ type: 'agent_start', agentId: 'data-architect', agentName: 'Data Architect', phase: 1 });
    collector.record({ type: 'agent_complete', agentId: 'planner', tokensUsed: 300, durationMs: 1000 });

    const traces = collector.getTraces();
    expect(traces).toHaveLength(2);
    expect(traces.find(t => t.agentId === 'planner')?.status).toBe('completed');
    expect(traces.find(t => t.agentId === 'data-architect')?.status).toBe('running');
  });

  it('returns all events in order', () => {
    const collector = new TraceCollector('project-1');
    const events: AgentEvent[] = [
      { type: 'phase_start', phase: 1, phaseName: 'Planning', agentCount: 2 },
      { type: 'agent_start', agentId: 'planner', agentName: 'Planner', phase: 1 },
      { type: 'agent_complete', agentId: 'planner', tokensUsed: 100, durationMs: 500 },
      { type: 'phase_complete', phase: 1, phaseName: 'Planning' },
    ];
    for (const e of events) collector.record(e);

    expect(collector.getEvents()).toEqual(events);
  });
});
