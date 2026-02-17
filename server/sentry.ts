import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      // Auto-instrument OpenAI SDK calls (Mastra uses OpenAI under the hood)
      Sentry.openAIIntegration({ recordInputs: false, recordOutputs: false }),
      // Auto-instrument Anthropic SDK calls
      Sentry.anthropicAIIntegration({ recordInputs: false, recordOutputs: false }),
    ],
  })
}

/** Wrap a Mastra agent invocation in a Sentry span */
export function traceAgent(agentName: string, fn: () => Promise<unknown>) {
  return Sentry.startSpan(
    {
      op: 'gen_ai.invoke_agent',
      name: `Mastra agent: ${agentName}`,
      attributes: { 'gen_ai.agent.name': agentName },
    },
    fn,
  )
}

/** Wrap a Mastra tool execution in a Sentry span */
export function traceTool(toolName: string, fn: () => Promise<unknown>) {
  return Sentry.startSpan(
    {
      op: 'gen_ai.execute_tool',
      name: `Tool: ${toolName}`,
      attributes: { 'gen_ai.tool.name': toolName },
    },
    fn,
  )
}
