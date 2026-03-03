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
import { log } from '../lib/logger'

const slog = log.child({ module: 'editor-patch' })

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const EditSchema = z.object({
  file: z.string().min(1).describe('File path relative to /workspace (e.g. src/App.tsx)'),
  oid: z.string().min(1).describe('data-oid value of the target JSX element'),
  type: z
    .enum(['text', 'className', 'attribute', 'reorder'])
    .describe('Kind of patch to apply'),
  value: z
    .string()
    .describe(
      'New value — plain string for text/className, "attrName=value" for attribute, "up"|"down" for reorder',
    ),
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
      // Sanitize path: strip leading slashes, block traversal, prepend /workspace/
      const normalised = edit.file.replace(/^\/+/, '').replace(/\.\.\//g, '')
      const filePath = `/workspace/${normalised}`

      // Read from cache or sandbox
      let source: string
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

      // Apply AST patch
      let newContent: string
      try {
        newContent = patchSource(source, { oid: edit.oid, type: edit.type, value: edit.value })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        slog.warn('AST patch failed', { filePath, oid: edit.oid, type: edit.type, error: message })
        results.push({ file: edit.file, previousContent: source, newContent: source, error: message })
        continue
      }

      // Write patched content back to sandbox
      try {
        await sandbox.fs.uploadFile(Buffer.from(newContent), filePath)
        // Update cache so subsequent edits to the same file use the latest content
        fileCache.set(filePath, newContent)
        results.push({ file: edit.file, previousContent: source, newContent })
        slog.info('Patch applied', { filePath, oid: edit.oid, type: edit.type })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        slog.warn('Failed to write file to sandbox', { filePath, sandboxId, error: message })
        results.push({ file: edit.file, previousContent: source, newContent: source, error: message })
      }
    }

    const success = results.every((r) => !r.error)

    return c.json({ success, results })
  },
)
