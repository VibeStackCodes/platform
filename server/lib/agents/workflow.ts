import { createWorkflow, createStep } from '@mastra/core/workflows'
import { z } from 'zod'
import { AnalystPlanSchema, createAnalyst } from './analyst'
import { createDesigner, DesignTokensSchema } from './designer'
import { rankTemplates } from './templates'
import { createOrchestrator } from './orchestrator'
import { MODEL_CONFIGS, type ProviderType } from './provider'
import type { AgentStreamEvent, DesignAgentTokens } from '../types'

// Lazy import to break circular dependency: workflow.ts ↔ mastra.ts
// (mastra.ts imports generationWorkflow, workflow.ts needs mastra for __registerMastra)
async function getMastra() {
  const { mastra } = await import('./mastra')
  return mastra
}
import { getLangfuseClient } from './langfuse-client'

// ---------------------------------------------------------------------------
// Inline Zod schemas for step I/O (Mastra steps require Zod objects)
// ---------------------------------------------------------------------------

const PageSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
})

const DesignAgentTokensSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    foreground: z.string(),
    muted: z.string(),
    card: z.string(),
    destructive: z.string(),
  }),
  fonts: z.object({
    display: z.string(),
    body: z.string(),
    googleFontsUrl: z.string(),
  }),
  style: z.object({
    borderRadius: z.string(),
    cardStyle: z.string(),
    navStyle: z.string(),
    heroLayout: z.string(),
    spacing: z.string(),
    motion: z.string(),
    imagery: z.string(),
    sections: z.array(PageSectionSchema),
    contentWidth: z.enum(['narrow', 'standard', 'wide']),
  }),
})

const TemplatePresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['saas', 'portfolio', 'ecommerce', 'blog', 'dashboard', 'landing']),
  description: z.string(),
  screenshotUrl: z.string(),
  repoPath: z.string(),
  tokens: DesignAgentTokensSchema,
})

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

    // biome-ignore lint/suspicious/noExplicitAny: Mastra stream return type is complex
    const streamOutput: any = await agent.stream(inputData.message, {
      requestContext,
      maxSteps: 3,
      abortSignal,
      structuredOutput: { schema: AnalystPlanSchema },
    })

    // Pipe fullStream chunks through outputWriter so the route handler
    // can bridge them to SSE (tool_start, tool_complete, text-delta, etc.)
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

    // After fullStream is consumed, await the structured object
    // biome-ignore lint/suspicious/noExplicitAny: Mastra stream result generics
    const obj = await streamOutput.object
    const plan = AnalystPlanSchema.parse(obj)

    // Strip any source citations the LLM embedded (e.g. "([todoist.com](https://...))")
    const stripCitations = (s: string) =>
      s.replace(/\s*\(\[.*?\]\(https?:\/\/[^)]*\)\)/g, '').trim()
    plan.projectName = stripCitations(plan.projectName)
    for (const feature of plan.features) {
      feature.description = stripCitations(feature.description)
      feature.name = stripCitations(feature.name)
    }

    let totalTokens = 0
    try {
      const usage = await streamOutput.usage
      if (usage?.totalTokens) totalTokens = usage.totalTokens
    } catch {
      // usage not available
    }

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
// Step 3: Design — generate a visual design token system for the app
// ---------------------------------------------------------------------------

export const designStep = createStep({
  id: 'design',
  inputSchema: z.object({
    approved: z.boolean(),
    plan: AnalystPlanSchema,
  }),
  outputSchema: z.object({
    plan: AnalystPlanSchema,
    tokens: DesignAgentTokensSchema,
    recommendedTemplates: z.array(TemplatePresetSchema),
  }),
  execute: async ({ inputData, requestContext, abortSignal, outputWriter }) => {
    const agent = createDesigner()
    agent.__registerMastra(await getMastra())

    // Format plan as prompt for designer
    const planPrompt = `Design a visual system for this app:\n\nApp: ${inputData.plan.projectName}\nFeatures:\n${inputData.plan.features.map((f) => '- ' + f.name + ': ' + f.description).join('\n')}`

    // biome-ignore lint/suspicious/noExplicitAny: Mastra stream return type is complex
    const streamOutput: any = await agent.stream(planPrompt, {
      requestContext,
      maxSteps: 3,
      abortSignal,
      structuredOutput: { schema: DesignTokensSchema },
    })

    // Pipe fullStream chunks through outputWriter (same pattern as analystStep)
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

    // biome-ignore lint/suspicious/noExplicitAny: Mastra stream result generics
    const obj = await streamOutput.object
    const tokens = DesignTokensSchema.parse(obj)

    // Convert DesignTokensOutput to DesignAgentTokens (strip category)
    const designTokens: DesignAgentTokens = {
      colors: tokens.colors,
      fonts: tokens.fonts,
      style: tokens.style,
    }

    // Rank templates against generated tokens
    const recommended = rankTemplates(designTokens, tokens.category)

    return {
      plan: inputData.plan,
      tokens: designTokens,
      recommendedTemplates: recommended,
    }
  },
})

