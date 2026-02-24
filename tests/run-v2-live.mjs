/**
 * Live V2 generation runner — streams tool calls to stdout
 * Usage: bun tests/run-v2-live.mjs ["your prompt here"]
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local'), override: true })

// Dynamic import after env vars are set
const { RequestContext } = await import('@mastra/core/di')
const { createV2Orchestrator } = await import('../server/lib/agents/v2-orchestrator.ts')

const prompt = process.argv[2] || `Build an image rich restaurant website with editorial vibes`

console.log('\n━━━ V2 Live Generation ━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('Model: gpt-5.2-codex')
console.log(`Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

const requestContext = new RequestContext()
requestContext.set('selectedModel', 'gpt-5.2-codex')

const agent = createV2Orchestrator('openai')
console.log(`Agent created with provider: openai`)
const streamOutput = await agent.stream(prompt, { requestContext, maxSteps: 50 })
const reader = streamOutput.fullStream.getReader()

let sandboxId
let totalTokens = 0
let toolCount = 0
let thinkBuf = ''
const toolTrace = []

function ts() {
  return new Date().toISOString().slice(11, 23)
}

while (true) {
  const { done, value: chunk } = await reader.read()
  if (done) break
  if (!chunk || !chunk.type) continue

  // Mastra wraps chunks in { type, runId, from, payload }
  const p = chunk.payload || chunk

  switch (chunk.type) {
    case 'text-delta': {
      const text = p.textDelta || chunk.textDelta || ''
      thinkBuf += text
      if (thinkBuf.length > 150) {
        console.log(`[${ts()}] 💭 ${thinkBuf.slice(0, 140)}...`)
        thinkBuf = ''
      }
      break
    }
    case 'tool-call': {
      if (thinkBuf) {
        console.log(`[${ts()}] 💭 ${thinkBuf.slice(0, 200)}`)
        thinkBuf = ''
      }
      const name = p.toolName || chunk.toolName || '?'
      const args = p.args || chunk.args || {}
      let label = name
      if (args.path) label += ` → ${args.path}`
      else if (args.query) label += ` → "${args.query}"`
      else if (args.packages) label += ` → ${args.packages}`
      else if (args.command) label += ` → ${String(args.command).slice(0, 50)}`
      else if (args.files) label += ` → ${args.files.length} files`
      else if (args.labels) label += ` → ${JSON.stringify(args.labels)}`
      console.log(`[${ts()}] 🔧 TOOL #${++toolCount}: ${label}`)
      break
    }
    case 'tool-result': {
      const name = p.toolName || chunk.toolName || '?'
      const result = p.result || chunk.result || {}
      const ok = result.success !== false && result.exitCode !== 1
      let detail = ''
      if (name === 'createSandbox' && result.sandboxId) {
        sandboxId = result.sandboxId
        detail = ` [sandbox: ${sandboxId}]`
      } else if (name === 'runBuild') {
        detail = ok ? ' [BUILD PASSED]' : ` [BUILD FAILED: ${(result.output || '').slice(0, 100)}]`
      } else if (name === 'writeFile' || name === 'editFile') {
        detail = ` [${result.path || '?'} — ${result.bytesWritten || '?'} bytes]`
      } else if (name === 'writeFiles') {
        const paths = result.paths || []
        detail = paths.length
          ? ` [${paths.join(', ')}]`
          : ` [${result.filesWritten || '?'} files written]`
      } else if (result.error === true) {
        detail = ` [ERROR: ${String(result.message || '').slice(0, 80)}]`
      }
      toolTrace.push({ name, ok })
      console.log(`[${ts()}] ${ok ? '✅' : '❌'} RESULT: ${name}${detail}`)
      break
    }
    case 'step-finish': {
      const usage = p.usage || chunk.usage
      const finishReason = p.finishReason || chunk.finishReason || 'unknown'
      if (usage && usage.totalTokens) {
        totalTokens += usage.totalTokens
      }
      console.log(`[${ts()}] 📊 Step done — reason=${finishReason} tokens=${usage?.totalTokens ?? '?'} (total: ${totalTokens})`)
      break
    }
    case 'error': {
      const err = p.error || chunk.error || chunk
      console.error(`[${ts()}] ❌ ERROR: ${JSON.stringify(err).slice(0, 300)}`)
      break
    }
    case 'finish': {
      if (thinkBuf) console.log(`[${ts()}] 💭 ${thinkBuf.slice(0, 200)}`)
      console.log(`[${ts()}] 🏁 Stream finished — reason=${p.finishReason || 'unknown'}`)
      break
    }
  }
}

reader.releaseLock()

// Final usage
try {
  const usage = await streamOutput.usage
  if (usage && usage.totalTokens) totalTokens = usage.totalTokens
} catch {}

console.log('')
console.log('━━━ SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`Sandbox:      ${sandboxId || 'NONE'}`)
console.log(`Total tokens: ${totalTokens}`)
console.log(`Tool calls:   ${toolCount}`)
console.log(`  Succeeded:  ${toolTrace.filter(t => t.ok).length}`)
console.log(`  Failed:     ${toolTrace.filter(t => !t.ok).length}`)
console.log('Tool trace:')
for (const t of toolTrace) {
  console.log(`  ${t.ok ? '✅' : '❌'} ${t.name}`)
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
