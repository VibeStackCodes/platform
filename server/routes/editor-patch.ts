/**
 * POST /api/editor/patch
 *
 * Visual editor patch endpoint — applies AST-level edits to sandbox source files.
 *
 * Accepts an array of patch operations (each targeting an element by its
 * `data-oid` attribute) and writes the mutated files back to the Daytona sandbox.
 * The running Vite dev server picks up the changes via HMR automatically.
 *
 * Request: { projectId, sandboxId, edits[] }
 * Response: { success, results[] }
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { describeRoute, resolver } from 'hono-openapi'
import { authMiddleware } from '../middleware/auth'
import { getSandbox } from '../lib/sandbox'
import { patchSource } from '../lib/editor/ast-patcher'
import { commitAndPush } from '../lib/git'
import { log } from '../lib/logger'
import path from 'node:path'

const slog = log.child({ module: 'editor-patch' })

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const EditSchema = z.object({
  file: z.string().describe('File path relative to /workspace (e.g. src/App.tsx). May be empty — server will search all .tsx/.jsx files for the element OID.'),
  oid: z.string().min(1).describe('data-oid value of the target JSX element'),
  type: z
    .enum(['text', 'className', 'attribute', 'reorder', 'delete', 'style'])
    .describe('Kind of patch to apply'),
  value: z
    .string()
    .describe(
      'New value — plain string for text/className, "attrName=value" for attribute, "up"|"down" for reorder, CSS value for style',
    ),
  prop: z.string().optional().describe('CSS property name for style patches (e.g. "font-size")'),
  previousValue: z.string().optional().describe('Original value (used for undo on the client)'),
})

const PatchRequestSchema = z.object({
  projectId: z.string().uuid().describe('Project UUID'),
  sandboxId: z.string().min(1).describe('Daytona sandbox ID'),
  edits: z.array(EditSchema).min(1).describe('One or more patch operations to apply'),
})

const EditResultSchema = z.object({
  file: z.string(),
  previousContent: z.string(),
  newContent: z.string(),
  error: z.string().optional(),
})

const PatchResponseSchema = z.object({
  success: z.boolean().describe('true if every edit applied without error'),
  results: z.array(EditResultSchema),
  error: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Searches all .tsx/.jsx files under /workspace/src in the sandbox for the
 * element with the given data-oid attribute. Returns the file path and content
 * on the first match, or null if not found.
 */
