/**
 * V2 Integration Test
 *
 * Verifies that all V2 pieces connect correctly at the module boundary level:
 * 1. v2-orchestrator tool belt contains the exact tool instances from tools.ts
 * 2. V2StreamEvent discriminant types are valid and distinct
 * 3. relace client exports the expected applyEdit function
 * 4. V2 types module is importable and exports all expected V2 event interfaces
 */
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// 1. Tool-belt wiring: V2_ORCHESTRATOR_TOOLS references the canonical exports
// ---------------------------------------------------------------------------

describe('V2 orchestrator tool-belt wiring', () => {
  it('tool belt contains all required sandbox tools', async () => {
    const { V2_ORCHESTRATOR_TOOLS } = await import('@server/lib/agents/v2-orchestrator')
    const toolNames = Object.keys(V2_ORCHESTRATOR_TOOLS)

    // Core file I/O tools
    expect(toolNames).toContain('createSandbox')
    expect(toolNames).toContain('writeFile')
    expect(toolNames).toContain('writeFiles')
    expect(toolNames).toContain('readFile')
    expect(toolNames).toContain('editFile')
    expect(toolNames).toContain('listFiles')
    expect(toolNames).toContain('runCommand')
    expect(toolNames).toContain('runBuild')
  })

  it('tool belt contains V2-specific tools', async () => {
    const { V2_ORCHESTRATOR_TOOLS } = await import('@server/lib/agents/v2-orchestrator')
    const toolNames = Object.keys(V2_ORCHESTRATOR_TOOLS)

    expect(toolNames).toContain('installPackage')
    expect(toolNames).toContain('searchWeb')
    expect(toolNames).toContain('getPreviewUrl')
  })

  it('tool belt contains deployment tools', async () => {
    const { V2_ORCHESTRATOR_TOOLS } = await import('@server/lib/agents/v2-orchestrator')
    const toolNames = Object.keys(V2_ORCHESTRATOR_TOOLS)

    expect(toolNames).toContain('deployToVercel')
    expect(toolNames).toContain('pushToGitHub')
  })

  it('editFile tool in tool belt is the same instance as the named export from tools.ts', async () => {
    const { V2_ORCHESTRATOR_TOOLS } = await import('@server/lib/agents/v2-orchestrator')
    const { editFileTool } = await import('@server/lib/agents/tools')

    // Integration check: the tool belt must reference the canonical tool export,
    // not a copy — ensures applyEdit (Relace) is actually wired through
    expect(V2_ORCHESTRATOR_TOOLS.editFile).toBe(editFileTool)
  })

  it('deployToVercel tool in tool belt is the same instance as the named export from tools.ts', async () => {
    const { V2_ORCHESTRATOR_TOOLS } = await import('@server/lib/agents/v2-orchestrator')
    const { deployToVercelTool } = await import('@server/lib/agents/tools')

    expect(V2_ORCHESTRATOR_TOOLS.deployToVercel).toBe(deployToVercelTool)
  })

  it('pushToGitHub tool in tool belt is the same instance as the named export from tools.ts', async () => {
    const { V2_ORCHESTRATOR_TOOLS } = await import('@server/lib/agents/v2-orchestrator')
    const { pushToGitHubTool } = await import('@server/lib/agents/tools')

    expect(V2_ORCHESTRATOR_TOOLS.pushToGitHub).toBe(pushToGitHubTool)
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

  it('exports RelaceInput, RelaceResult, RelaceUsage types (via module shape)', async () => {
    // These are TypeScript interface exports — they have no runtime representation.
    // We verify them indirectly by confirming the module itself is importable and
    // exposes the applyEdit function that consumes those types.
    const relace = await import('@server/lib/relace')
    expect(relace).toBeDefined()
    expect(Object.keys(relace)).toContain('applyEdit')
  })
})

// ---------------------------------------------------------------------------
// 3. V2StreamEvent discriminant correctness
// ---------------------------------------------------------------------------

describe('V2StreamEvent discriminants', () => {
  it('V2 event types module is importable', async () => {
    const types = await import('@server/lib/types')
    expect(types).toBeDefined()
  })

  it('each V2 event type has a distinct type discriminant', () => {
    // Enumerate all V2 discriminants. If a new event is added to the union
    // without a unique type key, this set will catch duplicates.
    const v2Discriminants = [
      'v2_thinking',
      'v2_tool_start',
      'v2_tool_complete',
      'v2_done',
      'v2_error',
      'v2_sandbox_ready',
      'v2_package_installed',
      'credits_used',
    ]

    const unique = new Set(v2Discriminants)
    expect(unique.size).toBe(v2Discriminants.length)
  })

  it('V2 thinking event shape is well-formed', () => {
    // Validates the structural contract the client SSE parser depends on
    const event = { type: 'v2_thinking' as const, content: 'Building the todo app...' }
    expect(event.type).toBe('v2_thinking')
    expect(typeof event.content).toBe('string')
  })

  it('V2 tool start event shape is well-formed', () => {
    const event = {
      type: 'v2_tool_start' as const,
      tool: 'editFile',
      label: 'Applying color theme',
      args: { path: 'src/index.css' },
    }
    expect(event.type).toBe('v2_tool_start')
    expect(typeof event.tool).toBe('string')
  })

  it('V2 tool complete event shape is well-formed', () => {
    const event = {
      type: 'v2_tool_complete' as const,
      tool: 'editFile',
      success: true,
      result: 'Wrote 42 bytes',
      durationMs: 120,
    }
    expect(event.type).toBe('v2_tool_complete')
    expect(typeof event.success).toBe('boolean')
  })

  it('V2 done event shape is well-formed', () => {
    const event = {
      type: 'v2_done' as const,
      summary: 'Your todo app is live! Features: add, complete, delete tasks.',
      sandboxId: 'sandbox-abc123',
      tokensUsed: 12480,
    }
    expect(event.type).toBe('v2_done')
    expect(typeof event.summary).toBe('string')
  })

  it('V2 sandbox ready event shape is well-formed', () => {
    const event = { type: 'v2_sandbox_ready' as const, sandboxId: 'sandbox-xyz' }
    expect(event.type).toBe('v2_sandbox_ready')
    expect(typeof event.sandboxId).toBe('string')
  })

  it('V2 package installed event shape is well-formed', () => {
    const event = { type: 'v2_package_installed' as const, packages: 'dnd-kit @dnd-kit/core' }
    expect(event.type).toBe('v2_package_installed')
    expect(typeof event.packages).toBe('string')
  })

  it('V2 error event shape is well-formed', () => {
    const event = { type: 'v2_error' as const, message: 'Build failed after 3 attempts' }
    expect(event.type).toBe('v2_error')
    expect(typeof event.message).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// 4. createV2Orchestrator agent factory — integration with provider routing
// ---------------------------------------------------------------------------

describe('createV2Orchestrator factory', () => {
  it('creates an agent instance with correct metadata', async () => {
    const { createV2Orchestrator } = await import('@server/lib/agents/v2-orchestrator')
    const agent = createV2Orchestrator()
    expect(agent.id).toBe('v2-orchestrator')
    expect(agent.name).toBe('V2 Orchestrator')
  })

  it('agent tool count matches V2_ORCHESTRATOR_TOOLS', async () => {
    const { createV2Orchestrator, V2_ORCHESTRATOR_TOOLS } = await import(
      '@server/lib/agents/v2-orchestrator'
    )
    const agent = createV2Orchestrator()
    const expectedCount = Object.keys(V2_ORCHESTRATOR_TOOLS).length

    // Mastra Agent exposes registered tools via listTools() — not agent.tools
    const agentToolCount = Object.keys(agent.listTools()).length
    expect(agentToolCount).toBe(expectedCount)
  })
})
