/**
 * Tests for server/lib/github.ts
 *
 * Strategy: vi.mock() is hoisted to the top of the module. We expose mutable
 * vi.fn() handles so each test can configure return values via mockResolvedValue /
 * mockRejectedValue. We reset the module-level octokitInstance singleton by
 * clearing all mocks in beforeEach — but since the singleton is a module-level
 * `let`, we must use vi.resetModules() in a global setup and rely on re-importing
 * in each test.
 *
 * Simpler approach used here: the singleton is reset by importing the module fresh
 * per describe block using dynamic import after vi.resetModules(), or alternatively
 * by mutating MockOctokit's return value so the cached singleton always has fresh mocks.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ============================================================================
// Mock handles — defined first so they can be referenced by vi.mock factories
// ============================================================================

const mockCreateInOrg = vi.fn()
const mockGetBranch = vi.fn()
const mockCreateTree = vi.fn()
const mockCreateCommit = vi.fn()
const mockUpdateRef = vi.fn()
const mockAuth = vi.fn()

const mockOctokitInstance = {
  rest: {
    repos: {
      createInOrg: mockCreateInOrg,
      getBranch: mockGetBranch,
    },
    git: {
      createTree: mockCreateTree,
      createCommit: mockCreateCommit,
      updateRef: mockUpdateRef,
    },
  },
  auth: mockAuth,
}

// Octokit is called with `new` — mock must be a constructor function
vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return mockOctokitInstance
  }),
}))

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(() => vi.fn()),
}))

// ============================================================================
// Helpers
// ============================================================================

function makeNameTakenError(): Error & { status: number } {
  const err = new Error('name already exists on this account') as Error & { status: number }
  err.status = 422
  return err
}

// ============================================================================
// Tests
// ============================================================================

// We import the module once at the top level. The octokitInstance singleton
// inside github.ts is captured after the first call to getOctokit(). To keep
// the singleton fresh between tests we reset the module before each test that
// relies on env-var-missing checks (those tests delete env vars and expect the
// singleton to be null). For the rest we simply rely on vi.clearAllMocks() to
// reset the mock function call counts/return values — the singleton keeps
// pointing to mockOctokitInstance which is also cleared.
//
// To handle the singleton reset properly we use vi.resetModules() + dynamic
// re-import in the describe blocks that need it (env-missing tests).

describe('GitHub lib', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    process.env.GITHUB_APP_ID = 'app-123'
    process.env.GITHUB_APP_PRIVATE_KEY =
      '-----BEGIN RSA PRIVATE KEY-----\nfakekey\n-----END RSA PRIVATE KEY-----'
    process.env.GITHUB_APP_INSTALLATION_ID = '456'
    process.env.GITHUB_ORG = 'TestOrg'
  })

  // --------------------------------------------------------------------------
  // buildRepoName — pure function, no Octokit needed
  // --------------------------------------------------------------------------
  describe('buildRepoName', () => {
    it('returns vibestack-{projectId} regardless of appName', async () => {
      const { buildRepoName } = await import('@server/lib/github')
      expect(buildRepoName('My Cool App', 'proj-uuid-1234')).toBe('vibestack-proj-uuid-1234')
    })

    it('works with full UUID-style project IDs', async () => {
      const { buildRepoName } = await import('@server/lib/github')
      const id = '550e8400-e29b-41d4-a716-446655440000'
      expect(buildRepoName('anything', id)).toBe(`vibestack-${id}`)
    })
  })

  // --------------------------------------------------------------------------
  // getInstallationToken
  // --------------------------------------------------------------------------
  describe('getInstallationToken', () => {
    it('returns the token string from octokit.auth()', async () => {
      mockAuth.mockResolvedValue({ token: 'ghs_installation_token_abc' })

      const { getInstallationToken } = await import('@server/lib/github')
      const token = await getInstallationToken()

      expect(token).toBe('ghs_installation_token_abc')
      expect(mockAuth).toHaveBeenCalledWith({ type: 'installation' })
    })
  })

  // --------------------------------------------------------------------------
  // createRepo
  // --------------------------------------------------------------------------
  describe('createRepo', () => {
    it('creates a repo successfully and returns cloneUrl, htmlUrl, and repoName', async () => {
      mockCreateInOrg.mockResolvedValue({
        data: {
          clone_url: 'https://github.com/TestOrg/vibestack-proj-1.git',
          html_url: 'https://github.com/TestOrg/vibestack-proj-1',
        },
      })

      const { createRepo } = await import('@server/lib/github')
      const result = await createRepo('vibestack-proj-1')

      expect(result.cloneUrl).toBe('https://github.com/TestOrg/vibestack-proj-1.git')
      expect(result.htmlUrl).toBe('https://github.com/TestOrg/vibestack-proj-1')
      expect(result.repoName).toBe('vibestack-proj-1')

      expect(mockCreateInOrg).toHaveBeenCalledWith({
        org: 'TestOrg',
        name: 'vibestack-proj-1',
        private: false,
        auto_init: true,
        description: 'Generated by VibeStack',
      })
    })

    it('retries with a 4-char hex suffix when the name is already taken (422)', async () => {
      // First attempt: name taken
      mockCreateInOrg.mockRejectedValueOnce(makeNameTakenError())
      // Second attempt: success with a suffixed name
      mockCreateInOrg.mockResolvedValueOnce({
        data: {
          clone_url: 'https://github.com/TestOrg/vibestack-proj-1-a1b2.git',
          html_url: 'https://github.com/TestOrg/vibestack-proj-1-a1b2',
        },
      })

      const { createRepo } = await import('@server/lib/github')
      const result = await createRepo('vibestack-proj-1')

      expect(mockCreateInOrg).toHaveBeenCalledTimes(2)

      // Second call must use a suffixed name (original + 4 hex chars)
      const secondCallName = mockCreateInOrg.mock.calls[1][0].name as string
      expect(secondCallName).toMatch(/^vibestack-proj-1-[0-9a-f]{4}$/)
      expect(result.repoName).toBe(secondCallName)
    })

    it('throws after MAX_ATTEMPTS (3) consecutive 422 name-taken errors', async () => {
      mockCreateInOrg
        .mockRejectedValueOnce(makeNameTakenError())
        .mockRejectedValueOnce(makeNameTakenError())
        .mockRejectedValueOnce(makeNameTakenError())

      const { createRepo } = await import('@server/lib/github')

      await expect(createRepo('taken-name')).rejects.toThrow()
      expect(mockCreateInOrg).toHaveBeenCalledTimes(3)
    })

    it('does NOT retry on non-422 errors — rethrows the original error immediately', async () => {
      const forbiddenErr = new Error('Forbidden') as Error & { status: number }
      forbiddenErr.status = 403
      mockCreateInOrg.mockRejectedValueOnce(forbiddenErr)

      const { createRepo } = await import('@server/lib/github')

      await expect(createRepo('any-name')).rejects.toThrow('Forbidden')
      // Only 1 attempt — must NOT retry
      expect(mockCreateInOrg).toHaveBeenCalledTimes(1)
    })
  })

  // --------------------------------------------------------------------------
  // pushFilesViaAPI
  // --------------------------------------------------------------------------
  describe('pushFilesViaAPI', () => {
    it('calls getBranch, createTree, createCommit, updateRef in sequence', async () => {
      const callOrder: string[] = []

      mockGetBranch.mockImplementation(async () => {
        callOrder.push('getBranch')
        return { data: { commit: { sha: 'base-sha-111' } } }
      })
      mockCreateTree.mockImplementation(async () => {
        callOrder.push('createTree')
        return { data: { sha: 'tree-sha-222' } }
      })
      mockCreateCommit.mockImplementation(async () => {
        callOrder.push('createCommit')
        return { data: { sha: 'commit-sha-333' } }
      })
      mockUpdateRef.mockImplementation(async () => {
        callOrder.push('updateRef')
        return { data: {} }
      })

      const { pushFilesViaAPI } = await import('@server/lib/github')

      await pushFilesViaAPI(
        [
          { path: 'src/index.ts', content: 'console.log("hello")' },
          { path: 'package.json', content: '{"name":"test"}' },
        ],
        'TestOrg',
        'vibestack-proj-1',
      )

      expect(callOrder).toEqual(['getBranch', 'createTree', 'createCommit', 'updateRef'])
    })

    it('creates the tree with base_tree set to the HEAD SHA from getBranch', async () => {
      mockGetBranch.mockResolvedValue({ data: { commit: { sha: 'head-sha-abc' } } })
      mockCreateTree.mockResolvedValue({ data: { sha: 'new-tree-sha' } })
      mockCreateCommit.mockResolvedValue({ data: { sha: 'new-commit-sha' } })
      mockUpdateRef.mockResolvedValue({ data: {} })

      const { pushFilesViaAPI } = await import('@server/lib/github')

      await pushFilesViaAPI(
        [{ path: 'README.md', content: '# VibeStack App' }],
        'TestOrg',
        'my-repo',
      )

      expect(mockCreateTree).toHaveBeenCalledWith({
        owner: 'TestOrg',
        repo: 'my-repo',
        base_tree: 'head-sha-abc',
        tree: [
          {
            path: 'README.md',
            mode: '100644',
            type: 'blob',
            content: '# VibeStack App',
          },
        ],
      })
    })

    it('creates commit referencing the tree SHA and parent base SHA', async () => {
      mockGetBranch.mockResolvedValue({ data: { commit: { sha: 'parent-sha-xyz' } } })
      mockCreateTree.mockResolvedValue({ data: { sha: 'tree-for-commit' } })
      mockCreateCommit.mockResolvedValue({ data: { sha: 'final-commit-sha' } })
      mockUpdateRef.mockResolvedValue({ data: {} })

      const { pushFilesViaAPI } = await import('@server/lib/github')

      await pushFilesViaAPI([{ path: 'app.tsx', content: 'export default App' }], 'Org', 'repo')

      expect(mockCreateCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'Org',
          repo: 'repo',
          message: 'Initial generation by VibeStack',
          tree: 'tree-for-commit',
          parents: ['parent-sha-xyz'],
          author: expect.objectContaining({
            name: 'VibeStack Bot',
            email: 'vibestack@vibestack.com',
          }),
        }),
      )
    })

    it('updates refs/heads/main to point to the new commit SHA', async () => {
      mockGetBranch.mockResolvedValue({ data: { commit: { sha: 'old-sha' } } })
      mockCreateTree.mockResolvedValue({ data: { sha: 'new-tree' } })
      mockCreateCommit.mockResolvedValue({ data: { sha: 'brand-new-commit' } })
      mockUpdateRef.mockResolvedValue({ data: {} })

      const { pushFilesViaAPI } = await import('@server/lib/github')

      await pushFilesViaAPI([{ path: 'file.ts', content: '' }], 'MyOrg', 'my-repo')

      expect(mockUpdateRef).toHaveBeenCalledWith({
        owner: 'MyOrg',
        repo: 'my-repo',
        ref: 'heads/main',
        sha: 'brand-new-commit',
      })
    })
  })

  // --------------------------------------------------------------------------
  // Missing env var handling — uses vi.resetModules() to clear the singleton
  // --------------------------------------------------------------------------
  describe('missing env var handling', () => {
    it('getOctokit throws when GITHUB_APP_ID is missing', async () => {
      vi.resetModules()
      delete process.env.GITHUB_APP_ID

      const { createRepo } = await import('@server/lib/github')

      await expect(createRepo('any-name')).rejects.toThrow(
        'GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID are required',
      )
    })

    it('getOctokit throws when GITHUB_APP_PRIVATE_KEY is missing', async () => {
      vi.resetModules()
      delete process.env.GITHUB_APP_PRIVATE_KEY

      const { createRepo } = await import('@server/lib/github')

      await expect(createRepo('any-name')).rejects.toThrow(
        'GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID are required',
      )
    })

    it('getOctokit throws when GITHUB_APP_INSTALLATION_ID is missing', async () => {
      vi.resetModules()
      delete process.env.GITHUB_APP_INSTALLATION_ID

      const { pushFilesViaAPI } = await import('@server/lib/github')

      await expect(pushFilesViaAPI([{ path: 'x.ts', content: '' }], 'Org', 'repo')).rejects.toThrow(
        'GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID are required',
      )
    })
  })
})
