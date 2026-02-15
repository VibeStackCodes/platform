/**
 * Mastra entry point — required by `mastra dev` (Studio) and `mastra build` (Cloud).
 *
 * Agents are defined in lib/agents/registry.ts and re-exported here so
 * the Mastra CLI discovers them at the conventional src/mastra/index.ts path.
 */
export { mastra } from '../../lib/agents/registry';
