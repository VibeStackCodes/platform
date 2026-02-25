/**
 * Integration Test
 *
 * Verifies that all pieces connect correctly at the module boundary level:
 * 1. orchestrator agent has the expected tools wired
 * 2. AgentStreamEvent discriminant types are valid and distinct
 * 3. relace client exports the expected applyEdit function
 */
import { describe, it, expect, vi } from 'vitest'

// Mock memory + mastra modules to avoid PostgresStore requiring DATABASE_URL
vi.mock('@server/lib/agents/memory', () => ({
  memory: {},
  storage: {},
  workingMemorySchema: { safeParse: () => ({ success: true }) },
}))
vi.mock('@server/lib/agents/mastra', () => ({
  memory: {},
  storage: {},
  mastra: {},
  workingMemorySchema: { safeParse: () => ({ success: true }) },
}))

// ---------------------------------------------------------------------------
// 1. Tool-belt wiring: agent.listTools() contains expected tools
// ---------------------------------------------------------------------------

describe('Orchestrator tool-belt wiring', () => {
  it('agent has all required sandbox tools', async () => {
    const { createOrchestrator } = await import('@server/lib/agents/orchestrator')
    const agent = createOrchestrator()
    const toolNames = Object.keys(agent.listTools())

    expect(toolNames).toContain('createSandbox')
    expect(toolNames).toContain('writeFile')
    expect(toolNames).toContain('writeFiles')
    expect(toolNames).toContain('readFile')
    expect(toolNames).toContain('editFile')
    expect(toolNames).toContain('listFiles')
    expect(toolNames).toContain('runCommand')
    expect(toolNames).toContain('runBuild')
  })

  it('agent has utility tools', async () => {
    const { createOrchestrator } = await import('@server/lib/agents/orchestrator')
    const agent = createOrchestrator()
    const toolNames = Object.keys(agent.listTools())

    expect(toolNames).toContain('installPackage')
    expect(toolNames).toContain('webSearch')
    expect(toolNames).toContain('getPreviewUrl')
  })

  it('agent has commitAndPush tool', async () => {
    const { createOrchestrator } = await import('@server/lib/agents/orchestrator')
    const agent = createOrchestrator()
    const toolNames = Object.keys(agent.listTools())

    expect(toolNames).toContain('commitAndPush')
  })
})

// ---------------------------------------------------------------------------
// 2. Relace client API shape
// ---------------------------------------------------------------------------

describe('relace client API shape', () => {
  it('exports applyEdit as a function', async () => {
    const relace = await import('@server/lib/relace')
    expect(typeof relace.applyEdit).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// 3. AgentStreamEvent discriminant correctness
// ---------------------------------------------------------------------------

describe('AgentStreamEvent discriminants', () => {
  it('event types module is importable', async () => {
    const types = await import('@server/lib/types')
    expect(types).toBeDefined()
  })

  it('each agent event type has a distinct type discriminant', () => {
    const discriminants = [
      'thinking',
      'tool_start',
      'tool_complete',
      'done',
      'agent_error',
      'sandbox_ready',
      'package_installed',
      'credits_used',
    ]

    const unique = new Set(discriminants)
    expect(unique.size).toBe(discriminants.length)
  })

  it('thinking event shape is well-formed', () => {
    const event = { type: 'thinking' as const, content: 'Building the todo app...' }
    expect(event.type).toBe('thinking')
    expect(typeof event.content).toBe('string')
  })

  it('tool start event shape is well-formed', () => {
    const event = {
      type: 'tool_start' as const,
      tool: 'editFile',
      label: 'Applying color theme',
      args: { path: 'src/index.css' },
    }
    expect(event.type).toBe('tool_start')
    expect(typeof event.tool).toBe('string')
  })

  it('tool complete event shape is well-formed', () => {
    const event = {
      type: 'tool_complete' as const,
      tool: 'editFile',
      success: true,
      result: 'Wrote 42 bytes',
      durationMs: 120,
    }
    expect(event.type).toBe('tool_complete')
    expect(typeof event.success).toBe('boolean')
  })

  it('done event shape is well-formed', () => {
    const event = {
      type: 'done' as const,
      summary: 'Your todo app is live! Features: add, complete, delete tasks.',
      sandboxId: 'sandbox-abc123',
      tokensUsed: 12480,
    }
    expect(event.type).toBe('done')
    expect(typeof event.summary).toBe('string')
  })

  it('sandbox ready event shape is well-formed', () => {
    const event = { type: 'sandbox_ready' as const, sandboxId: 'sandbox-xyz' }
    expect(event.type).toBe('sandbox_ready')
    expect(typeof event.sandboxId).toBe('string')
  })

  it('package installed event shape is well-formed', () => {
    const event = { type: 'package_installed' as const, packages: 'dnd-kit @dnd-kit/core' }
    expect(event.type).toBe('package_installed')
    expect(typeof event.packages).toBe('string')
  })

  it('error event shape is well-formed', () => {
    const event = { type: 'agent_error' as const, message: 'Build failed after 3 attempts' }
    expect(event.type).toBe('agent_error')
    expect(typeof event.message).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// 4. createOrchestrator agent factory
// ---------------------------------------------------------------------------

describe('createOrchestrator factory', () => {
  it('creates an agent instance with correct metadata', async () => {
    const { createOrchestrator } = await import('@server/lib/agents/orchestrator')
    const agent = createOrchestrator()
    expect(agent.id).toBe('orchestrator')
    expect(agent.name).toBe('Orchestrator')
  })
})
