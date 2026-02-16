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

/** Run an LLM-assisted edit on a single file */
export async function runLLMEdit(_input: {
  sandboxId: string
  targetFile: string
  targetElement: ElementContext | null
  userMessage: string
  contract: SchemaContract | null
  conversationHistory: ChatMessage[]
}): Promise<LLMEditResult> {
  // Stub — will be implemented in Phase C
  throw new Error('LLM edit not yet implemented — coming in Phase C')
}
