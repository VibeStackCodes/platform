import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { plannerAgent, dataArchitectAgent, frontendEngineerAgent, qaEngineerAgent } from './registry';
import {
  ClarifiedRequirementsSchema,
  ExecutionPlanSchema,
  DatabaseSchemaArtifactSchema,
  FrontendArtifactSchema,
  QAResultArtifactSchema,
} from './schemas';
import type {
  ClarifiedRequirements,
  DatabaseSchemaArtifact,
} from './schemas';
import type { StreamEvent } from '@/lib/types';
import { createSandboxTools } from './tools';
import type { Sandbox } from '@daytonaio/sdk';

/**
 * Workflow input/output schemas
 */
const WorkflowInputSchema = z.object({
  prompt: z.string().describe('User prompt describing the app'),
  projectId: z.string().describe('Project ID for tracing'),
});

const WorkflowOutputSchema = QAResultArtifactSchema;

/**
 * Create the generation workflow bound to an SSE emitter and optional sandbox.
 *
 * Created per-request because:
 * 1. Steps close over the emitter for SSE streaming
 * 2. QA step needs the sandbox reference for tool binding
 */
export function createGenerationWorkflow(
  emitEvent: (event: StreamEvent) => void,
  sandbox?: Sandbox,
) {
  // Step 1: Clarify Requirements
  const clarifyStep = createStep({
    id: 'clarify',
    inputSchema: WorkflowInputSchema,
    outputSchema: ClarifiedRequirementsSchema,
    execute: async ({ inputData }) => {
      const startTime = Date.now();
      emitEvent({ type: 'agent_start', agentId: 'planner', agentName: 'Planner', phase: 1 });

      const result = await plannerAgent.generate(
        `Extract structured requirements from the following user prompt. Default to sensible choices for any unspecified details.\n\nUser Prompt:\n${inputData.prompt}\n\nExtract: app name, description, target audience, features (with categories), constraints, and design preferences.`,
        { structuredOutput: { schema: ClarifiedRequirementsSchema } },
      );

      emitEvent({ type: 'agent_artifact', agentId: 'planner', artifactType: 'clarified-requirements', artifactName: 'Clarified Requirements' });
      emitEvent({ type: 'agent_complete', agentId: 'planner', tokensUsed: result.usage?.totalTokens ?? 0, durationMs: Date.now() - startTime });

      return result.object as ClarifiedRequirements;
    },
  });

  // Step 2: Generate Execution Plan
  const planStep = createStep({
    id: 'plan',
    inputSchema: ClarifiedRequirementsSchema,
    outputSchema: ClarifiedRequirementsSchema, // pass-through requirements
    execute: async ({ inputData }) => {
      const requirements = inputData;
      const startTime = Date.now();
      emitEvent({ type: 'agent_start', agentId: 'planner', agentName: 'Planner (Plan)', phase: 1 });

      const featureList = requirements.features
        .map((f: { category: string; name: string; description: string }, i: number) => `${i + 1}. [${f.category}] ${f.name}: ${f.description}`)
        .join('\n');

      const result = await plannerAgent.generate(
        `Generate an execution plan for "${requirements.appName}".\n\nDescription: ${requirements.appDescription}\nTarget Audience: ${requirements.targetAudience}\n\nFeatures:\n${featureList}\n\nDesign: ${requirements.designPreferences.style} style, ${requirements.designPreferences.primaryColor} color, ${requirements.designPreferences.fontFamily} font.\n\nCreate a plan with phases, agent assignments, estimated duration, and model rationale.`,
        { structuredOutput: { schema: ExecutionPlanSchema } },
      );

      emitEvent({ type: 'plan_ready', plan: result.object as Record<string, unknown> });
      emitEvent({ type: 'agent_complete', agentId: 'planner', tokensUsed: result.usage?.totalTokens ?? 0, durationMs: Date.now() - startTime });

      return requirements;
    },
  });

  // Step 3: Data Architect
  const dataArchitectStep = createStep({
    id: 'data-architect',
    inputSchema: ClarifiedRequirementsSchema,
    outputSchema: DatabaseSchemaArtifactSchema,
    execute: async ({ inputData }) => {
      const requirements = inputData;
      const startTime = Date.now();

      emitEvent({ type: 'phase_start', phase: 2, phaseName: 'Data Architecture', agentCount: 1 });
      emitEvent({ type: 'agent_start', agentId: 'data-architect', agentName: 'Data Architect', phase: 2 });

      const featureList = requirements.features
        .filter((f: { category: string }) => f.category === 'crud' || f.category === 'realtime' || f.category === 'auth')
        .map((f: { name: string; description: string }) => `- ${f.name}: ${f.description}`)
        .join('\n');

      const result = await dataArchitectAgent.generate(
        `Design a PostgreSQL database schema for "${requirements.appName}".\n\nDescription: ${requirements.appDescription}\n\nData Features:\n${featureList || '- No explicit data features (use minimal schema with users table)'}\n\nGenerate tables with uuid PKs, timestamptz timestamps, foreign keys, indices, RLS policies using auth.uid(), and a complete SQL migration script.`,
        { structuredOutput: { schema: DatabaseSchemaArtifactSchema } },
      );

      emitEvent({ type: 'agent_artifact', agentId: 'data-architect', artifactType: 'database-schema', artifactName: 'Database Schema' });
      emitEvent({ type: 'agent_complete', agentId: 'data-architect', tokensUsed: result.usage?.totalTokens ?? 0, durationMs: Date.now() - startTime });
      emitEvent({ type: 'phase_complete', phase: 2, phaseName: 'Data Architecture' });

      return result.object as DatabaseSchemaArtifact;
    },
  });

  // Step 4: Frontend Engineer
  const frontendStep = createStep({
    id: 'frontend-engineer',
    inputSchema: DatabaseSchemaArtifactSchema,
    outputSchema: FrontendArtifactSchema,
    execute: async ({ inputData, getStepResult }) => {
      const dbSchema = inputData;
      const requirements = getStepResult(clarifyStep) as ClarifiedRequirements;
      const startTime = Date.now();

      emitEvent({ type: 'phase_start', phase: 3, phaseName: 'Frontend Generation', agentCount: 1 });
      emitEvent({ type: 'agent_start', agentId: 'frontend-engineer', agentName: 'Frontend Engineer', phase: 3 });

      const schemaContext = `\nDatabase Tables:\n${dbSchema.tables.map((t: { name: string; columns: Array<{ name: string }> }) => `- ${t.name}: ${t.columns.map((c) => c.name).join(', ')}`).join('\n')}`;

      const featureList = requirements.features
        .map((f: { category: string; name: string; description: string }) => `- [${f.category}] ${f.name}: ${f.description}`)
        .join('\n');

      const result = await frontendEngineerAgent.generate(
        `Generate production-ready React 19 components for "${requirements.appName}".\n\nDescription: ${requirements.appDescription}\n${schemaContext}\n\nFeatures:\n${featureList}\n\nDesign: ${requirements.designPreferences.style} style, ${requirements.designPreferences.primaryColor} color, ${requirements.designPreferences.fontFamily} font.\n\nGenerate complete, type-safe components with Tailwind v4, Radix UI, and Supabase integration. Sort files by dependency layer.`,
        { structuredOutput: { schema: FrontendArtifactSchema } },
      );

      emitEvent({ type: 'agent_artifact', agentId: 'frontend-engineer', artifactType: 'frontend-code', artifactName: 'Frontend Components' });
      emitEvent({ type: 'agent_complete', agentId: 'frontend-engineer', tokensUsed: result.usage?.totalTokens ?? 0, durationMs: Date.now() - startTime });
      emitEvent({ type: 'phase_complete', phase: 3, phaseName: 'Frontend Generation' });

      return result.object;
    },
  });

  // Step 5: QA Engineer
  const qaStep = createStep({
    id: 'qa-engineer',
    inputSchema: FrontendArtifactSchema,
    outputSchema: QAResultArtifactSchema,
    execute: async ({ inputData }) => {
      const startTime = Date.now();

      emitEvent({ type: 'phase_start', phase: 4, phaseName: 'Build Verification & QA', agentCount: 1 });
      emitEvent({ type: 'agent_start', agentId: 'qa-engineer', agentName: 'QA Engineer', phase: 4 });

      const toolsObj = sandbox ? (() => {
        const t = createSandboxTools(sandbox);
        return { runBuild: t.runBuild, writeFile: t.writeFile, readFile: t.readFile };
      })() : {};

      const fileList = inputData.generatedFiles
        .map((f: { path: string; layer: number }) => `- ${f.path} (layer ${f.layer})`)
        .join('\n');

      const result = await qaEngineerAgent.generate(
        `Verify the build for the generated application.\n\nGenerated files:\n${fileList}\n\nRun the build tool, analyze any errors, and apply minimal fixes. Iterate up to 3 times.`,
        {
          structuredOutput: { schema: QAResultArtifactSchema },
          ...(Object.keys(toolsObj).length > 0 ? { tools: toolsObj } : {}),
        },
      );

      emitEvent({ type: 'agent_artifact', agentId: 'qa-engineer', artifactType: 'qa-result', artifactName: 'QA Report' });
      emitEvent({ type: 'agent_complete', agentId: 'qa-engineer', tokensUsed: result.usage?.totalTokens ?? 0, durationMs: Date.now() - startTime });
      emitEvent({ type: 'phase_complete', phase: 4, phaseName: 'Build Verification & QA' });

      return result.object;
    },
  });

  // Assemble workflow
  return createWorkflow({
    id: 'app-generation',
    inputSchema: WorkflowInputSchema,
    outputSchema: WorkflowOutputSchema,
  })
    .then(clarifyStep)
    .then(planStep)
    .then(dataArchitectStep)
    .then(frontendStep)
    .then(qaStep)
    .commit();
}
