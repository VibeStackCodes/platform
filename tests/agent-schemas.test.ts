import { describe, it, expect } from 'vitest';
import {
  ClarifiedRequirementsSchema,
  DatabaseSchemaArtifactSchema,
  FrontendArtifactSchema,
  QAResultArtifactSchema,
  AgentEventSchema,
} from '@/lib/agents/schemas';

describe('ClarifiedRequirementsSchema', () => {
  it('validates a complete object', () => {
    const valid = {
      appName: 'TaskManager',
      appDescription: 'A task management app',
      targetAudience: 'Small teams',
      features: [
        { name: 'Task CRUD', description: 'Create, read, update, delete tasks', category: 'crud' },
      ],
      constraints: [],
      designPreferences: { style: 'modern', primaryColor: '#3b82f6', fontFamily: 'Inter' },
    };
    const result = ClarifiedRequirementsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects when appName is missing', () => {
    const invalid = {
      appDescription: 'A task management app',
      targetAudience: 'Small teams',
      features: [],
      designPreferences: {},
    };
    const result = ClarifiedRequirementsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('DatabaseSchemaArtifactSchema', () => {
  it('validates tables and migration SQL', () => {
    const valid = {
      tables: [
        {
          name: 'tasks',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'title', type: 'text' },
          ],
          indices: [],
        },
      ],
      migrationSQL: 'CREATE TABLE tasks (id uuid PRIMARY KEY, title text);',
    };
    const result = DatabaseSchemaArtifactSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe('FrontendArtifactSchema', () => {
  it('validates generated files array', () => {
    const valid = {
      generatedFiles: [
        { path: 'src/App.tsx', content: 'export default function App() {}', layer: 0 },
      ],
      componentManifest: [
        { name: 'App', path: 'src/App.tsx', props: [] },
      ],
    };
    const result = FrontendArtifactSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe('QAResultArtifactSchema', () => {
  it('validates build result', () => {
    const valid = {
      buildPassed: true,
      errors: [],
      fixesApplied: [],
      attempts: 1,
    };
    const result = QAResultArtifactSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe('AgentEventSchema', () => {
  it('validates agent_start event', () => {
    const event = { type: 'agent_start', agentId: 'planner', agentName: 'Planner', phase: 1 };
    const result = AgentEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('validates phase_complete event', () => {
    const event = { type: 'phase_complete', phase: 1, phaseName: 'Planning' };
    const result = AgentEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects event with unknown type', () => {
    const event = { type: 'unknown_event', agentId: 'planner' };
    const result = AgentEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});
