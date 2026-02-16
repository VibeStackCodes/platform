import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateVercelBuild } from '@server/lib/agents/build-validator'
import type { Sandbox } from '@daytonaio/sdk'

describe('build-validator', () => {
  let mockSandbox: Sandbox

  beforeEach(() => {
    mockSandbox = {
      process: {
        executeCommand: vi.fn(),
      },
    } as unknown as Sandbox
  })

  describe('validateVercelBuild', () => {
    it('returns passed when dist/ exists with index.html', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // dist/ check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // index.html check
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 }) // size check (5MB)
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      expect(result.allPassed).toBe(true)
      expect(result.checks).toHaveLength(6)
      expect(result.checks.every((c) => c.passed)).toBe(true)

      // Verify dist/ check
      expect(result.checks[0].name).toBe('dist_directory')
      expect(result.checks[0].message).toContain('dist/ directory exists')

      // Verify index.html check
      expect(result.checks[1].name).toBe('index_html')
      expect(result.checks[1].message).toContain('dist/index.html exists')
    })

    it('fails when dist/ is missing', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'MISSING', exitCode: 0 }) // dist/ check
        .mockResolvedValueOnce({ result: 'MISSING', exitCode: 0 }) // index.html check
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 }) // size check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      expect(result.allPassed).toBe(false)
      expect(result.checks[0].passed).toBe(false)
      expect(result.checks[0].severity).toBe('error')
      expect(result.checks[0].message).toContain('dist/ directory missing')
    })

    it('fails when index.html is missing', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // dist/ check
        .mockResolvedValueOnce({ result: 'MISSING', exitCode: 0 }) // index.html check
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 }) // size check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      expect(result.allPassed).toBe(false)
      expect(result.checks[1].passed).toBe(false)
      expect(result.checks[1].severity).toBe('error')
      expect(result.checks[1].message).toContain('dist/index.html missing')
    })

    it('warns on large bundle size', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // dist/ check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // index.html check
        .mockResolvedValueOnce({ result: '52428800', exitCode: 0 }) // size check (50MB)
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      // allPassed should still be true (warnings don't fail)
      expect(result.allPassed).toBe(true)
      expect(result.checks[2].passed).toBe(false)
      expect(result.checks[2].severity).toBe('warning')
      expect(result.checks[2].message).toContain('exceeds 50MB threshold')
    })

    it('warns on missing vercel.json', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // dist/ check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // index.html check
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 }) // size check
        .mockResolvedValueOnce({ result: 'MISSING', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      // allPassed should still be true (warnings don't fail)
      expect(result.allPassed).toBe(true)
      expect(result.checks[3].passed).toBe(false)
      expect(result.checks[3].severity).toBe('warning')
      expect(result.checks[3].message).toContain('vercel.json missing')
    })

    it('warns on process.env in client code', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // dist/ check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // index.html check
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 }) // size check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: 'src/components/App.tsx\nsrc/lib/api.ts', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      // allPassed should still be true (warnings don't fail)
      expect(result.allPassed).toBe(true)
      expect(result.checks[4].passed).toBe(false)
      expect(result.checks[4].severity).toBe('warning')
      expect(result.checks[4].message).toContain('process.env instead of import.meta.env')
      expect(result.checks[4].message).toContain('src/components/App.tsx')
    })

    it('warns on large individual files', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // dist/ check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // index.html check
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 }) // size check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '-rw-r--r-- 1 user user 8.0M Jan 1 12:00 /workspace/dist/assets/large.js', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      // allPassed should still be true (warnings don't fail)
      expect(result.allPassed).toBe(true)
      expect(result.checks[5].passed).toBe(false)
      expect(result.checks[5].severity).toBe('warning')
      expect(result.checks[5].message).toContain('Large files (>5MB) in dist/')
    })

    it('handles sandbox command failures gracefully', async () => {
      const executeCommand = vi.fn()
        .mockRejectedValueOnce(new Error('Connection timeout')) // dist/ check fails
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // index.html check
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 }) // size check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      expect(result.allPassed).toBe(false)
      expect(result.checks[0].passed).toBe(false)
      expect(result.checks[0].message).toContain('Failed to check dist/ directory')
    })

    it('handles non-critical check failures gracefully', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // dist/ check
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // index.html check
        .mockRejectedValueOnce(new Error('du command failed')) // size check fails
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // vercel.json check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // process.env check
        .mockResolvedValueOnce({ result: '', exitCode: 0 }) // large files check

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      // Should still pass overall (size check is a warning)
      expect(result.allPassed).toBe(true)
      expect(result.checks[2].passed).toBe(true)
      expect(result.checks[2].message).toContain('Could not determine bundle size')
    })
  })

  describe('integration with validation gate', () => {
    it('verifies validateVercelBuild function executes all checks', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 })
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 })
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 })
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 })
        .mockResolvedValueOnce({ result: '', exitCode: 0 })
        .mockResolvedValueOnce({ result: '', exitCode: 0 })

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      expect(result.allPassed).toBe(true)
      expect(executeCommand).toHaveBeenCalledTimes(6)
      expect(result.checks).toHaveLength(6)
      expect(result.checks.map((c) => c.name)).toEqual([
        'dist_directory',
        'index_html',
        'bundle_size',
        'vercel_config',
        'env_vars',
        'large_files',
      ])
    })

    it('only fails on error-severity checks', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // dist/ (error severity)
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 }) // index.html (error severity)
        .mockResolvedValueOnce({ result: '52428800', exitCode: 0 }) // size (warning severity) - 50MB
        .mockResolvedValueOnce({ result: 'MISSING', exitCode: 0 }) // vercel.json (warning severity)
        .mockResolvedValueOnce({ result: 'src/app.tsx', exitCode: 0 }) // process.env (warning severity)
        .mockResolvedValueOnce({ result: 'large.js', exitCode: 0 }) // large files (warning severity)

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      // Should pass because all error-severity checks passed
      expect(result.allPassed).toBe(true)

      // But should have failing warning checks
      const warningChecks = result.checks.filter((c) => c.severity === 'warning')
      const failedWarnings = warningChecks.filter((c) => !c.passed)
      expect(failedWarnings.length).toBeGreaterThan(0)
    })

    it('fails when error-severity check fails', async () => {
      const executeCommand = vi.fn()
        .mockResolvedValueOnce({ result: 'MISSING', exitCode: 0 }) // dist/ (error severity)
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 })
        .mockResolvedValueOnce({ result: '5242880', exitCode: 0 })
        .mockResolvedValueOnce({ result: 'EXISTS', exitCode: 0 })
        .mockResolvedValueOnce({ result: '', exitCode: 0 })
        .mockResolvedValueOnce({ result: '', exitCode: 0 })

      mockSandbox.process.executeCommand = executeCommand

      const result = await validateVercelBuild(mockSandbox)

      // Should fail because dist/ check (error severity) failed
      expect(result.allPassed).toBe(false)

      const errorChecks = result.checks.filter((c) => c.severity === 'error')
      const failedErrors = errorChecks.filter((c) => !c.passed)
      expect(failedErrors.length).toBeGreaterThan(0)
    })
  })
})
