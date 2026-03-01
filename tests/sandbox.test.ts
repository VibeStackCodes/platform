import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Daytona SDK mock ──────────────────────────────────────────────────────────
// Daytona is used as `new Daytona(...)` so the mock must be a constructable class.
// We store the instance methods on a shared object so tests can control them.

const mockDaytona = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
}

vi.mock('@daytonaio/sdk', () => {
  // Use a function declaration (not arrow) so it works with `new`
  function DaytonaMock() {
    return mockDaytona
  }
  return { Daytona: DaytonaMock }
})

// ── Mock sandbox object ───────────────────────────────────────────────────────
const mockSandboxFs = {
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
}

const mockSandboxProcess = {
  createSession: vi.fn(),
  executeSessionCommand: vi.fn(),
  executeCommand: vi.fn(),
}

const mockSandboxGit = {
  push: vi.fn(),
}

const mockSandbox = {
  id: 'sandbox-abc-123',
  fs: mockSandboxFs,
  process: mockSandboxProcess,
  git: mockSandboxGit,
  getPreviewLink: vi.fn(),
}

// Import AFTER mocks are declared
import {
  buildProxyUrl,
  createSandbox,
  downloadDirectory,
  findSandboxByProject,
  getDaytonaClient,
  getPreviewUrl,
  getSandbox,
  pushToGitHub,
  uploadFile,
  uploadFiles,
  runCommand,
} from '@server/lib/sandbox'

