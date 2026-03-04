#!/usr/bin/env bun
/**
 * Seed the orchestrator system prompt into Langfuse Prompt Management.
 *
 * Usage:
 *   bun run langfuse:seed-prompt
 *
 * Requires LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY in .env.local
 * Creates a new version of 'orchestrator-system-prompt' with label 'production'.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })
import { LangfuseClient } from '@langfuse/client'
import { ORCHESTRATOR_PROMPT } from '../server/lib/agents/orchestrator'

const PROMPT_NAME = 'orchestrator-system-prompt'
const LABEL = 'production'

if (!ORCHESTRATOR_PROMPT) {
  console.error('ORCHESTRATOR_PROMPT is empty')
  process.exit(1)
}

const publicKey = process.env.LANGFUSE_PUBLIC_KEY
const secretKey = process.env.LANGFUSE_SECRET_KEY
if (!publicKey || !secretKey) {
  console.error('Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY in environment')
  process.exit(1)
}

const langfuse = new LangfuseClient({
  publicKey,
  secretKey,
  baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
})

console.log(`Creating prompt "${PROMPT_NAME}" (label: ${LABEL})...`)
console.log(`Prompt length: ${ORCHESTRATOR_PROMPT.length} characters`)

const result = await langfuse.prompt.create({
  name: PROMPT_NAME,
  type: 'text',
  prompt: ORCHESTRATOR_PROMPT,
  labels: [LABEL],
  tags: ['orchestrator', 'system-prompt'],
})

console.log(`Created version ${result.version} of "${PROMPT_NAME}"`)
console.log(
  `View at: ${process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com'}/prompts/${PROMPT_NAME}`,
)

await langfuse.shutdown()
