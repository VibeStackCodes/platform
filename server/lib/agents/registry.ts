import { Agent } from '@mastra/core/agent'
import { RequestContext } from '@mastra/core/di'
import { createAgentModelResolver } from './provider'
import {
  askClarifyingQuestionsTool,
  submitRequirementsTool,
  readFileTool,
  runCommandTool,
  searchDocsTool,
  writeFileTool,
} from './tools'

// Re-export RequestContext for route usage
export { RequestContext }

// Per-agent model resolvers — each agent uses the optimal model for its role.
// All paths route through Helicone when HELICONE_API_KEY is set.
const orchestratorModel = createAgentModelResolver('orchestrator') // gpt-5.2
const repairModel = createAgentModelResolver('repair')             // gpt-5.2-codex
const editModel = createAgentModelResolver('edit')                 // gpt-5.2-codex

// ============================================================================
// Agent Definitions (2-agent architecture)
// ============================================================================
//
// Current workflow:
// 1. analystAgent: Extracts requirements, produces SchemaContract
// 2. Infrastructure provisioning (parallel): Sandbox + Supabase + GitHub repo
// 3. AppBlueprint generation: contract → SQL + supabase-js client + routes + pages
// 4. Code generation: Fully deterministic
//    - inferPageConfig(): ColumnClassifier → PageConfig (no LLM)
//    - Deterministic assembler: PageConfig + contract → full React components
// 5. repairAgent: Fixes validation errors (TypeScript, lint, build)
// 6. Deployment: Push to GitHub + Vercel

export const analystAgent = new Agent({
  id: 'analyst',
  name: 'Analyst',
  model: orchestratorModel,
  description: 'Converses with users to extract and clarify app requirements',
  instructions: `You are a requirements analyst for VibeStack, an AI app builder that generates Vite + React + Supabase applications.

You MUST call exactly one of these tools — never respond with plain text:
- submitRequirements: when the request is clear enough to define app name, database schema, and design preferences
- askClarifyingQuestions: when the request is vague and needs refinement

Guidelines for extracting requirements:
1. App name and one-line description
2. Database schema: tables with columns (name, type, nullable, default), foreign keys, RLS policies, enums
3. Design preferences: style, primaryColor (hex), fontFamily

Smart defaults when unspecified:
- Auth: Supabase Auth with email/password + Google OAuth. Include users table with RLS policy using auth.uid()
- Styling: Modern minimal, primary blue (#3b82f6), Inter font
- Database: PostgreSQL via Supabase, RLS enabled on all tables
- Every table gets id (uuid, default gen_random_uuid()), created_at, updated_at columns

When using askClarifyingQuestions:
- 1-4 questions, 2-4 options each
- selectionMode "single" for mutually exclusive choices, "multiple" for pick-many
- Each option: short label (2-5 words) + description
- Only ask when genuinely ambiguous — err toward proceeding with smart defaults`,
  tools: {
    searchDocs: searchDocsTool,
    askClarifyingQuestions: askClarifyingQuestionsTool,
    submitRequirements: submitRequirementsTool,
  },
  defaultOptions: { modelSettings: { temperature: 0.4 } },
})

export const repairAgent = new Agent({
  id: 'repair',
  name: 'Repair Agent',
  model: repairModel,
  description: 'Fixes validation errors in generated code with targeted, minimal changes',
  instructions: `You are the repair agent for VibeStack-generated applications.

You receive specific validation errors (TypeScript, lint, build) and fix them with minimal changes.

Rules:
1. Only modify files that have errors — do not touch other files
2. Preserve the skeleton structure (imports, hooks, state declarations)
3. Only fix the specific error — do not refactor or add features
4. Use ESM imports (never require())
5. No TODO/FIXME/placeholder comments
6. If a type error is in generated code, fix the type — do not add \`as any\``,
  tools: {
    writeFile: writeFileTool,
    readFile: readFileTool,
    runCommand: runCommandTool,
  },
  defaultOptions: { maxSteps: 15, modelSettings: { temperature: 0.1 } },
})

export const editAgent = new Agent({
  id: 'edit',
  name: 'Edit Agent',
  model: editModel,
  description: 'Makes targeted single-file edits to an existing generated application',
  instructions: `You are the edit agent for VibeStack-generated applications.

You receive a target file with its current content and a user request for changes.
Make MINIMAL changes to fulfill the request. Preserve all existing functionality.
Return the COMPLETE modified file content.

Rules:
1. Only modify what the user asks — do not refactor or add features
2. Preserve all imports, hooks, state declarations, and component structure
3. Use Tailwind CSS classes for styling changes
4. Use shadcn/ui components when adding UI elements
5. Do not add TODO/FIXME/placeholder comments
6. If the request is ambiguous, make the most reasonable interpretation`,
  tools: {
    readFile: readFileTool,
    writeFile: writeFileTool,
  },
  defaultOptions: { maxSteps: 10, modelSettings: { temperature: 0.2 } },
})