// ---------------------------------------------------------------------------
// Step 4: Approve Design — suspend for HITL design approval
// ---------------------------------------------------------------------------

export const approveDesignStep = createStep({
  id: 'approve-design',
  inputSchema: z.object({
    plan: AnalystPlanSchema,
    tokens: DesignAgentTokensSchema,
    recommendedTemplates: z.array(TemplatePresetSchema),
  }),
  outputSchema: z.object({
    plan: AnalystPlanSchema,
    tokens: DesignAgentTokensSchema,
    selectedTemplateId: z.string().optional(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    selectedTemplateId: z.string().optional(),
    customTokens: DesignAgentTokensSchema.optional(),
  }),
  suspendSchema: z.object({
    tokens: DesignAgentTokensSchema,
    recommendedTemplates: z.array(TemplatePresetSchema),
  }),
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    if (resumeData?.approved === false) {
      return bail({
        plan: inputData.plan,
        tokens: inputData.tokens,
      })
    }

    if (resumeData?.approved === true) {
      return {
        plan: inputData.plan,
        tokens: resumeData.customTokens ?? inputData.tokens,
        selectedTemplateId: resumeData.selectedTemplateId,
      }
    }

    return await suspend({
      tokens: inputData.tokens,
      recommendedTemplates: inputData.recommendedTemplates,
    })
  },
})

// ---------------------------------------------------------------------------
// Step 5: Build — orchestrator builds the app according to the approved plan
// ---------------------------------------------------------------------------

export const buildStep = createStep({
  id: 'build',
  inputSchema: z.object({
    plan: AnalystPlanSchema,
    tokens: DesignAgentTokensSchema,
    selectedTemplateId: z.string().optional(),
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

    const tokens = inputData.tokens
    const planPrompt =
      'Build the app according to this plan:\n' +
      inputData.plan.features.map((f) => '- ' + f.name + ': ' + f.description).join('\n') +
      '\n\n## Design System\n' +
      `Colors (oklch): primary: ${tokens.colors.primary}, secondary: ${tokens.colors.secondary}, accent: ${tokens.colors.accent}, background: ${tokens.colors.background}, foreground: ${tokens.colors.foreground}, muted: ${tokens.colors.muted}, card: ${tokens.colors.card}, destructive: ${tokens.colors.destructive}\n` +
      `Fonts: Display: "${tokens.fonts.display}", Body: "${tokens.fonts.body}"\n` +
      `Google Fonts URL: ${tokens.fonts.googleFontsUrl}\n` +
      `Style: border-radius: ${tokens.style.borderRadius}, card: ${tokens.style.cardStyle}, nav: ${tokens.style.navStyle}, hero: ${tokens.style.heroLayout}, spacing: ${tokens.style.spacing}, motion: ${tokens.style.motion}\n` +
      `Page Sections: ${tokens.style.sections.map((s) => s.id).join(', ')}\n` +
      `Content Width: ${tokens.style.contentWidth}` +
      (inputData.selectedTemplateId
        ? `\n\nThis app was started from the "${inputData.selectedTemplateId}" template. Customize it based on the user's plan. Modify content, add features, and apply the approved design tokens.`
        : '')

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
  .then(designStep)
  // eslint-disable-next-line unicorn/no-thenable -- Mastra workflow chaining API
  .then(approveDesignStep)
  // eslint-disable-next-line unicorn/no-thenable -- Mastra workflow chaining API
  .then(buildStep)

generationWorkflow.commit()