describe('sandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── buildProxyUrl ────────────────────────────────────────────────────────
  describe('buildProxyUrl', () => {
    it('formats URL correctly with default base (vibestack.site)', () => {
      delete process.env.PREVIEW_PROXY_BASE
      const url = buildProxyUrl('sandbox-abc-123', 3000)
      expect(url).toBe('https://3000-sandbox-abc-123-preview.vibestack.site')
    })

    it('uses PREVIEW_PROXY_BASE env var when set', () => {
      vi.stubEnv('PREVIEW_PROXY_BASE', 'custom.example.com')
      const url = buildProxyUrl('sandbox-xyz-456', 8080)
      expect(url).toBe('https://8080-sandbox-xyz-456-preview.custom.example.com')
    })
  })

  // ── getDaytonaClient ─────────────────────────────────────────────────────
  describe('getDaytonaClient', () => {
    it('returns a Daytona instance when DAYTONA_API_KEY is set', () => {
      vi.stubEnv('DAYTONA_API_KEY', 'test-daytona-key')
      const client = getDaytonaClient()
      expect(client).toBeDefined()
    })

    it('returns the same singleton instance on repeated calls', () => {
      vi.stubEnv('DAYTONA_API_KEY', 'test-daytona-key')
      const client1 = getDaytonaClient()
      const client2 = getDaytonaClient()
      expect(client1).toBe(client2)
    })
  })

  // ── createSandbox ────────────────────────────────────────────────────────
  describe('createSandbox', () => {
    beforeEach(() => {
      vi.stubEnv('DAYTONA_API_KEY', 'test-daytona-key')
      vi.stubEnv('DAYTONA_SNAPSHOT_ID', 'snap-test-123')
      mockDaytona.create.mockResolvedValue(mockSandbox)
    })

    it('creates sandbox from snapshot with default config', async () => {
      const sandbox = await createSandbox()

      expect(mockDaytona.create).toHaveBeenCalledOnce()
      const [createArgs] = mockDaytona.create.mock.calls[0]
      expect(createArgs.snapshot).toBe('snap-test-123')
      expect(createArgs.language).toBe('typescript')
      expect(createArgs.autoStopInterval).toBe(60)
      expect(createArgs.ephemeral).toBe(false)
      expect(createArgs.public).toBe(true)
      expect(sandbox.id).toBe('sandbox-abc-123')
    })

    it('passes custom config to daytona.create', async () => {
      await createSandbox({
        language: 'python',
        envVars: { FOO: 'bar' },
        autoStopInterval: 120,
        labels: { project: 'test-project' },
      })

      const [createArgs] = mockDaytona.create.mock.calls[0]
      expect(createArgs.language).toBe('python')
      expect(createArgs.envVars).toEqual({ FOO: 'bar' })
      expect(createArgs.autoStopInterval).toBe(120)
      expect(createArgs.labels).toEqual({ project: 'test-project' })
    })

    it('throws when DAYTONA_SNAPSHOT_ID is missing', async () => {
      delete process.env.DAYTONA_SNAPSHOT_ID
      await expect(createSandbox()).rejects.toThrow('DAYTONA_SNAPSHOT_ID')
    })

    it('wraps daytona create errors with a helpful message', async () => {
      vi.stubEnv('DAYTONA_SNAPSHOT_ID', 'snap-test-123')
      mockDaytona.create.mockRejectedValue(new Error('API timeout'))
      await expect(createSandbox()).rejects.toThrow('Sandbox creation failed')
    })
  })

  // ── findSandboxByProject ─────────────────────────────────────────────────
  describe('findSandboxByProject', () => {
    it('returns matched sandbox when one exists', async () => {
      mockDaytona.list.mockResolvedValue({ items: [{ id: 'sandbox-abc-123' }] })
      mockDaytona.get.mockResolvedValue(mockSandbox)

      const result = await findSandboxByProject('project-id-001')

      expect(mockDaytona.list).toHaveBeenCalledWith({ project: 'project-id-001' }, 1, 1)
      expect(mockDaytona.get).toHaveBeenCalledWith('sandbox-abc-123')
      expect(result).toBe(mockSandbox)
    })

    it('returns null when no sandbox matches', async () => {
      mockDaytona.list.mockResolvedValue({ items: [] })

      const result = await findSandboxByProject('project-id-999')

      expect(result).toBeNull()
      expect(mockDaytona.get).not.toHaveBeenCalled()
    })

    it('returns null and swallows error when daytona.list throws', async () => {
      mockDaytona.list.mockRejectedValue(new Error('Network error'))

      const result = await findSandboxByProject('project-id-001')

      expect(result).toBeNull()
    })
  })

  // ── getSandbox ───────────────────────────────────────────────────────────
  describe('getSandbox', () => {
    it('retrieves sandbox by ID', async () => {
      mockDaytona.get.mockResolvedValue(mockSandbox)

      const result = await getSandbox('sandbox-abc-123')

      expect(mockDaytona.get).toHaveBeenCalledWith('sandbox-abc-123')
      expect(result.id).toBe('sandbox-abc-123')
    })

    it('throws wrapped error when daytona.get fails', async () => {
      mockDaytona.get.mockRejectedValue(new Error('Not found'))

      await expect(getSandbox('bad-id')).rejects.toThrow('Failed to get sandbox bad-id')
    })
  })

  // ── uploadFile ───────────────────────────────────────────────────────────
  describe('uploadFile', () => {
    it('uploads string content as a Buffer', async () => {
      mockSandboxFs.uploadFile.mockResolvedValue(undefined)

      await uploadFile(mockSandbox as any, 'hello world', '/workspace/file.txt')

      expect(mockSandboxFs.uploadFile).toHaveBeenCalledOnce()
      const [bufferArg, pathArg] = mockSandboxFs.uploadFile.mock.calls[0]
      expect(Buffer.isBuffer(bufferArg)).toBe(true)
      expect(bufferArg.toString()).toBe('hello world')
      expect(pathArg).toBe('/workspace/file.txt')
    })

    it('uploads Buffer content directly without re-wrapping', async () => {
      mockSandboxFs.uploadFile.mockResolvedValue(undefined)
      const buf = Buffer.from('binary data')

      await uploadFile(mockSandbox as any, buf, '/workspace/data.bin')

      const [bufferArg] = mockSandboxFs.uploadFile.mock.calls[0]
      expect(bufferArg).toBe(buf)
    })

    it('throws wrapped error when upload fails', async () => {
      mockSandboxFs.uploadFile.mockRejectedValue(new Error('Disk full'))

      await expect(uploadFile(mockSandbox as any, 'data', '/path')).rejects.toThrow(
        'Failed to upload /path',
      )
    })
  })

  // ── uploadFiles ──────────────────────────────────────────────────────────
  describe('uploadFiles', () => {
    it('uploads multiple files via Promise.all', async () => {
      mockSandboxFs.uploadFile.mockResolvedValue(undefined)

      const files = [
        { content: 'file one', path: '/workspace/one.txt' },
        { content: 'file two', path: '/workspace/two.txt' },
        { content: Buffer.from('three'), path: '/workspace/three.bin' },
      ]

      await uploadFiles(mockSandbox as any, files)

      expect(mockSandboxFs.uploadFile).toHaveBeenCalledTimes(3)
    })

    it('throws wrapped error when any file upload fails', async () => {
      mockSandboxFs.uploadFile.mockRejectedValue(new Error('Network timeout'))

      await expect(uploadFiles(mockSandbox as any, [{ content: 'x', path: '/x' }])).rejects.toThrow(
        'Failed to upload files',
      )
    })
  })

  // ── runCommand ───────────────────────────────────────────────────────────
  describe('runCommand', () => {
    it('creates a new session and executes the command', async () => {
      mockSandboxProcess.createSession.mockResolvedValue(undefined)
      mockSandboxProcess.executeSessionCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'Hello from session',
        stderr: '',
      })

      const result = await runCommand(mockSandbox as any, 'echo hello', 'session-1')

      expect(mockSandboxProcess.createSession).toHaveBeenCalledWith('session-1')
      expect(mockSandboxProcess.executeSessionCommand).toHaveBeenCalledWith(
        'session-1',
        { command: 'echo hello', async: false },
        300,
      )
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('Hello from session')
    })

    it('reuses an existing session when "already exists" error is thrown', async () => {
      mockSandboxProcess.createSession.mockRejectedValue(new Error('session already exists'))
      mockSandboxProcess.executeSessionCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'reused session output',
      })

      const result = await runCommand(mockSandbox as any, 'ls', 'existing-session')

      // createSession was called but threw "already exists" — ignored
      expect(mockSandboxProcess.createSession).toHaveBeenCalledOnce()
      // executeSessionCommand still runs
      expect(mockSandboxProcess.executeSessionCommand).toHaveBeenCalledOnce()
      expect(result.stdout).toBe('reused session output')
    })

    it('rethrows session creation errors that are not "already exists"', async () => {
      mockSandboxProcess.createSession.mockRejectedValue(new Error('Quota exceeded'))

      await expect(runCommand(mockSandbox as any, 'ls', 's1')).rejects.toThrow(
        'Command execution failed',
      )
    })

    it('passes async and timeout options to executeSessionCommand', async () => {
      mockSandboxProcess.createSession.mockResolvedValue(undefined)
      mockSandboxProcess.executeSessionCommand.mockResolvedValue({ exitCode: 0, stdout: '' })

      await runCommand(mockSandbox as any, 'bun run dev', 'dev-session', {
        async: true,
        timeout: 600,
      })

      expect(mockSandboxProcess.executeSessionCommand).toHaveBeenCalledWith(
        'dev-session',
        { command: 'bun run dev', async: true },
        600,
      )
    })
  })

  // ── getPreviewUrl ────────────────────────────────────────────────────────
  describe('getPreviewUrl', () => {
    it('returns url, token, port, and expiry from sandbox.getPreviewLink', async () => {
      const fakePreview = { url: 'https://preview.daytona.io/abc', token: 'tok-abc' }
      mockSandbox.getPreviewLink.mockResolvedValue(fakePreview)

      const before = Date.now()
      const result = await getPreviewUrl(mockSandbox as any, 3000)
      const after = Date.now()

      expect(result.url).toBe('https://preview.daytona.io/abc')
      expect(result.token).toBe('tok-abc')
      expect(result.port).toBe(3000)
      expect(result.expiresAt).toBeInstanceOf(Date)
      // Should expire roughly 1 hour from now (±50ms tolerance)
      const expiresMs = result.expiresAt.getTime()
      expect(expiresMs).toBeGreaterThanOrEqual(before + 3600 * 1000 - 50)
      expect(expiresMs).toBeLessThanOrEqual(after + 3600 * 1000 + 50)
    })

    it('defaults to port 3000', async () => {
      mockSandbox.getPreviewLink.mockResolvedValue({ url: 'https://p.io', token: 't' })

      const result = await getPreviewUrl(mockSandbox as any)

      expect(mockSandbox.getPreviewLink).toHaveBeenCalledWith(3000)
      expect(result.port).toBe(3000)
    })

    it('throws wrapped error when getPreviewLink fails', async () => {
      mockSandbox.getPreviewLink.mockRejectedValue(new Error('Sandbox offline'))

      await expect(getPreviewUrl(mockSandbox as any, 3000)).rejects.toThrow(
        'Failed to get preview URL',
      )
    })
  })

  // ── downloadDirectory ────────────────────────────────────────────────────
  describe('downloadDirectory', () => {
    it('excludes node_modules, .git, and .next from the find command', async () => {
      mockSandboxProcess.executeCommand.mockResolvedValue({
        exitCode: 0,
        result: '/workspace/src/index.ts\n/workspace/package.json\n',
      })
      mockSandboxFs.downloadFile.mockResolvedValue(Buffer.from('content'))

      await downloadDirectory(mockSandbox as any, '/workspace')

      const [findCommand] = mockSandboxProcess.executeCommand.mock.calls[0]
      expect(findCommand).toContain('! -path "*/node_modules/*"')
      expect(findCommand).toContain('! -path "*/.next/*"')
      expect(findCommand).toContain('! -path "*/.git/*"')
    })

    it('downloads files and returns relative paths stripped of the base dir', async () => {
      mockSandboxProcess.executeCommand.mockResolvedValue({
        exitCode: 0,
        result: '/workspace/src/app.ts\n/workspace/README.md\n',
      })
      mockSandboxFs.downloadFile.mockResolvedValue(Buffer.from('file content'))

      const files = await downloadDirectory(mockSandbox as any, '/workspace')

      expect(files).toHaveLength(2)
      const paths = files.map((f) => f.path)
      expect(paths).toContain('src/app.ts')
      expect(paths).toContain('README.md')
    })

    it('throws when find command returns non-zero exit code', async () => {
      mockSandboxProcess.executeCommand.mockResolvedValue({
        exitCode: 1,
        result: 'Permission denied',
      })

      await expect(downloadDirectory(mockSandbox as any, '/workspace')).rejects.toThrow(
        'Failed to download directory',
      )
    })
  })

  // ── pushToGitHub ─────────────────────────────────────────────────────────
  describe('pushToGitHub', () => {
    it('adds origin remote and pushes with PAT token', async () => {
      mockSandboxProcess.createSession.mockResolvedValue(undefined)
      mockSandboxProcess.executeSessionCommand.mockResolvedValue({ exitCode: 0, stdout: '' })
      mockSandboxGit.push.mockResolvedValue(undefined)

      await pushToGitHub(
        mockSandbox as any,
        'https://github.com/org/repo.git',
        'ghp_token123',
        '/workspace',
      )

      // Verifies git remote add was executed in the correct session with the right timeout
      expect(mockSandboxProcess.executeSessionCommand).toHaveBeenCalledWith(
        'git-set-origin',
        { command: 'git remote add origin https://github.com/org/repo.git', async: false },
        15,
      )
      // Verifies native git push with x-access-token auth
      expect(mockSandboxGit.push).toHaveBeenCalledWith(
        '/workspace',
        'x-access-token',
        'ghp_token123',
      )
    })
  })
})
