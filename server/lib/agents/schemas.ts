import { z } from 'zod'

/**
 * Agent output schemas — contract definitions for each specialist agent.
 *
 * IMPORTANT: These schemas are NOT wired as `structuredOutput` on agents within
 * the supervisor network. In a Mastra Agent Network, the supervisor reads
 * freeform text from sub-agents to decide routing. Adding structuredOutput
 * would force JSON responses that break supervisor reasoning.
 *
 * These schemas serve as:
 * 1. Documentation of expected agent output shapes
 * 2. Contracts for standalone `.generate()` calls outside the network
 * 3. Validation schemas for post-processing agent outputs
 */

/**
 * Feature schema for requirements clarification
 */
const FeatureSchema = z.object({
  name: z.string().describe('Feature name'),
  description: z.string().describe('Detailed feature description'),
  category: z
    .enum(['auth', 'crud', 'dashboard', 'messaging', 'realtime', 'custom'])
    .describe('Feature category'),
})

/**
 * Design preferences for styling
 */
const DesignPreferencesSchema = z.object({
  style: z.string().default('modern').describe('Design style (e.g., modern, minimal, playful)'),
  primaryColor: z.string().default('#3b82f6').describe('Primary color (hex code)'),
  fontFamily: z.string().default('Inter').describe('Font family'),
})

/**
 * Clarified requirements output from planner agent
 */
export const ClarifiedRequirementsSchema = z.object({
  appName: z.string().describe('Application name'),
  appDescription: z.string().describe('Application description'),
  targetAudience: z.string().describe('Target audience'),
  features: z.array(FeatureSchema).describe('List of features to implement'),
  constraints: z.array(z.string()).default([]).describe('Technical constraints'),
  designPreferences: DesignPreferencesSchema.describe('Design preferences'),
})

export type ClarifiedRequirements = z.infer<typeof ClarifiedRequirementsSchema>

/**
 * Phase definition for execution plan
 */
const PhaseSchema = z.object({
  name: z.string().describe('Phase name'),
  agents: z.array(z.string()).describe('Agent IDs participating in this phase'),
  description: z.string().describe('Phase description'),
})

/**
 * Agent assignment with model selection rationale
 */
const AgentAssignmentSchema = z.object({
  model: z.string().describe('Model ID (e.g., claude-sonnet-4-5-20250929)'),
  rationale: z.string().describe('Why this model tier was chosen'),
})

/**
 * Execution plan output from planner agent
 */
export const ExecutionPlanSchema = z.object({
  phases: z.array(PhaseSchema).describe('Execution phases'),
  estimatedDuration: z.string().describe('Estimated duration (e.g., "2-3 minutes")'),
  agentAssignments: z
    .record(z.string(), AgentAssignmentSchema)
    .describe('Agent ID to model assignment'),
})

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>

/**
 * Column definition for database schema
 */
const ColumnSchema = z.object({
  name: z.string().describe('Column name'),
  type: z.string().describe('PostgreSQL data type'),
  nullable: z.boolean().optional().describe('Whether column is nullable'),
  primaryKey: z.boolean().optional().describe('Whether column is primary key'),
  references: z
    .object({
      table: z.string().describe('Referenced table name'),
      column: z.string().describe('Referenced column name'),
    })
    .optional()
    .describe('Foreign key reference'),
})

/**
 * Index definition for database schema
 */
const IndexSchema = z.object({
  name: z.string().describe('Index name'),
  columns: z.array(z.string()).describe('Columns in index'),
  unique: z.boolean().default(false).describe('Whether index is unique'),
})

/**
 * Table definition for database schema
 */
const TableSchema = z.object({
  name: z.string().describe('Table name'),
  columns: z.array(ColumnSchema).describe('Table columns'),
  indices: z.array(IndexSchema).default([]).describe('Table indices'),
})

/**
 * Database schema artifact output from data architect agent
 */
export const DatabaseSchemaArtifactSchema = z.object({
  tables: z.array(TableSchema).describe('Database tables'),
  migrationSQL: z.string().describe('Complete SQL migration script'),
})

export type DatabaseSchemaArtifact = z.infer<typeof DatabaseSchemaArtifactSchema>

/**
 * Generated file metadata
 */
const GeneratedFileSchema = z.object({
  path: z.string().describe('File path relative to project root'),
  content: z.string().describe('File content'),
  layer: z.number().describe('Dependency layer (0 = no deps, 1 = depends on 0, etc.)'),
})

/**
 * Component manifest entry
 */