async function findFileWithOid(
  sandbox: { fs: { downloadFile(p: string): Promise<Buffer | Uint8Array> }; process: { executeCommand(cmd: string, cwd?: string, env?: unknown, timeout?: number): Promise<{ exitCode: number; result: string }> } },
  oid: string,
): Promise<{ path: string; content: string } | null> {
  let filePaths: string[]
  try {
    const listResult = await sandbox.process.executeCommand(
      `find /workspace/src -type f \\( -name "*.tsx" -o -name "*.jsx" \\)`,
      '/workspace',
      undefined,
      30,
    )
    filePaths = listResult.result
      .split('\n')
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)
  } catch (err) {
    slog.warn('find command failed in findFileWithOid', { oid, error: err })
    return null
  }

  for (const filePath of filePaths) {
    try {
      const raw = await sandbox.fs.downloadFile(filePath)
      const content = raw instanceof Buffer ? raw.toString('utf8') : new TextDecoder().decode(raw)
      if (content.includes(`data-oid="${oid}"`)) {
        return { path: filePath, content }
      }
    } catch {
      // skip unreadable files
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const editorPatchRoutes = new Hono()

editorPatchRoutes.use('*', authMiddleware)

editorPatchRoutes.post(
  '/',
  describeRoute({
    summary: 'Apply visual editor patches to sandbox source files',
    description:
      'Reads the target file from the sandbox, applies AST-level edits keyed by data-oid, ' +
      'and writes the patched file back. Vite HMR picks up changes automatically.',
    tags: ['editor'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Patch results for each requested edit',
        content: { 'application/json': { schema: resolver(PatchResponseSchema) } },
      },
      400: {
        description: 'Invalid request body',
        content: { 'application/json': { schema: resolver(ErrorSchema) } },
      },
      401: { description: 'Unauthorized' },
      404: {
        description: 'Sandbox not found',
        content: { 'application/json': { schema: resolver(ErrorSchema) } },
      },
      500: {
        description: 'Unexpected server error',
        content: { 'application/json': { schema: resolver(ErrorSchema) } },
      },
    },
  }),
  async (c) => {
    // Parse + validate body
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Request body must be valid JSON' }, 400)
    }

    const parsed = PatchRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        400,
      )
    }

    const { projectId, sandboxId, edits } = parsed.data
    const user = c.var.user

    slog.info('Editor patch request', {
      projectId,
      sandboxId,
      userId: user.id,
      editCount: edits.length,
    })

    // Resolve sandbox — getSandbox() throws if not found
    let sandbox
    try {
      sandbox = await getSandbox(sandboxId)
    } catch (err) {
      slog.warn('Sandbox not found', { sandboxId, error: err })
      return c.json({ error: 'Sandbox not found' }, 404)
    }

    // Apply each edit sequentially so later edits in the same file see
    // the result of earlier ones (content is fetched fresh per unique file).
    // We maintain a write-through cache so we never re-fetch a file we already patched.
    const fileCache = new Map<string, string>()

    const results: Array<{
      file: string
      previousContent: string
      newContent: string
      error?: string
    }> = []

    for (const edit of edits) {
      let normalised: string
      let filePath: string
      let source: string

      if (!edit.file) {
        // No file specified — search all .tsx/.jsx files in /workspace/src for this OID
        const found = await findFileWithOid(sandbox, edit.oid)
        if (!found) {
          slog.warn('OID not found in any source file', { oid: edit.oid, sandboxId })
          results.push({ file: '', previousContent: '', newContent: '', error: `No file found containing OID ${edit.oid}` })
          continue
        }
        filePath = found.path
        normalised = found.path.replace('/workspace/', '')
        source = found.content
        fileCache.set(filePath, source)
      } else {
        // Sanitize path: strip leading slashes, block traversal, prepend /workspace/
        normalised = edit.file.replace(/^\/+/, '').replace(/\.\.\//g, '')
        filePath = `/workspace/${normalised}`

        // Read from cache or sandbox
        if (fileCache.has(filePath)) {
          source = fileCache.get(filePath) as string
        } else {
          try {
            const raw = await sandbox.fs.downloadFile(filePath)
            source = raw instanceof Buffer ? raw.toString('utf8') : new TextDecoder().decode(raw)
            fileCache.set(filePath, source)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            slog.warn('Failed to read file from sandbox', { filePath, sandboxId, error: message })
            results.push({ file: edit.file, previousContent: '', newContent: '', error: message })
            continue
          }
        }
      }

      // Apply AST patch
      let newContent: string
      try {
        newContent = patchSource(source, { oid: edit.oid, type: edit.type, value: edit.value, prop: edit.prop })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        slog.warn('AST patch failed', { filePath, oid: edit.oid, type: edit.type, error: message })
        results.push({ file: normalised, previousContent: source, newContent: source, error: message })
        continue
      }

      // Write patched content back to sandbox
      try {
        await sandbox.fs.uploadFile(Buffer.from(newContent), filePath)
        // Update cache so subsequent edits to the same file use the latest content
        fileCache.set(filePath, newContent)
        results.push({ file: normalised, previousContent: source, newContent })
        slog.info('Patch applied', { filePath, oid: edit.oid, type: edit.type })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        slog.warn('Failed to write file to sandbox', { filePath, sandboxId, error: message })
        results.push({ file: normalised, previousContent: source, newContent: source, error: message })
      }
    }

    const success = results.every((r) => !r.error)

    // Fire-and-forget: commit + push visual edits to GitHub
    if (success) {
      const editSummary = edits.map((e) => `${e.type}:${e.oid.slice(0, 6)}`).join(', ')
      commitAndPush(sandbox.process, `Visual edit: ${editSummary}`).catch((err) => {
        slog.warn('Auto-commit after visual edit failed', { sandboxId, error: err })
      })
    }

    return c.json({ success, results })
  },
)

// ---------------------------------------------------------------------------
// POST /image — upload a replacement image and patch the src attribute
// ---------------------------------------------------------------------------

