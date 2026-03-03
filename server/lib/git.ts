/**
 * Git operations for Daytona sandboxes.
 *
 * Shared helper for committing + pushing changes from a sandbox workspace.
 * Used by both the visual editor patch route and the agent's commitAndPush tool.
 */

import { getInstallationToken } from './github'
import { log } from './logger'

const slog = log.child({ module: 'git' })

/** Escape a string for safe use in shell commands */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`
}

interface SandboxProcess {
  executeCommand(
    cmd: string,
    cwd?: string,
    env?: unknown,
    timeout?: number,
  ): Promise<{ exitCode: number; result: string }>
}

interface CommitAndPushResult {
  success: boolean
  commitHash?: string
  error?: string
}

/**
 * Commit all staged changes and push to the existing GitHub remote.
 *
 * Assumes the sandbox already has an `origin` remote pointing to a GitHub repo
 * (set up during initial generation by the agent's commitAndPush tool).
 * Refreshes the GitHub App installation token before pushing.
 *
 * This is a best-effort operation — callers should not block on the result.
 */
export async function commitAndPush(
  process: SandboxProcess,
  message: string,
): Promise<CommitAndPushResult> {
  // 1. git add -A && git commit
  const commitResult = await process.executeCommand(
    `cd /workspace && git add -A && git commit -m ${escapeShellArg(message)}`,
    '/workspace',
    undefined,
    30,
  )

  if (commitResult.exitCode !== 0) {
    // exitCode 1 with "nothing to commit" is not an error
    if (commitResult.result?.includes('nothing to commit')) {
      slog.debug('Nothing to commit', { message })
      return { success: true }
    }
    return { success: false, error: commitResult.result || 'Commit failed' }
  }

  // Extract commit hash
  const hashMatch = commitResult.result?.match(/\[[\w-]+ ([a-f0-9]+)\]/)
  const commitHash = hashMatch?.[1]

  // 2. Check if GitHub env vars are available for push
  const githubAppId = globalThis.process?.env?.GITHUB_APP_ID
  const githubOrg = globalThis.process?.env?.GITHUB_ORG
  if (!githubAppId || !githubOrg) {
    slog.debug('No GitHub env vars — skipping push', { commitHash })
    return { success: true, commitHash }
  }

  // 3. Refresh token and push
  try {
    const remoteResult = await process.executeCommand(
      'cd /workspace && git remote get-url origin 2>/dev/null',
      '/workspace',
      undefined,
      10,
    )

    if (remoteResult.exitCode !== 0 || !remoteResult.result?.trim()) {
      slog.warn('No origin remote configured — skipping push')
      return { success: true, commitHash }
    }

    const existingRemote = remoteResult.result.trim()
    // Refresh the installation token
    const token = await getInstallationToken()
    const cleanUrl = existingRemote.replace(/x-access-token:[^@]+@/, '')
    const authedUrl = cleanUrl.replace('https://', `https://x-access-token:${token}@`)

    await process.executeCommand(
      `cd /workspace && git remote set-url origin ${authedUrl}`,
      '/workspace',
      undefined,
      15,
    )

    const pushResult = await process.executeCommand(
      'cd /workspace && git push -u origin main',
      '/workspace',
      undefined,
      60,
    )

    if (pushResult.exitCode !== 0) {
      return {
        success: false,
        commitHash,
        error: `Push failed (exit ${pushResult.exitCode}): ${pushResult.result}`,
      }
    }

    slog.info('Visual edit committed and pushed', { commitHash, message })
    return { success: true, commitHash }
  } catch (error) {
    return {
      success: false,
      commitHash,
      error: `Push failed: ${error instanceof Error ? error.message : 'unknown'}`,
    }
  }
}
