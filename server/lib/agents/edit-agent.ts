import { generateText } from 'ai'
import { getSandbox, downloadFile, uploadFile } from '../sandbox'
import { createHeliconeProvider } from './provider'
import type { ElementContext } from './edit-machine'
import type { SchemaContract } from '../schema-contract'

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
  contract: SchemaContract | null
  conversationHistory: ChatMessage[]
}): Promise<LLMEditResult> {
  // Read the target file from sandbox
  const sandbox = await getSandbox(input.sandboxId)
  const fileBuffer = await downloadFile(sandbox, `/workspace/${input.targetFile}`)
  const fileContent = fileBuffer.toString('utf-8')

  // Build system prompt
  const systemPrompt = `You are editing a single file in an existing React + Tailwind + Supabase application.

Rules:
- Make MINIMAL changes to fulfill the request
- Preserve ALL existing functionality
- Keep ALL existing imports, hooks, and component structure
- Return the COMPLETE modified file content
- Do NOT add comments like "// modified" or "// changed"
- Do NOT remove existing code unless explicitly asked
- Use Tailwind CSS classes for styling
- Use shadcn/ui components when adding UI elements
- If adding data fetching, use TanStack Query hooks
- If the file already has Supabase client setup, reuse it

Important:
- Your response should be ONLY the complete file content
- Do NOT wrap in markdown code fences
- Do NOT add explanations or commentary
- The file must be syntactically valid TypeScript/TSX`

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
    parts.push(`- Location: ${input.targetElement.vsId}`)
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

  if (input.contract?.tables && input.contract.tables.length > 0) {
    parts.push(`\n## Database Schema (for reference if adding data-driven features)`)
    parts.push('```json')
    parts.push(
      JSON.stringify(
        input.contract.tables.map((t) => ({
          name: t.name,
          columns: t.columns?.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable })),
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

  // Call the LLM using the AI SDK's generateText
  const model = createHeliconeProvider({
    userId: 'edit-agent',
    agentName: 'edit',
  })('gpt-4o')

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: parts.join('\n'),
    temperature: 0.2, // Low temperature for consistent code edits
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
    tokensUsed: result.usage?.totalTokens ?? 0,
  }
}
