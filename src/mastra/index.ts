/**
 * Mastra entry point for `mastra dev` / `mastra build` / Mastra Cloud.
 *
 * Re-exports the Mastra instance from the server module.
 * The orchestrator agent is registered on the instance with default
 * OpenAI provider — stakeholders can test it via the Mastra playground.
 */
export { mastra } from '../../server/lib/agents/mastra'
