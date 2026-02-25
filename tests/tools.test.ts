import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock relace module before importing tools
vi.mock('@server/lib/relace', () => ({
  applyEdit: vi.fn(),
}))

// Mock sandbox module
vi.mock('@server/lib/sandbox', () => ({
  getSandbox: vi.fn(),
  createSandbox: vi.fn(),
  getPreviewUrl: vi.fn(),
  buildProxyUrl: vi.fn(),
  downloadDirectory: vi.fn(),
  pushToGitHub: vi.fn(),
}))

// Mock github module
vi.mock('@server/lib/github', () => ({
  buildRepoName: vi.fn(),
  createRepo: vi.fn(),
  getInstallationToken: vi.fn(),
}))

import { applyEdit } from '@server/lib/relace'
import { getSandbox } from '@server/lib/sandbox'

describe('editFileTool', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(getSandbox).mockResolvedValue({
      fs: {
        downloadFile: vi.fn().mockResolvedValue(Buffer.from('const x = 1\n')),
        uploadFile: vi.fn().mockResolvedValue(undefined),
      },
    } as any)

    vi.mocked(applyEdit).mockResolvedValue({
      mergedCode: 'const x = 1\nconst y = 2\n',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })
  })

  it('reads file, calls Relace, writes merged result', async () => {
    const { editFileTool } = await import('@server/lib/agents/tools')

    const result = await editFileTool.execute!(
      {
        sandboxId: 'sandbox-1',
        path: 'src/App.tsx',
        editSnippet: 'const x = 1\nconst y = 2\n',
      },
      {} as any,
    )

    expect(result.success).toBe(true)
    expect(result.path).toBe('src/App.tsx')
    expect(result.bytesWritten).toBeGreaterThan(0)
    expect(applyEdit).toHaveBeenCalledWith({
      initialCode: 'const x = 1\n',
      editSnippet: 'const x = 1\nconst y = 2\n',
      instruction: undefined,
    })
  })

  it('returns error when file does not exist', async () => {
    vi.mocked(getSandbox).mockResolvedValue({
      fs: {
        downloadFile: vi.fn().mockRejectedValue(new Error('File not found')),
      },
    } as any)

    const { editFileTool } = await import('@server/lib/agents/tools')
    const result = await editFileTool.execute!(
      {
        sandboxId: 'sandbox-1',
        path: 'nonexistent.ts',
        editSnippet: 'code',
      },
      {} as any,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('File not found')
  })
})

describe('installPackageTool', () => {
  beforeEach(() => {
    vi.mocked(getSandbox).mockResolvedValue({
      process: {
        executeCommand: vi.fn().mockResolvedValue({
          exitCode: 0,
          result: 'added 1 package',
        }),
      },
    } as any)
  })

  it('runs bun add with packages', async () => {
    const { installPackageTool } = await import('@server/lib/agents/tools')
    const result = await installPackageTool.execute!(
      {
        sandboxId: 'sandbox-1',
        packages: 'dnd-kit @dnd-kit/core',
      },
      {} as any,
    )

    expect(result.success).toBe(true)
    expect(result.output).toContain('added')
  })
})
