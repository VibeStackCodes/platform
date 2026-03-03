/**
 * POST /api/editor/write
 *
 * Raw file-write endpoint used by the undo/redo keyboard shortcuts.
 *
 * Unlike /api/editor/patch (which applies AST-level edits by data-oid), this
 * endpoint writes the FULL file content back to the sandbox verbatim. Vite HMR
 * picks up the change automatically.
 *
 * Request:  { sandboxId, file, content }
 * Response: { success: true } | { error: string }
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { describeRoute, resolver } from 'hono-openapi'
import { authMiddleware } from '../middleware/auth'
import { getSandbox } from '../lib/sandbox'
import { log } from '../lib/logger'

const slog = log.child({ module: 'editor-write' })

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const WriteRequestSchema = z.object({
  sandboxId: z.string().min(1).describe('Daytona sandbox ID'),
  file: z.string().min(1).describe('File path relative to /workspace (e.g. src/App.tsx)'),
  content: z.string().describe('Full file content to write'),
})

const WriteResponseSchema = z.object({
  success: z.boolean(),
})

const ErrorSchema = z.object({ error: z.string() })

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const editorWriteRoutes = new Hono()

editorWriteRoutes.use('*', authMiddleware)

editorWriteRoutes.post(
  '/',
  describeRoute({
    summary: 'Write full file content to sandbox (used for undo/redo)',
    description:
      'Writes a complete file to the Daytona sandbox without any AST manipulation. ' +
      'Used by the undo/redo keyboard shortcuts to restore previous or next file contents. ' +
      'Vite HMR picks up the change automatically.',
    tags: ['editor'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'File written successfully',
        content: { 'application/json': { schema: resolver(WriteResponseSchema) } },
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
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Request body must be valid JSON' }, 400)
    }

    const parsed = WriteRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        400,
      )
    }

    const { sandboxId, file, content } = parsed.data
    const user = c.var.user

    // Sanitize path: strip leading slashes and block directory traversal
    const normalised = file.replace(/^\/+/, '').replace(/\.\.\//g, '')
    const filePath = `/workspace/${normalised}`

    slog.info('Editor write request (undo/redo)', {
      sandboxId,
      filePath,
      userId: user.id,
      contentLength: content.length,
    })

    let sandbox
    try {
      sandbox = await getSandbox(sandboxId)
    } catch (err) {
      slog.warn('Sandbox not found', { sandboxId, error: err })
      return c.json({ error: 'Sandbox not found' }, 404)
    }

    try {
      await sandbox.fs.uploadFile(Buffer.from(content), filePath)
      slog.info('File written via undo/redo', { filePath, sandboxId })
      return c.json({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      slog.warn('Failed to write file to sandbox', { filePath, sandboxId, error: message })
      return c.json({ error: message }, 500)
    }
  },
)