const ComponentManifestEntrySchema = z.object({
  name: z.string().describe('Component name'),
  path: z.string().describe('File path'),
  props: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        optional: z.boolean().default(false),
      }),
    )
    .default([])
    .describe('Component props'),
})

/**
 * Frontend artifact output from frontend engineer agent
 */
export const FrontendArtifactSchema = z.object({
  generatedFiles: z
    .array(GeneratedFileSchema)
    .describe('Generated files sorted by dependency layer'),
  componentManifest: z
    .array(ComponentManifestEntrySchema)
    .describe('Component manifest for reference'),
})

export type FrontendArtifact = z.infer<typeof FrontendArtifactSchema>

/**
 * Build error
 */
const BuildErrorSchema = z.object({
  file: z.string().describe('File path'),
  line: z.number().optional().describe('Line number'),
  message: z.string().describe('Error message'),
})

/**
 * Applied fix
 */
const AppliedFixSchema = z.object({
  file: z.string().describe('File path'),
  description: z.string().describe('Description of fix applied'),
})

/**
 * QA result artifact output from QA engineer agent
 */
export const QAResultArtifactSchema = z.object({
  buildPassed: z.boolean().describe('Whether build passed'),
  errors: z.array(BuildErrorSchema).describe('Build errors encountered'),
  fixesApplied: z.array(AppliedFixSchema).describe('Fixes applied'),
  attempts: z.number().describe('Number of build attempts'),
})

export type QAResultArtifact = z.infer<typeof QAResultArtifactSchema>

/**
 * Infrastructure provision result output from infra agent
 */
export const InfraProvisionResultSchema = z.object({
  sandboxId: z.string().describe('Daytona sandbox ID'),
  previewUrl: z.string().describe('Preview URL for the sandbox'),
  supabaseProjectId: z.string().describe('Generated Supabase project ID'),
  supabaseUrl: z.string().describe('Supabase project URL'),
  supabaseAnonKey: z.string().describe('Supabase anonymous key'),
})

export type InfraProvisionResult = z.infer<typeof InfraProvisionResultSchema>

/**
 * Review issue
 */
const ReviewIssueSchema = z.object({
  file: z.string().describe('File path'),
  line: z.number().optional().describe('Line number'),
  severity: z.enum(['error', 'warning', 'info']).describe('Issue severity'),
  message: z.string().describe('Issue description'),
})

/**
 * Code review result output from code reviewer agent
 */
export const CodeReviewResultSchema = z.object({
  filesReviewed: z.array(z.string()).describe('List of files reviewed'),
  issues: z.array(ReviewIssueSchema).describe('Issues found during review'),
  passed: z.boolean().describe('Whether code review passed'),
})

export type CodeReviewResult = z.infer<typeof CodeReviewResultSchema>

/**
 * Deployment result output from devops agent
 */
export const DeploymentResultSchema = z.object({
  repoUrl: z.string().describe('GitHub repository URL'),
  deploymentUrl: z.string().describe('Vercel deployment URL'),
  deploymentId: z.string().describe('Vercel deployment ID'),
  status: z.enum(['success', 'failed', 'pending']).describe('Deployment status'),
})

export type DeploymentResult = z.infer<typeof DeploymentResultSchema>

/**
 * Agent event discriminated union for SSE streaming
 */
export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('agent_start'),
    agentId: z.string().describe('Agent ID'),
    agentName: z.string().describe('Agent display name'),
    phase: z.number().describe('Phase number'),
  }),
  z.object({
    type: z.literal('agent_progress'),
    agentId: z.string().describe('Agent ID'),
    message: z.string().describe('Progress message'),
  }),
  z.object({
    type: z.literal('agent_artifact'),
    agentId: z.string().describe('Agent ID'),
    artifactType: z.string().describe('Artifact type (e.g., "clarified-requirements")'),
    artifactName: z.string().describe('Artifact name for display'),
  }),
  z.object({
    type: z.literal('agent_complete'),
    agentId: z.string().describe('Agent ID'),
    tokensUsed: z.number().describe('Tokens consumed'),
    durationMs: z.number().describe('Duration in milliseconds'),
  }),
  z.object({
    type: z.literal('phase_start'),
    phase: z.number().describe('Phase number'),
    phaseName: z.string().describe('Phase display name'),
    agentCount: z.number().describe('Number of agents in phase'),
  }),
  z.object({
    type: z.literal('phase_complete'),
    phase: z.number().describe('Phase number'),
    phaseName: z.string().describe('Phase display name'),
  }),
])

export type AgentEvent = z.infer<typeof AgentEventSchema>
