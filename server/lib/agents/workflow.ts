import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { AnalystPlanSchema, createAnalyst } from './analyst'
import { createOrchestrator } from './orchestrator'
import { MODEL_CONFIGS, type ProviderType } from './provider'

// Lazy import to break circular dependency: workflow.ts ↔ mastra.ts
// (mastra.ts imports generationWorkflow, workflow.ts needs mastra for __registerMastra)
async function getMastra() {
  const { mastra } = await import('./mastra')
  return mastra
}
import { getLangfuseClient } from './langfuse-client'
import type { AgentStreamEvent } from '../types'

// ---------------------------------------------------------------------------
// Step 1: Analyst — produce a structured plan from the user message
// ---------------------------------------------------------------------------

export const analystStep = createStep({
  id: 'analyst',
  inputSchema: z.object({
    message: z.string(),
    projectId: z.string(),
    userId: z.string(),
    model: z.string(),
  }),
  outputSchema: z.object({
    plan: AnalystPlanSchema,
    totalTokens: z.number(),
  }),
  execute: async ({ inputData, requestContext, abortSignal, outputWriter }) => {
    const agent = createAnalyst()
    agent.__registerMastra(await getMastra())

    if (outputWriter) {
      // biome-ignore lint/suspicious/noExplicitAny: AgentStreamEvent chunk shape
      await outputWriter({ type: 'thinking', content: 'Analyzing your requirements\u2026' } as any)
    }

    const result = await agent.generate(inputData.message, {
      requestContext,
      memory: {
        thread: inputData.projectId,
        resource: inputData.userId,
      },
      maxSteps: 1,
      abortSignal,
      structuredOutput: { schema: AnalystPlanSchema },
    })

    let plan: z.infer<typeof AnalystPlanSchema>
    try {
      // biome-ignore lint/suspicious/noExplicitAny: Mastra generate result generics
      plan = AnalystPlanSchema.parse((result as any).object)
    } catch {
      plan = {
        projectName: 'My App',
        features: [
          { name: 'Core UI', description: 'Main application interface and layout' },
          { name: 'Data Management', description: 'Create, read, update, and delete records' },
          { name: 'User Experience', description: 'Responsive design, accessibility, and polish' },
        ],
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: Mastra usage shape varies by provider
    const totalTokens = (result as any).usage?.totalTokens ?? 0

    return { plan, totalTokens }
  },
})

// ---------------------------------------------------------------------------
// Step 2: Approve Plan — suspend for HITL approval, resume with decision
// ---------------------------------------------------------------------------

export const approvePlanStep = createStep({
  id: 'approve-plan',
  inputSchema: z.object({
    plan: AnalystPlanSchema,
    totalTokens: z.number(),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    plan: AnalystPlanSchema,
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    feedback: z.string().optional(),
  }),
  suspendSchema: z.object({
    plan: AnalystPlanSchema,
  }),
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    if (resumeData?.approved === false) {
      return bail({ approved: false, plan: inputData.plan })
    }

    if (resumeData?.approved === true) {
      return { approved: true, plan: inputData.plan }
    }

    return await suspend({ plan: inputData.plan })
  },
})

// ---------------------------------------------------------------------------
// Step 3: Build — orchestrator builds the app according to the approved plan
// ---------------------------------------------------------------------------

export const buildStep = createStep({
  id: 'build',
  inputSchema: z.object({
    approved: z.boolean(),
    plan: AnalystPlanSchema,
  }),
  outputSchema: z.object({
    summary: z.string(),
    success: z.boolean(),
    sandboxId: z.string().optional(),
    totalTokens: z.number(),
    openaiResponseId: z.string().optional(),
  }),
  execute: async ({ inputData, requestContext, abortSignal, outputWriter }) => {
    const model = (requestContext?.get('selectedModel') as string) ?? 'gpt-5.2-codex'
    const provider = (MODEL_CONFIGS[model]?.provider ?? 'openai') as ProviderType

    let systemPrompt: string | undefined
    const langfuse = getLangfuseClient()
    if (langfuse) {
      try {
        const prompt = await langfuse.prompt.get('orchestrator-system-prompt', {
          type: 'text',
          label: 'production',
          cacheTtlSeconds: 300,
          fetchTimeoutMs: 5000,
        })
        systemPrompt = prompt.compile({})
      } catch {
        // Langfuse prompt fetch failed — fall back to hardcoded prompt
      }
    }

    const agent = createOrchestrator(provider, systemPrompt)
    agent.__registerMastra(await getMastra())

    const planPrompt =
      'Build the app according to this plan:\n' +
      inputData.plan.features.map((f) => '- ' + f.name + ': ' + f.description).join('\n')

    const projectId = requestContext?.get('projectId') as string | undefined
    const userId = requestContext?.get('userId') as string | undefined
    const previousResponseId = requestContext?.get('previousResponseId') as string | undefined

    // biome-ignore lint/suspicious/noExplicitAny: Mastra stream options generics
    const streamOptions: any = {
      requestContext,
      memory: {
        thread: projectId,
        resource: userId,
      },
      maxSteps: 50,
      savePerStep: true,
      abortSignal,
      structuredOutput: {
        schema: z.object({
          summary: z.string().describe('One-line summary of what was built or changed'),
        }),
      },
    }

    if (previousResponseId) {
      streamOptions.providerOptions = { openai: { previousResponseId } }
    }

    // biome-ignore lint/suspicious/noExplicitAny: Mastra stream return type is complex
    const streamOutput: any = await agent.stream(planPrompt, streamOptions)

    // Pipe all fullStream chunks through outputWriter so the route handler
    // can bridge them to SSE events as AgentStreamEvent | CreditsUsedEvent.
    const reader = streamOutput.fullStream.getReader()
    try {
      while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) break
        if (abortSignal.aborted) break
        if (chunk && outputWriter) {
          await outputWriter(chunk as AgentStreamEvent)
        }
      }
    } finally {
      reader.releaseLock()
    }

    let totalTokens = 0
    try {
      const usage = await streamOutput.usage
      if (usage?.totalTokens) totalTokens = usage.totalTokens
    } catch {
      // usage not available — leave as 0
    }

    let summary = 'App built successfully.'
    try {
      const output = await streamOutput.object
      if (output?.summary) summary = output.summary
    } catch {
      try {
        const text = await streamOutput.text
        if (text) {
          const sentences = text.split(/[.!]\s/)
          summary = sentences[sentences.length - 1]?.trim() || summary
        }
      } catch {
        // summary extraction failed — use default
      }
    }

    return { summary, success: true, totalTokens }
  },
})

// ---------------------------------------------------------------------------
// Workflow definition
// ---------------------------------------------------------------------------

export const generationWorkflow = createWorkflow({
  id: 'generation',
  inputSchema: z.object({
    message: z.string(),
    projectId: z.string(),
    userId: z.string(),
    model: z.string(),
  }),
  outputSchema: z.object({
    summary: z.string(),
    success: z.boolean(),
    sandboxId: z.string().optional(),
    totalTokens: z.number(),
    openaiResponseId: z.string().optional(),
  }),
})
  // eslint-disable-next-line unicorn/no-thenable -- Mastra workflow chaining API, not Promise
  .then(analystStep)
  // eslint-disable-next-line unicorn/no-thenable -- Mastra workflow chaining API
  .then(approvePlanStep)
  // eslint-disable-next-line unicorn/no-thenable -- Mastra workflow chaining API
  .then(buildStep)

generationWorkflow.commit()
