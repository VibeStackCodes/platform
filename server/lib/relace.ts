/**
 * Relace Instant Apply API Client
 *
 * Sends edit snippets (abbreviated code with "// ... keep existing code" markers)
 * to Relace's apply model, which merges them into the full file at ~10k tok/s.
 *
 * API: POST https://instantapply.endpoint.relace.run/v1/code/apply
 * Pricing: ~$0.85/1M input, ~$1.25/1M output (trivial vs frontier model costs)
 */

const RELACE_API_URL = 'https://instantapply.endpoint.relace.run/v1/code/apply'
const RELACE_MODEL = 'relace-apply-3'

export interface RelaceInput {
  initialCode: string
  editSnippet: string
  instruction?: string
}

export interface RelaceUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface RelaceResult {
  mergedCode: string
  usage: RelaceUsage
}

/**
 * Apply an edit snippet to existing code using Relace Instant Apply.
 * The edit snippet can use "// ... keep existing code" markers for brevity.
 */
export async function applyEdit(input: RelaceInput): Promise<RelaceResult> {
  const apiKey = process.env.RELACE_API_KEY
  if (!apiKey) {
    throw new Error('RELACE_API_KEY environment variable is required')
  }

  const body: Record<string, unknown> = {
    model: RELACE_MODEL,
    initial_code: input.initialCode,
    edit_snippet: input.editSnippet,
    stream: false,
  }
  if (input.instruction) {
    body.instruction = input.instruction
  }

  const response = await fetch(RELACE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Relace API error ${response.status}: ${text}`)
  }

  const data = (await response.json()) as {
    mergedCode: string
    usage: RelaceUsage
  }

  return {
    mergedCode: data.mergedCode,
    usage: data.usage,
  }
}
