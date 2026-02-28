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
  designTokens: DesignTokens
  packageDeps: PackageDependencies
}

// ============================================================================
// File & Stage Status
// ============================================================================

export type StageStatus =
  | 'idle'
  | 'planning'
  | 'provisioning'
  | 'generating'
  | 'verifying_build'
  | 'verifying_requirements'
  | 'complete'
  | 'error'

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

/**
 * Persisted generation state stored in projects.generation_state JSONB.
 * Contains data needed for iterative editing and deployment — NOT timeline/progress
 * events (those are persisted as chatMessages with typed event payloads).
 */
export interface GenerationState {
  blueprint?: unknown
  sandboxId?: string
  githubRepo?: string | null
  fileManifest?: Record<string, string>
  appName?: string
  appDescription?: string
  tokens?: unknown
  creativeSpec?: unknown
  generationStatus?: string
  lastEditedAt?: string
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
  preview_url: string | null
  code_server_url: string | null
  deploy_url: string | null
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
  | DesignTokensEvent
  | ArchitectureReadyEvent
  | PageGeneratingEvent
  | PageCompleteEvent
  | FileAssembledEvent
  | ValidationCheckEvent
  | SandboxReadyEvent
  | AgentStreamEvent

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
  runId?: string
  plan: {
    appName?: string
    appDescription?: string
    tables?: string[]
    prd?: string
    [key: string]: unknown
  }
}

export interface ClarificationQuestion {
  question: string
  selectionMode: 'single' | 'multiple'
  options: Array<{ label: string; description: string }>
}

export interface ClarificationRequestEvent {
  type: 'clarification_request'
  questions: ClarificationQuestion[]
  runId: string
}

// ============================================================================
// Pipeline B Events
// ============================================================================

export interface DesignTokensEvent {
  type: 'design_tokens'
  tokens: {
    name: string
    colors: {
      background: string
      foreground: string
      primary: string
      primaryForeground: string
      secondary: string
      accent: string
      muted: string
      border: string
    }
    fonts: { display: string; body: string; googleFontsUrl: string }
    style: {
      borderRadius: string
      cardStyle: 'flat' | 'bordered' | 'elevated' | 'glass'
      navStyle: 'top-bar' | 'sidebar' | 'editorial' | 'minimal' | 'centered'
      heroLayout: 'fullbleed' | 'split' | 'centered' | 'editorial' | 'none'
      spacing: 'compact' | 'normal' | 'airy'
      motion: 'none' | 'subtle' | 'expressive'
      imagery: 'photography-heavy' | 'illustration' | 'minimal' | 'icon-focused'
    }
    authPosture: 'public' | 'private' | 'hybrid'
    textSlots: {
      hero_headline: string
      hero_subtext: string
      about_paragraph: string
      cta_label: string
      empty_state: string
      footer_tagline: string
    }
  }
}

export interface ArchitectureReadyEvent {
  type: 'architecture_ready'
  spec: {
    archetype: string
    sitemap: Array<{
      route: string
      componentName: string
      purpose: string
      sections: string[]
      dataRequirements: string
      entities?: string[]
    }>
    auth: { required: boolean }
  }
}

export interface PageGeneratingEvent {
  type: 'page_generating'
  fileName: string
  route: string
  componentName: string
  pageIndex: number
  totalPages: number
}

export interface PageCompleteEvent {
  type: 'page_complete'
  fileName: string
  route: string
  componentName: string
  lineCount: number
  code: string
  pageIndex: number
  totalPages: number
}

export interface FileAssembledEvent {
  type: 'file_assembled'
  path: string
  category: 'config' | 'ui-kit' | 'route' | 'migration' | 'style' | 'wiring'
}

export interface ValidationCheckEvent {
  type: 'validation_check'
  name: 'imports' | 'links' | 'accessibility' | 'hardcoded_colors' | 'typescript' | 'lint' | 'build' | 'manifest' | 'scaffold' | 'typecheck'
  status: 'passed' | 'failed' | 'running'
  errors?: Array<{
    file: string
    line?: number
    message: string
    type: string
  }>
}

export interface SandboxReadyEvent {
  type: 'sandbox_ready'
  sandboxId: string
}

// ============================================================================
// Agent Stream Events (Single Orchestrator)
// ============================================================================

export interface ThinkingEvent {
  type: 'thinking'
  content: string
}

export interface ToolStartEvent {
  type: 'tool_start'
  tool: string
  label?: string
  args?: Record<string, unknown>
}

export interface ToolCompleteEvent {
  type: 'tool_complete'
  tool: string
  success: boolean
  result?: string
  durationMs?: number
  /** File path for file operations */
  filePath?: string
  /** Previous file content (for diffs) */
  oldContent?: string
  /** New file content (for diffs) */
  newContent?: string
}

export interface DoneEvent {
  type: 'done'
  summary: string
  sandboxId?: string
  tokensUsed?: number
}

export interface AgentErrorEvent {
  type: 'agent_error'
  message: string
}

export interface PackageInstalledEvent {
  type: 'package_installed'
  packages: string
}

export type AgentStreamEvent =
  | ThinkingEvent
  | ToolStartEvent
  | ToolCompleteEvent
  | DoneEvent
  | AgentErrorEvent
  | SandboxReadyEvent
  | PackageInstalledEvent
  | CreditsUsedEvent

// ============================================================================
// Timeline Entries (unified chat + pipeline event stream)
// ============================================================================

export type PageProgressEntry = {
  fileName: string
  route: string
  componentName: string
  status: 'pending' | 'generating' | 'complete' | 'error'
  lineCount?: number
  code?: string
}

export type FileAssemblyEntry = {
  path: string
  category: 'config' | 'ui-kit' | 'route' | 'migration' | 'style' | 'wiring'
}

export type ValidationCheckEntry = {
  name: string
  status: 'passed' | 'failed' | 'running'
  errors?: Array<{ file: string; line?: number; message: string; type: string }>
}

export type TimelineEntry =
  | {
      type: 'agent'
      ts: number
      agent: AgentStartEvent
      status: 'running' | 'complete'
      durationMs?: number
      // Artifacts attached to agent cards (rendered inside collapsible content)
      plan?: PlanReadyEvent['plan']
      designTokens?: DesignTokensEvent['tokens']
      architecture?: ArchitectureReadyEvent['spec']
      progressMessages?: string[]
      clarificationQuestions?: ClarificationQuestion[]
    }
  | { type: 'error'; ts: number; error: string }
  | { type: 'complete'; ts: number; deploymentUrl?: string }

// ============================================================================
// Visual Editing
// ============================================================================

export interface ElementContext {
  fileName: string      // Source file path, e.g. "src/components/Form.tsx"
  lineNumber: number    // Line number in source file
  columnNumber: number  // Column number in source file
  tagName: string
  className: string
  textContent: string
  tailwindClasses: string[]
  rect: { x: number; y: number; width: number; height: number }
  computedStyles?: {
    color: string
    backgroundColor: string
    fontSize: string
    fontWeight: string
    padding: string
    margin: string
    textAlign: string
  }
}
