import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppBlueprint } from '@server/lib/app-blueprint'
import type { AssemblyResult } from '@server/lib/capabilities/assembler'
import type { ThemeTokens } from '@server/lib/themed-code-engine'

const mockGenerate = vi.fn()
const mockInit = vi.fn(async () => {})
const mockDestroy = vi.fn(async () => {})

vi.mock('@mastra/core/agent', () => ({
  Agent: class MockAgent {
    generate = mockGenerate
  },
}))

vi.mock('@mastra/core/workspace', () => ({
  WORKSPACE_TOOLS: {
    FILESYSTEM: { READ_FILE: 'mastra_workspace_read_file', WRITE_FILE: 'mastra_workspace_write_file' },
    SANDBOX: { EXECUTE_COMMAND: 'mastra_workspace_execute_command' },
    SEARCH: { SEARCH: 'mastra_workspace_search', INDEX: 'mastra_workspace_index' },
  },
  Workspace: class MockWorkspace {
    init = mockInit
    destroy = mockDestroy
  },
  LocalFilesystem: class MockLocalFilesystem {},
  LocalSandbox: class MockLocalSandbox {},
}))

const mockRunCommand = vi.fn()
const mockUploadFiles = vi.fn(async () => {})
const mockGetSandbox = vi.fn(async () => ({ id: 'sandbox-1' }))

vi.mock('@server/lib/sandbox', () => ({
  getSandbox: mockGetSandbox,
  runCommand: mockRunCommand,
  uploadFiles: mockUploadFiles,
}))

const tokens: ThemeTokens = {
  name: 'recipes',
  fonts: { display: 'Inter', body: 'Inter', googleFontsUrl: '' },
  colors: {
    background: '#fff',
    foreground: '#111',
    primary: '#111',
    primaryForeground: '#fff',
    secondary: '#eee',
    accent: '#ccc',
    muted: '#ddd',
    border: '#ddd',
  },
  style: {
    borderRadius: '0.5rem',
    cardStyle: 'elevated',
    navStyle: 'top-bar',
    heroLayout: 'split',
    spacing: 'normal',
    motion: 'subtle',
    imagery: 'minimal',
  },
  authPosture: 'hybrid',
  heroImages: [],
  heroQuery: 'food',
  textSlots: {
    hero_headline: 'Headline',
    hero_subtext: 'Subtext',
    about_paragraph: 'About paragraph long enough',
    cta_label: 'Start',
    empty_state: 'Empty',
    footer_tagline: 'Tagline',
  },
}

function makeBlueprint(): AppBlueprint {
  return {
    meta: { appName: 'Test', appDescription: 'Test app' },
    features: { auth: false, entities: [] },
    contract: { tables: [] },
    fileTree: [
      { path: 'src/routes/index.tsx', content: 'export const a = 1', layer: 4, isLLMSlot: true },
      { path: 'src/lib/supabase.ts', content: 'export const b = 2', layer: 1, isLLMSlot: false },
    ],
  }
}

function makeAssembly(): AssemblyResult {
  return {
    contract: { tables: [] },
    pages: [{ path: '/', type: 'static', template: 'landing' }],
    components: [],
    navEntries: [],
    npmDependencies: {},
    designHints: {},
    capabilityManifest: ['public-website'],
    hasAuth: false,
  }
}

describe('Polish Agent', () => {
  beforeEach(() => {
    mockGenerate.mockReset()
    mockRunCommand.mockReset()
    mockUploadFiles.mockClear()
    mockGetSandbox.mockClear()
    mockInit.mockClear()
    mockDestroy.mockClear()
  })

  it('returns early when assembly is null', async () => {
    const { runPolish } = await import('@server/lib/agents/polish-agent')
    const result = await runPolish({
      sandboxId: 'test',
      blueprint: makeBlueprint(),
      assembly: null,
      tokens,
    })
    expect(result.polishApplied).toBe(false)
    expect(result.rewrittenFiles).toEqual([])
    expect(result.tokensUsed).toBe(0)
  })

  it('identifies polishable files from blueprint', async () => {
    mockGenerate.mockResolvedValue({ text: 'rewritten', totalUsage: { totalTokens: 10 } })
    mockRunCommand
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })

    const { runPolish } = await import('@server/lib/agents/polish-agent')
    const result = await runPolish({
      sandboxId: 'test',
      blueprint: makeBlueprint(),
      assembly: makeAssembly(),
      tokens,
    })

    expect(result.polishApplied).toBe(true)
    expect(result.rewrittenFiles).toHaveLength(1)
    expect(result.rewrittenFiles[0]?.path).toBe('src/routes/index.tsx')
    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('respects token budget', async () => {
    const bp = makeBlueprint()
    bp.fileTree.push({ path: 'src/routes/blog/index.tsx', content: 'export const c = 3', layer: 4, isLLMSlot: true })

    mockGenerate.mockResolvedValue({ text: 'rewritten', totalUsage: { totalTokens: 100 } })
    mockRunCommand
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })

    const { runPolish } = await import('@server/lib/agents/polish-agent')
    const result = await runPolish({
      sandboxId: 'test',
      blueprint: bp,
      assembly: makeAssembly(),
      tokens,
      tokenBudget: 50,
    })

    expect(result.rewrittenFiles).toHaveLength(1)
    expect(result.tokensUsed).toBeGreaterThanOrEqual(100)
  })

  it('system instructions contain boundary rules', async () => {
    const { POLISH_SYSTEM_INSTRUCTIONS } = await import('@server/lib/agents/polish-agent')
    expect(POLISH_SYSTEM_INSTRUCTIONS).toContain('DO NOT change the route path')
    expect(POLISH_SYSTEM_INSTRUCTIONS).toContain('All supabase.from() calls')
    expect(POLISH_SYSTEM_INSTRUCTIONS).toContain('Use inline styles')
  })

  it('validation fails, repair succeeds', async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: 'rewritten-one', totalUsage: { totalTokens: 15 } })
      .mockResolvedValueOnce({ text: 'repaired-one', totalUsage: { totalTokens: 5 } })
    mockRunCommand
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'ts error' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })

    const { runPolish } = await import('@server/lib/agents/polish-agent')
    const result = await runPolish({
      sandboxId: 'test',
      blueprint: makeBlueprint(),
      assembly: makeAssembly(),
      tokens,
    })

    expect(result.polishApplied).toBe(true)
    expect(result.rewrittenFiles[0]?.content).toBe('repaired-one')
  })

  it('all retries fail and falls back to scaffold', async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: 'rewritten-one', totalUsage: { totalTokens: 15 } })
      .mockResolvedValue({ text: 'repair-failed', totalUsage: { totalTokens: 5 } })
    mockRunCommand
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'ts error 1' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'ts error 2' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'ts error 3' })

    const { runPolish } = await import('@server/lib/agents/polish-agent')
    const result = await runPolish({
      sandboxId: 'test',
      blueprint: makeBlueprint(),
      assembly: makeAssembly(),
      tokens,
    })

    expect(result.polishApplied).toBe(false)
    expect(result.rewrittenFiles).toEqual([])
  })
})
