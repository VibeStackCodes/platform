/**
 * Local Generation Test — Real Services, No UI
 *
 * Calls the orchestrator agent directly with real Daytona sandbox,
 * real LLM, and real Relace. Bypasses HTTP route (no auth/credits/DB).
 *
 * Run manually:
 *   bun run test -- tests/local-gen.test.ts --timeout 300000
 */

// @vitest-environment node
// ↑ Override happy-dom (vitest default) — we need real fetch for OpenAI/Daytona API calls

import { config } from 'dotenv'
import { resolve } from 'node:path'

// Load real env vars from project root .env.local BEFORE any server imports
// (provider.ts reads OPENAI_API_KEY / ANTHROPIC_API_KEY at import time)
config({ path: resolve(__dirname, '../.env.local'), override: true })

import { describe, it, expect } from 'vitest'
import { RequestContext } from '@mastra/core/di'
import { createOrchestrator } from '@server/lib/agents/orchestrator'

// ---------------------------------------------------------------------------
// Env guard — skip if keys are missing (CI or unconfigured workstation)
// ---------------------------------------------------------------------------

const REQUIRED_KEYS = ['OPENAI_API_KEY', 'DAYTONA_API_KEY', 'DAYTONA_SNAPSHOT_ID']
const missingKeys = REQUIRED_KEYS.filter((k) => !process.env[k])

const describeReal = missingKeys.length === 0 ? describe : describe.skip

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pretty-print a stream chunk to stdout for manual inspection */
function logChunk(chunk: { type: string; [k: string]: unknown }) {
  const ts = new Date().toISOString().slice(11, 23) // HH:mm:ss.SSS
  switch (chunk.type) {
    case 'text-delta':
      // Accumulate; printed in batches below
      break
    case 'tool-call': {
      const name = extractToolName(chunk)
      console.log(`  [${ts}] 🔧 TOOL  ${name}(${summarizeArgs(extractArgs(chunk))})`)
      break
    }
    case 'tool-result': {
      const rName = extractToolName(chunk)
      const rResult = extractResult(chunk)
      const ok = rResult?.success !== false && rResult?.exitCode !== 1
      console.log(`  [${ts}] ✅ RESULT ${rName}: ${ok ? 'ok' : 'FAIL'}`)
      break
    }
    case 'step-finish': {
      const u = chunk.usage as { totalTokens?: number } | undefined
      if (u?.totalTokens) console.log(`  [${ts}] 📊 Step tokens: ${u.totalTokens}`)
      break
    }
    case 'error':
      console.error(`  [${ts}] ❌ ERROR: ${JSON.stringify(chunk.error ?? chunk).slice(0, 300)}`)
      break
    case 'finish':
      console.log(`  [${ts}] 🏁 Stream finished`)
      break
    default:
      console.log(`  [${ts}] [${chunk.type}]`, JSON.stringify(chunk).slice(0, 120))
  }
}

/**
 * Mastra fullStream wraps Vercel AI SDK chunks in an envelope:
 *   { type, runId, from, payload: { toolName, args, result, ... } }
 * These helpers extract properties from either flat or envelope format.
 */
function extractToolName(chunk: Record<string, unknown>): string {
  // Flat: chunk.toolName, Envelope: chunk.payload.toolName
  if (typeof chunk.toolName === 'string') return chunk.toolName
  const payload = chunk.payload as Record<string, unknown> | undefined
  if (payload && typeof payload.toolName === 'string') return payload.toolName
  // Some chunks use just 'name'
  if (typeof chunk.name === 'string') return chunk.name
  if (payload && typeof payload.name === 'string') return payload.name
  return 'unknown'
}

function extractArgs(chunk: Record<string, unknown>): unknown {
  if (chunk.args) return chunk.args
  const payload = chunk.payload as Record<string, unknown> | undefined
  return payload?.args
}

function extractResult(chunk: Record<string, unknown>): Record<string, unknown> | undefined {
  const raw = chunk.result ?? (chunk.payload as Record<string, unknown> | undefined)?.result
  return raw as Record<string, unknown> | undefined
}

