/**
 * Barrel export for Mastra agent system
 */

// Schemas (unchanged)
export * from './schemas';

// Agents + Mastra instance
export {
  mastra,
  plannerAgent,
  dataArchitectAgent,
  frontendEngineerAgent,
  qaEngineerAgent,
} from './registry';
export type { AgentId } from './registry';

// Tools
export { createSandboxTools } from './tools';

// Workflow
export { createGenerationWorkflow } from './workflow';
