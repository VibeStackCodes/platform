/**
 * VibeStack Shared Types
 * Core type definitions for the generation pipeline
 */

// ============================================================================
// Requirements & Specifications
// ============================================================================

export type RequirementCategory = 'auth' | 'crud' | 'realtime' | 'ui' | 'integration' | 'navigation'

export interface Requirement {
  id: string
  description: string
  category: RequirementCategory
  verifiable: boolean
}

export interface FileSpec {
  path: string
  description: string
  layer: number
  dependsOn: string[]
  requirements: string[]
  skills: string[]
}

// ============================================================================
// Supabase Schema
// ============================================================================

export interface SupabaseSchema {
  migrationSQL: string
  seedSQL: string | null
  rls: string
  storageBuckets: string[]
  realtimeTables: string[]
}

// ============================================================================
// Design & Dependencies
// ============================================================================

export interface DesignTokens {
  primaryColor: string
  accentColor: string
  fontFamily: string
  spacing: 'compact' | 'comfortable' | 'spacious'
  borderRadius: 'none' | 'small' | 'medium' | 'large'
}

export interface PackageDependencies {
  [packageName: string]: string
}

// ============================================================================
// ChatPlan (lightweight plan from chat AI → template pipeline)
// ============================================================================

export type FeatureCategory = 'auth' | 'crud' | 'realtime' | 'dashboard' | 'messaging' | 'ui'

export interface EntityField {
  name: string
  type: 'text' | 'number' | 'boolean' | 'enum' | 'uuid' | 'timestamp' | 'json'
  required: boolean
  enumValues?: string[]
}

export interface EntitySpec {
  name: string
  fields: EntityField[]
  belongsTo?: string[]
}

export interface FeatureSpec {
  description: string
  category: FeatureCategory
  entity?: EntitySpec
}

export interface ChatPlan {
  appName: string
  appDescription: string
  features: FeatureSpec[]
  designTokens: DesignTokens
  shadcnComponents: string[]
}

// ============================================================================
// Plan (full technical plan, expanded server-side)
// ============================================================================

export interface Plan {
  appName: string
  appDescription: string
  requirements: Requirement[]
  files: FileSpec[]
  supabase: SupabaseSchema
  designTokens: DesignTokens
  packageDeps: PackageDependencies
}

// ============================================================================
// File & Stage Status
// ============================================================================

export type FileStatus = 'pending' | 'generating' | 'complete' | 'error' | 'fixing'

export type StageStatus =
  | 'idle'
  | 'planning'
  | 'provisioning'
  | 'generating'
  | 'verifying_build'
  | 'verifying_requirements'
  | 'complete'
  | 'error'

export interface FileProgress {
  path: string
  status: FileStatus
  content?: string
  error?: string
  retryCount: number
  linesOfCode: number
}

// ============================================================================
// Build Errors & Verification
// ============================================================================

export interface BuildError {
  file: string
  line?: number
  message: string
  raw: string
}

export interface RequirementResult {
  requirementId: string
  passed: boolean
  evidence: string
  fixAttempted: boolean
}

// ============================================================================
// Generation State
// ============================================================================

export interface GenerationURLs {
  preview?: string
  codeServer?: string
  deploy?: string
}

export interface GenerationTimestamps {
  startedAt: string
  planCompletedAt?: string
  provisioningCompletedAt?: string
  generationCompletedAt?: string
  buildVerifiedAt?: string
  requirementsVerifiedAt?: string
  completedAt?: string
}

export interface GenerationState {
  projectId: string
  stage: StageStatus
  plan?: Plan
  files: FileProgress[]
  urls: GenerationURLs
  buildErrors: BuildError[]
  requirementResults: RequirementResult[]
  timestamps: GenerationTimestamps
}

// ============================================================================
// Supabase Project (from Management API)
// ============================================================================

export interface SupabaseProject {
  id: string
  name: string
  orgId: string
  region: string
  dbHost: string
  dbPassword: string
  anonKey: string
  serviceRoleKey: string
  url: string
}

// ============================================================================
// Platform Database Types
// ============================================================================

export type ProjectStatus =
  | 'pending'
  | 'planning'
  | 'generating'
  | 'verifying'
  | 'complete'
  | 'error'
  | 'deploying'
  | 'deployed'