function extractTextDelta(chunk: Record<string, unknown>): string {
  if (typeof chunk.textDelta === 'string') return chunk.textDelta
  const payload = chunk.payload as Record<string, unknown> | undefined
  return (payload?.textDelta as string) ?? ''
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const obj = args as Record<string, unknown>
  // Show key fields only — path for file ops, query for search, etc.
  if (obj.path) return `path=${obj.path}`
  if (obj.query) return `query="${obj.query}"`
  if (obj.packages) return `packages=${obj.packages}`
  if (obj.command) return `command="${String(obj.command).slice(0, 60)}"`
  if (obj.files && Array.isArray(obj.files))
    return `${obj.files.length} files`
  return Object.keys(obj).join(', ')
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describeReal(
  'Local Generation (real services)',
  () => {
    it(
      'builds a todo app end-to-end',
      { timeout: 300_000 }, // 5 minutes — agent may use 30-50 tool calls
      async () => {
        if (missingKeys.length > 0) {
          console.log(`⏭ Skipping: missing env vars: ${missingKeys.join(', ')}`)
          return
        }

        console.log('\n━━━ Local Gen Test ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`Model: gpt-5.2-codex`)
        console.log(`Snapshot: ${process.env.DAYTONA_SNAPSHOT_ID}`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        // 1. Set up RequestContext for model routing
        const requestContext = new RequestContext()
        requestContext.set('selectedModel', 'gpt-5.2-codex')

        // 2. Create agent
        const agent = createOrchestrator()

        // 3. Stream the generation
        const streamOutput = await agent.stream(
          'Build a todo app with add, complete, and delete tasks. Use a clean minimal design with a blue accent color.',
          {
            requestContext,
            maxSteps: 50,
          },
        )

        // 4. Read the fullStream — same pattern as bridgeStreamToSSE()
        const reader = streamOutput.fullStream.getReader()
        let totalTokens = 0
        let sandboxId: string | undefined
        let thinkingBuffer = ''
        const toolResults: Array<{ tool: string; success: boolean }> = []

        try {
          while (true) {
            const { done, value: chunk } = await reader.read()
            if (done) break
            if (!chunk || !chunk.type) continue

            // Log every chunk for observability
            logChunk(chunk)

            switch (chunk.type) {
              case 'text-delta': {
                thinkingBuffer += extractTextDelta(chunk)
                // Flush thinking in ~200-char batches
                if (thinkingBuffer.length > 200) {
                  console.log(`  💭 ${thinkingBuffer.slice(0, 120)}...`)
                  thinkingBuffer = ''
                }
                break
              }

              case 'tool-result': {
                const result = extractResult(chunk)
                const toolName = extractToolName(chunk)
                const success = result?.success !== false && result?.exitCode !== 1

                toolResults.push({ tool: toolName, success })

                // Capture sandboxId from createSandbox result
                if (toolName === 'createSandbox' && result?.sandboxId) {
                  sandboxId = result.sandboxId as string
                  console.log(`\n  🏗️  Sandbox created: ${sandboxId}\n`)
                }
                // Fallback: scan any tool result for sandboxId (in case tool name extraction fails)
                if (!sandboxId && result?.sandboxId) {
                  sandboxId = result.sandboxId as string
                  console.log(`\n  🏗️  Sandbox detected (from ${toolName}): ${sandboxId}\n`)
                }
                break
              }

              case 'step-finish': {
                const payload = (chunk.payload ?? chunk) as { usage?: { totalTokens?: number } }
                const usage = chunk.usage as { totalTokens?: number } | undefined ?? payload.usage
                if (usage?.totalTokens) {
                  totalTokens += usage.totalTokens
                }
                break
              }
            }
          }
        } finally {
          reader.releaseLock()
        }

        // Flush remaining thinking
        if (thinkingBuffer) {
          console.log(`  💭 ${thinkingBuffer.slice(0, 200)}`)
        }

        // 5. Get final usage
        try {
          const usage = await streamOutput.usage
          if (usage?.totalTokens) {
            totalTokens = usage.totalTokens
          }
        } catch {
          // Usage may not be available
        }

        // 6. Print summary
        console.log('\n━━━ Results ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`Sandbox ID:   ${sandboxId ?? 'NONE'}`)
        console.log(`Total tokens: ${totalTokens}`)
        console.log(`Tool calls:   ${toolResults.length}`)
        console.log(`  Succeeded:  ${toolResults.filter((r) => r.success).length}`)
        console.log(`  Failed:     ${toolResults.filter((r) => !r.success).length}`)
        console.log('Tool trace:')
        for (const r of toolResults) {
          console.log(`  ${r.success ? '✅' : '❌'} ${r.tool}`)
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        // 7. Assertions
        expect(sandboxId, 'Sandbox should have been created').toBeTruthy()
        expect(toolResults.length, 'Agent should have used tools').toBeGreaterThan(0)

        // Check that createSandbox was called
        const sandboxCall = toolResults.find((r) => r.tool === 'createSandbox')
        expect(sandboxCall, 'createSandbox tool should have been called').toBeTruthy()
        expect(sandboxCall?.success, 'createSandbox should succeed').toBe(true)

        // Check that files were written
        const writeOps = toolResults.filter(
          (r) => r.tool === 'writeFile' || r.tool === 'writeFiles' || r.tool === 'editFile',
        )
        expect(writeOps.length, 'Agent should write at least one file').toBeGreaterThan(0)

        // Check that build was attempted
        const buildCall = toolResults.find((r) => r.tool === 'runBuild')
        expect(buildCall, 'runBuild should have been called').toBeTruthy()
        expect(buildCall?.success, 'Build should pass').toBe(true)

        console.log('✅ All assertions passed!\n')
      },
    )
  },
)
