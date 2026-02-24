import { getSandbox, downloadFile, uploadFile } from '../sandbox'
import type { ElementContext } from './edit-machine'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface LLMEditResult {
  newContent: string
  tokensUsed: number
}

/**
 * Run an LLM-assisted edit on a single file
 *
 * This is Tier 2 editing — used when deterministic Tailwind patterns (Tier 1)
 * don't match. The LLM receives:
 * - Full file content
 * - Selected element context (tag, text, classes, location)
 * - User's edit request
 * - Recent conversation history
 * - Database schema (for reference when adding data-driven features)
 *
 * The LLM is instructed to make MINIMAL changes while preserving all existing
 * functionality. It returns the complete modified file content.
 */
export async function runLLMEdit(input: {
  sandboxId: string
  targetFile: string
  targetElement: ElementContext | null
  userMessage: string
  contract: Record<string, unknown> | null
  conversationHistory: ChatMessage[]
}): Promise<LLMEditResult> {
  // Read the target file from sandbox
  const sandbox = await getSandbox(input.sandboxId)
  const fileBuffer = await downloadFile(sandbox, `/workspace/${input.targetFile}`)
  const fileContent = fileBuffer.toString('utf-8')

  // Build user prompt with rich context
  const parts: string[] = []

  parts.push(`## Target File: ${input.targetFile}`)
  parts.push('```tsx')
  parts.push(fileContent)
  parts.push('```')

  if (input.targetElement) {
    parts.push(`\n## Selected Element`)
    parts.push(`- Tag: <${input.targetElement.tagName}>`)
    parts.push(`- Text: "${input.targetElement.textContent?.slice(0, 100) || '(no text)'}..."`)
    parts.push(`- Classes: ${input.targetElement.className || '(no classes)'}`)
    parts.push(`- Location: ${input.targetElement.fileName}:${input.targetElement.lineNumber}`)
    parts.push(
      `- Position: x=${input.targetElement.rect.x}, y=${input.targetElement.rect.y}, w=${input.targetElement.rect.width}, h=${input.targetElement.rect.height}`,
    )
  }

  parts.push(`\n## User Request\n${input.userMessage}`)

  if (input.conversationHistory.length > 0) {
    const recent = input.conversationHistory.slice(-6)
    parts.push(`\n## Recent Conversation (for context)`)
    for (const msg of recent) {
      parts.push(`${msg.role}: ${msg.content.slice(0, 200)}`)
    }
  }

  const contractTables = Array.isArray(input.contract?.['tables']) ? input.contract!['tables'] as Record<string, unknown>[] : []
  if (contractTables.length > 0) {
    parts.push(`\n## Database Schema (for reference if adding data-driven features)`)
    parts.push('```json')
    parts.push(
      JSON.stringify(
        contractTables.map((t) => ({
          name: t['name'],
          columns: Array.isArray(t['columns'])
            ? (t['columns'] as Record<string, unknown>[]).map((c) => ({ name: c['name'], type: c['type'], nullable: c['nullable'] }))
            : [],
        })),
        null,
        2,
      ),
    )
    parts.push('```')
  }

  parts.push(`\n## Instructions`)
  parts.push(
    `Return the COMPLETE modified file content. Do NOT use markdown code fences. Just raw TypeScript/TSX code.`,
  )

  // Use the Mastra editAgent (temperature 0.2 via defaultOptions in registry)
  const { editAgent } = await import('./registry')

  const result = await editAgent.generate(parts.join('\n'), {
    maxSteps: 1,
  })

  // Extract the file content from the response, stripping any code fences
  let newContent = result.text

  // Strip code fences if present (despite instructions, LLMs sometimes add them)
  const fenceMatch = newContent.match(/```(?:tsx?|jsx?|typescript|javascript)?\n([\s\S]*?)```/)
  if (fenceMatch) {
    newContent = fenceMatch[1]
  }

  // Ensure trailing newline
  if (!newContent.endsWith('\n')) {
    newContent += '\n'
  }

  // Write back to sandbox
  await uploadFile(sandbox, newContent, `/workspace/${input.targetFile}`)

  return {
    newContent,
    tokensUsed: result.totalUsage?.totalTokens ?? 0,
  }
}
