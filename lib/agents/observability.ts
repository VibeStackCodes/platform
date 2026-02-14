import type { AgentEvent } from './schemas';

export interface AgentTrace {
  id: string;
  projectId: string;
  agentId: string;
  agentName: string;
  phase: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  tokensUsed?: number;
  artifactType?: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

export class TraceCollector {
  private traces = new Map<string, AgentTrace>();
  private projectId: string;
  private events: AgentEvent[] = [];

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  record(event: AgentEvent): void {
    this.events.push(event);

    if (event.type === 'agent_start') {
      this.traces.set(event.agentId, {
        id: `${this.projectId}-${event.agentId}`,
        projectId: this.projectId,
        agentId: event.agentId,
        agentName: event.agentName,
        phase: event.phase,
        startedAt: new Date().toISOString(),
        status: 'running',
      });
    }
    if (event.type === 'agent_artifact') {
      const trace = this.traces.get(event.agentId);
      if (trace) trace.artifactType = event.artifactType;
    }
    if (event.type === 'agent_complete') {
      const trace = this.traces.get(event.agentId);
      if (trace) {
        trace.completedAt = new Date().toISOString();
        trace.durationMs = event.durationMs;
        trace.tokensUsed = event.tokensUsed;
        trace.status = 'completed';
      }
    }
  }

  getTraces(): AgentTrace[] {
    return Array.from(this.traces.values());
  }

  getEvents(): AgentEvent[] {
    return [...this.events];
  }

  getSummary() {
    const traces = this.getTraces();
    return {
      totalAgents: traces.length,
      completedAgents: traces.filter(t => t.status === 'completed').length,
      totalTokens: traces.reduce((sum, t) => sum + (t.tokensUsed || 0), 0),
      totalDurationMs: traces.reduce((sum, t) => sum + (t.durationMs || 0), 0),
    };
  }
}