editorPatchRoutes.post(
  '/image',
  describeRoute({
    summary: 'Replace an image element with an uploaded file',
    description:
      'Accepts multipart form data with the replacement image file and the target element OID. ' +
      'Uploads the image to /workspace/public/images/<filename> in the sandbox, then applies an ' +
      'AST attribute patch to update the src prop on the matching JSX element.',
    tags: ['editor'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Image replaced successfully',
        content: {
          'application/json': {
            schema: resolver(z.object({ success: z.boolean(), imagePath: z.string() })),
          },
        },
      },
      400: {
        description: 'Invalid request',
        content: { 'application/json': { schema: resolver(z.object({ error: z.string() })) } },
      },
      401: { description: 'Unauthorized' },
      404: {
        description: 'Sandbox or element not found',
        content: { 'application/json': { schema: resolver(z.object({ error: z.string() })) } },
      },
      500: {
        description: 'Unexpected server error',
        content: { 'application/json': { schema: resolver(z.object({ error: z.string() })) } },
      },
    },
  }),
  async (c) => {
    let formData: FormData
    try {
      formData = await c.req.formData()
    } catch {
      return c.json({ error: 'Request must be multipart/form-data' }, 400)
    }

    const file = formData.get('file')
    const projectId = formData.get('projectId')
    const sandboxId = formData.get('sandboxId')
    const oid = formData.get('oid')

    if (!(file instanceof File) || !file.name) {
      return c.json({ error: 'Missing or invalid file field' }, 400)
    }
    if (typeof projectId !== 'string' || !projectId) {
      return c.json({ error: 'Missing projectId field' }, 400)
    }
    if (typeof sandboxId !== 'string' || !sandboxId) {
      return c.json({ error: 'Missing sandboxId field' }, 400)
    }
    if (typeof oid !== 'string' || !oid) {
      return c.json({ error: 'Missing oid field' }, 400)
    }

    // Sanitize filename: strip directory traversal, keep only the basename
    const safeFilename = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!safeFilename) {
      return c.json({ error: 'Invalid filename' }, 400)
    }

    const user = c.var.user
    slog.info('Image replace request', { projectId, sandboxId, oid, filename: safeFilename, userId: user.id })

    // Resolve sandbox
    let sandbox
    try {
      sandbox = await getSandbox(sandboxId)
    } catch (err) {
      slog.warn('Sandbox not found for image replace', { sandboxId, error: err })
      return c.json({ error: 'Sandbox not found' }, 404)
    }

    // Upload image to /workspace/public/images/<filename>
    const imagePath = `/workspace/public/images/${safeFilename}`
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      await sandbox.fs.uploadFile(buffer, imagePath)
      slog.info('Image uploaded to sandbox', { imagePath, sandboxId })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      slog.warn('Failed to upload image to sandbox', { imagePath, sandboxId, error: message })
      return c.json({ error: `Failed to upload image: ${message}` }, 500)
    }

    // Find the source file containing this OID by scanning .tsx / .jsx files in /workspace/src
    const publicSrc = `/images/${safeFilename}`

    let foundFile: string | null = null
    let foundSource: string | null = null

    try {
      // List source files
      const listResult = await sandbox.process.executeCommand(
        `find /workspace/src -type f \\( -name "*.tsx" -o -name "*.jsx" \\)`,
        '/workspace',
        undefined,
        30,
      )

      if (listResult.exitCode !== 0) {
        throw new Error(`find command failed: ${listResult.result}`)
      }

      const filePaths = listResult.result
        .split('\n')
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0)

      // Read each file and look for the OID
      for (const filePath of filePaths) {
        try {
          const raw = await sandbox.fs.downloadFile(filePath)
          const source = raw instanceof Buffer ? raw.toString('utf8') : new TextDecoder().decode(raw)
          if (source.includes(`data-oid="${oid}"`)) {
            foundFile = filePath
            foundSource = source
            break
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      slog.warn('Failed to scan source files for OID', { oid, sandboxId, error: message })
      return c.json({ error: `Failed to scan source files: ${message}` }, 500)
    }

    if (!foundFile || foundSource === null) {
      slog.warn('OID not found in any source file', { oid, sandboxId })
      return c.json({ error: `No source file found containing element with data-oid="${oid}"` }, 404)
    }

    // Apply AST patch to update the src attribute
    let patchedSource: string
    try {
      patchedSource = patchSource(foundSource, { oid, type: 'attribute', value: `src=${publicSrc}` })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      slog.warn('AST patch failed for image src', { foundFile, oid, error: message })
      return c.json({ error: `Failed to patch source: ${message}` }, 500)
    }

    // Write the patched file back to sandbox
    try {
      await sandbox.fs.uploadFile(Buffer.from(patchedSource), foundFile)
      slog.info('Image src patched', { foundFile, oid, publicSrc })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      slog.warn('Failed to write patched file', { foundFile, sandboxId, error: message })
      return c.json({ error: `Failed to write patched file: ${message}` }, 500)
    }

    // Fire-and-forget: commit + push image replacement to GitHub
    commitAndPush(sandbox.process, `Visual edit: replace image ${oid.slice(0, 6)}`).catch(
      (err) => {
        slog.warn('Auto-commit after image replace failed', { sandboxId, error: err })
      },
    )

    return c.json({ success: true, imagePath: publicSrc })
  },
)
