import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import path from 'node:path'
import { buildRepoName, createRepo, getInstallationToken } from '../github'
import {
  buildProxyUrl,
  createSandbox as createSandboxFn,
  getPreviewUrl as getPreviewUrlFn,
  getSandbox,
} from '../sandbox'
import { applyEdit } from '../relace'
/**
 * Standalone Mastra tools for 9-agent architecture
 *
 * Each tool is a standalone export that can be assigned to agents via their `tools` property.
 * Tools that need sandbox access take `sandboxId` as an input parameter.
 */

/** Escape a string for safe use in shell commands */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/** Sanitize a path to prevent traversal outside /workspace */
function sanitizeSandboxPath(inputPath: string): string {
  // Normalize and strip leading slashes
  const normalized = path.posix.normalize(inputPath).replace(/^\/+/, '')
  // Block any remaining path traversal
  if (normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error(`Path traversal blocked: ${inputPath}`)
  }
  return `/workspace/${normalized}`
}

/** Maximum file size in bytes (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024

// ============================================================================
// File Operations
// ============================================================================

export const writeFileTool = createTool({
  id: 'write-file',
  description: 'Write a file to the sandbox workspace',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    path: z.string().describe('File path relative to /workspace'),
    content: z.string().describe('File content to write'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    bytesWritten: z.number(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      // Check file size limit
      if (inputData.content.length > MAX_FILE_SIZE) {
        return {
          success: false,
          path: inputData.path,
          bytesWritten: 0,
          error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        }
      }

      const sandbox = await getSandbox(inputData.sandboxId)
      const fullPath = sanitizeSandboxPath(inputData.path)
      await sandbox.fs.uploadFile(Buffer.from(inputData.content), fullPath)
      return {
        success: true,
        path: inputData.path,
        bytesWritten: inputData.content.length,
      }
    } catch (e) {
      return {
        success: false,
        path: inputData.path,
        bytesWritten: 0,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

export const writeFilesTool = createTool({
  id: 'write-files',
  description:
    'Write multiple files to the sandbox workspace in one call. More efficient than multiple write-file calls for scaffolding.',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    files: z
      .array(
        z.object({
          path: z.string().describe('File path relative to /workspace'),
          content: z.string().describe('File content to write'),
        }),
      )
      .describe('Array of files to write'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    paths: z.array(z.string()),
    filesWritten: z.number(),
    totalBytes: z.number(),
    errors: z.array(z.object({ path: z.string(), error: z.string() })),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    // Check file size limits for all files first
    for (const file of inputData.files) {
      if (file.content.length > MAX_FILE_SIZE) {
        return {
          success: false,
          paths: [],
          filesWritten: 0,
          totalBytes: 0,
          errors: [],
          error: `File ${file.path} exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
        }
      }
    }

    const sandbox = await getSandbox(inputData.sandboxId)
    let filesWritten = 0
    let totalBytes = 0
    const writtenPaths: string[] = []
    const errors: { path: string; error: string }[] = []

    for (const file of inputData.files) {
      try {
        const fullPath = sanitizeSandboxPath(file.path)
        await sandbox.fs.uploadFile(Buffer.from(file.content), fullPath)
        filesWritten++
        totalBytes += file.content.length
        writtenPaths.push(file.path)
      } catch (e) {
        errors.push({ path: file.path, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return {
      success: errors.length === 0,
      paths: writtenPaths,
      filesWritten,
      totalBytes,
      errors,
    }
  },
})

export const readFileTool = createTool({
  id: 'read-file',
  description: 'Read a file from the sandbox workspace',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    path: z.string().describe('File path relative to /workspace'),
  }),
  outputSchema: z.object({
    content: z.string(),
    exists: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const fullPath = sanitizeSandboxPath(inputData.path)
      const buffer = await sandbox.fs.downloadFile(fullPath)
      return {
        content: buffer.toString('utf-8'),
        exists: true,
      }
    } catch (e) {
      return {
        content: '',
        exists: false,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

export const listFilesTool = createTool({
  id: 'list-files',
  description: 'List files in a sandbox directory',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    directory: z.string().describe('Directory path relative to /workspace'),
  }),
  outputSchema: z.object({
    files: z.array(z.string()),
    count: z.number(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const fullPath = sanitizeSandboxPath(inputData.directory)

      const result = await sandbox.process.executeCommand(
        `find ${escapeShellArg(fullPath)} -type f ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/.git/*" | sort`,
        '/workspace',
        undefined,
        30,
      )

      if (result.exitCode !== 0) {
        return { files: [], count: 0 }
      }

      const files = result.result
        .split('\n')
        .filter((f) => f.trim() !== '')
        .map((f) => f.replace(`/workspace/${inputData.directory}/`, ''))

      return {
        files,
        count: files.length,
      }
    } catch (e) {
      return {
        files: [],
        count: 0,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

// ============================================================================
// Command Execution
// ============================================================================

export const runCommandTool = createTool({
  id: 'run-command',
  description: 'Execute a command in the sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    command: z.string().describe('Command to execute'),
    cwd: z.string().optional().describe('Working directory (defaults to /workspace)'),
  }),
  outputSchema: z.object({
    exitCode: z.number(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const workDir = inputData.cwd || '/workspace'

    const result = await sandbox.process.executeCommand(inputData.command, workDir, undefined, 120)

    return {
      exitCode: result.exitCode,
      stdout: result.result,
      stderr: result.exitCode !== 0 ? result.result : '',
    }
  },
})

export const runBuildTool = createTool({
  id: 'run-build',
  description: 'Run bun run build in the sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
  }),
  outputSchema: z.object({
    exitCode: z.number(),
    output: z.string(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)

    const result = await sandbox.process.executeCommand(
      'bun run build',
      '/workspace',
      undefined,
      120,
    )

    return {
      exitCode: result.exitCode,
      output: result.result,
    }
  },
})

// ============================================================================
// Preview & Sandbox Management
// ============================================================================

export const getPreviewUrlTool = createTool({
  id: 'get-preview-url',
  description: 'Get a signed preview URL for the sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    port: z.number().optional().default(3000).describe('Port number (default: 3000)'),
  }),
  outputSchema: z.object({
    url: z.string(),
    port: z.number(),
    expiresAt: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const port = inputData.port || 3000
      const preview = await getPreviewUrlFn(sandbox, port)
      return {
        url: buildProxyUrl(inputData.sandboxId, preview.port),
        port: preview.port,
        expiresAt: preview.expiresAt.toISOString(),
      }
    } catch (e) {
      return {
        url: '',
        port: inputData.port || 3000,
        expiresAt: '',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

export const createSandboxTool = createTool({
  id: 'create-sandbox',
  description:
    'Create a new Daytona sandbox from snapshot. Optionally pass labels as a key-value object.',
  inputSchema: z.object({
    labels: z
      .preprocess((val) => {
        if (typeof val === 'string') return { project: val }
        if (typeof val === 'boolean' || typeof val === 'number') return {}
        return val
      }, z.record(z.string(), z.string()).optional())
      .describe('Optional labels, e.g. {"project": "my-app"}. A plain string is also accepted.'),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await createSandboxFn({
        language: 'typescript',
        autoStopInterval: 60,
        labels: inputData.labels || {},
      })
      return { sandboxId: sandbox.id, success: true }
    } catch (e) {
      return { sandboxId: '', success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
})

// ============================================================================
// GitHub & Deployment
// ============================================================================

export const commitAndPushTool = createTool({
  id: 'commit-and-push',
  description:
    'Commit all changes and push to GitHub. Creates a repo if none exists. Call after each meaningful change.',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    message: z.string().describe('Git commit message'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    commitHash: z.string().optional(),
    repoUrl: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    const { sandboxId, message } = inputData
    const sandbox = await getSandbox(sandboxId)

    // 1. git add -A && git commit
    const commitResult = await sandbox.process.executeCommand(
      `cd /workspace && git add -A && git commit -m ${escapeShellArg(message)} --allow-empty`,
      '/workspace',
      undefined,
      30,
    )
    if (commitResult.exitCode !== 0) {
      return { success: false, error: commitResult.result || 'Commit failed' }
    }

    // Extract commit hash
    const hashMatch = commitResult.result?.match(/\[[\w-]+ ([a-f0-9]+)\]/)
    const commitHash = hashMatch?.[1]

    // 2. Check if GitHub env vars are available for push
    if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_ORG) {
      return { success: true, commitHash }
    }

    try {
      // Check if origin remote exists
      const remoteResult = await sandbox.process.executeCommand(
        'cd /workspace && git remote get-url origin 2>/dev/null',
        '/workspace',
        undefined,
        10,
      )

      let repoUrl: string
      const existingRemote = remoteResult.result?.trim() ?? ''
      // Template remote must be replaced with a fresh app-specific repo
      const isTemplateRemote = existingRemote.includes('vibestack-template')
      const needsNewRepo = remoteResult.exitCode !== 0 || !existingRemote || isTemplateRemote

      if (needsNewRepo) {
        // No remote or template remote — create repo and set origin
        const repoName = buildRepoName('app', sandboxId)
        const repo = await createRepo(repoName)
        repoUrl = repo.cloneUrl
        const token = await getInstallationToken()
        const authedUrl = repoUrl.replace('https://', `https://x-access-token:${token}@`)
        if (isTemplateRemote) {
          await sandbox.process.executeCommand(
            `cd /workspace && git remote set-url origin ${authedUrl}`,
            '/workspace',
            undefined,
            15,
          )
        } else {
          await sandbox.process.executeCommand(
            `cd /workspace && git remote add origin ${authedUrl}`,
            '/workspace',
            undefined,
            15,
          )
        }
      } else {
        repoUrl = remoteResult.result.trim()
        // Refresh token for push
        const token = await getInstallationToken()
        const cleanUrl = repoUrl.replace(/x-access-token:[^@]+@/, '')
        const authedUrl = cleanUrl.replace('https://', `https://x-access-token:${token}@`)
        await sandbox.process.executeCommand(
          `cd /workspace && git remote set-url origin ${authedUrl}`,
          '/workspace',
          undefined,
          15,
        )
      }

      // 3. Push (force for new repos since local history diverges from template)
      const pushCmd = needsNewRepo
        ? 'cd /workspace && git push --force -u origin main'
        : 'cd /workspace && git push -u origin main'
      const pushResult = await sandbox.process.executeCommand(pushCmd, '/workspace', undefined, 60)

      if (pushResult.exitCode !== 0) {
        return {
          success: false,
          commitHash,
          error: `Push failed (exit ${pushResult.exitCode}): ${pushResult.result}`,
        }
      }

      return { success: true, commitHash, repoUrl }
    } catch (error) {
      return {
        success: false,
        commitHash,
        error: `Push failed: ${error instanceof Error ? error.message : 'unknown'}`,
      }
    }
  },
})

// ============================================================================
// Relace Edit
// ============================================================================

export const editFileTool = createTool({
  id: 'edit-file',
  description: `Edit an existing file in the sandbox using Relace Instant Apply.
Provide a lazy edit snippet — you can use "// ... keep existing code" markers
to abbreviate unchanged sections. Relace merges your snippet into the full file.
This is faster and cheaper than rewriting the entire file.`,
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    path: z.string().describe('File path relative to /workspace'),
    editSnippet: z
      .string()
      .describe('Edit snippet with "// ... keep existing code" markers for unchanged parts'),
    instruction: z
      .string()
      .optional()
      .describe('Optional natural language instruction for the merge'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    bytesWritten: z.number(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const fullPath = sanitizeSandboxPath(inputData.path)

      // Read current file content
      const buffer = await sandbox.fs.downloadFile(fullPath)
      const initialCode = buffer.toString('utf-8')

      // Apply edit via Relace
      const result = await applyEdit({
        initialCode,
        editSnippet: inputData.editSnippet,
        instruction: inputData.instruction,
      })

      // Write merged result back
      await sandbox.fs.uploadFile(Buffer.from(result.mergedCode), fullPath)

      return {
        success: true,
        path: inputData.path,
        bytesWritten: result.mergedCode.length,
      }
    } catch (e) {
      return {
        success: false,
        path: inputData.path,
        bytesWritten: 0,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

// ============================================================================
// Install Package
// ============================================================================

export const installPackageTool = createTool({
  id: 'install-package',
  description: `Install an npm package in the sandbox using bun add.
Use this when you need a library not included in the pre-installed snapshot.
The LLM is free to install any package it needs.`,
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    packages: z
      .string()
      .describe('Package names to install, space-separated (e.g. "dnd-kit @dnd-kit/core")'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const result = await sandbox.process.executeCommand(
        `bun add ${inputData.packages}`,
        '/workspace',
        undefined,
        60,
      )
      return {
        success: result.exitCode === 0,
        output: result.result,
        error: result.exitCode !== 0 ? result.result : undefined,
      }
    } catch (e) {
      return {
        success: false,
        output: '',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})