export interface Project {
  id: string
  user_id: string
  name: string
  prompt: string
  description: string | null
  status: ProjectStatus
  plan: Plan | null
  generation_state: GenerationState | null
  sandbox_id: string | null
  supabase_project_id: string | null
  preview_url: string | null
  code_server_url: string | null
  deploy_url: string | null
  supabase_url: string | null
  model: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// Billing & Credits
// ============================================================================

export interface UserCredits {
  credits_remaining: number
  credits_monthly: number
  credits_reset_at: string | null
  plan: 'free' | 'pro'
}

export interface UsageEvent {
  id: string
  user_id: string
  project_id: string | null
  event_type: 'chat' | 'generation'
  model: string
  tokens_input: number
  tokens_output: number
  tokens_total: number
  credits_used: number
  stripe_meter_event_id: string | null
  created_at: string
}

// ============================================================================
// API Request Types
// ============================================================================

export interface EditRequest {
  projectId: string
  instruction: string
  model?: string
}

export interface DeployRequest {
  projectId: string
  vercelTeamId?: string
}

// ============================================================================
// SSE Stream Events (discriminated union)
// ============================================================================

export type StreamEvent =
  | StageUpdateEvent
  | FileStartEvent
  | FileChunkEvent
  | FileCompleteEvent
  | FileErrorEvent
  | BuildErrorEvent
  | BuildFixEvent
  | RequirementResultEvent
  | PreviewReadyEvent
  | CodeServerReadyEvent
  | CompleteEvent
  | ErrorEvent
  | CheckpointEvent
  | LayerCommitEvent
  | AgentStartEvent
  | AgentProgressEvent
  | AgentArtifactEvent
  | AgentCompleteEvent
  | PhaseStartEvent
  | PhaseCompleteEvent
  | PlanReadyEvent
  | CreditsUsedEvent
  | ClarificationRequestEvent

export interface StageUpdateEvent {
  type: 'stage_update'
  stage: StageStatus
}

export interface FileStartEvent {
  type: 'file_start'
  path: string
  layer: number
}

export interface FileChunkEvent {
  type: 'file_chunk'
  path: string
  chunk: string
}

export interface FileCompleteEvent {
  type: 'file_complete'
  path: string
  linesOfCode: number
}

export interface FileErrorEvent {
  type: 'file_error'
  path: string
  error: string
}

export interface BuildErrorEvent {
  type: 'build_error'
  errors: BuildError[]
}

export interface BuildFixEvent {
  type: 'build_fix'
  file: string
  attempt: number
}

export interface RequirementResultEvent {
  type: 'requirement_result'
  result: RequirementResult
}

export interface PreviewReadyEvent {
  type: 'preview_ready'
  url: string
}

export interface CodeServerReadyEvent {
  type: 'code_server_ready'
  url: string
}

export interface CompleteEvent {
  type: 'complete'
  projectId: string
  urls: GenerationURLs
  requirementResults: RequirementResult[]
}

export interface ErrorEvent {
  type: 'error'
  message: string
  stage: StageStatus
}

export interface CheckpointEvent {
  type: 'checkpoint'
  label: string
  status: 'active' | 'complete'
}

export interface LayerCommitEvent {
  type: 'layer_commit'
  layer: number
  hash: string
  message: string
  files: string[]
}

// ============================================================================
// Agent Pipeline Events
// ============================================================================

export interface AgentStartEvent {
  type: 'agent_start'
  agentId: string
  agentName: string
  phase: number
}

export interface AgentProgressEvent {
  type: 'agent_progress'
  agentId: string
  message: string
}

export interface AgentArtifactEvent {
  type: 'agent_artifact'
  agentId: string
  artifactType: string
  artifactName: string
}

export interface AgentCompleteEvent {
  type: 'agent_complete'
  agentId: string
  tokensUsed: number
  durationMs: number
}

export interface CreditsUsedEvent {
  type: 'credits_used'
  creditsUsed: number
  creditsRemaining: number
  tokensTotal: number
}

export interface PhaseStartEvent {
  type: 'phase_start'
  phase: number
  phaseName: string
  agentCount: number
}

export interface PhaseCompleteEvent {
  type: 'phase_complete'
  phase: number
  phaseName: string
}

export interface PlanReadyEvent {
  type: 'plan_ready'
  plan: Record<string, unknown>
}

export interface ClarificationQuestion {
  question: string
  selectionMode: 'single' | 'multiple'
  options: Array<{ label: string; description: string }>
}

export interface ClarificationRequestEvent {
  type: 'clarification_request'
  questions: ClarificationQuestion[]
}
