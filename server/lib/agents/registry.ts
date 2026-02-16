import path from 'node:path'
import { Agent } from '@mastra/core/agent'
import { RequestContext } from '@mastra/core/di'
import type { MastraModelConfig } from '@mastra/core/llm'
import { Workspace, LocalFilesystem, WORKSPACE_TOOLS } from '@mastra/core/workspace'
import { createHeliconeProvider } from './provider'
import {
  askClarifyingQuestionsTool,
  submitRequirementsTool,
  createDirectoryTool,
  listFilesTool,
  readFileTool,
  runCommandTool,
  searchDocsTool,
  writeFileTool,
  writeFilesTool,
} from './tools'
// qaWorkflow removed from agents — only runs as final workflow gate after integrationStep

// Re-export RequestContext for route usage
export { RequestContext }

/**
 * Dynamic model resolver — reads the Helicone-proxied LLM from RequestContext.
 * Returns LanguageModelV1 (from Helicone provider) or string (Mastra model router format).
 * ALL paths route through Helicone when HELICONE_API_KEY is set.
 */
function dynamicModel({ requestContext }: { requestContext: RequestContext }): MastraModelConfig {
  if (requestContext?.has('llm')) {
    return requestContext.get('llm') as MastraModelConfig
  }
  // Fallback for Mastra Studio / Cloud / tests — still route through Helicone
  return createHeliconeProvider('studio')('gpt-5.2')
}

// --- Workspace Skills (domain knowledge for code-gen agents) ---

const skillsRoot = path.resolve(import.meta.dirname, 'skills')

// Disable ALL workspace filesystem/sandbox tools — we only want skills (domain knowledge)
// injected into agent context. File operations go through our custom Daytona sandbox tools.
const noWorkspaceTools = {
  [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: { enabled: false },
  [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { enabled: false },
} as const

const backendWorkspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: skillsRoot }),
  skills: ['/supabase-js', '/tanstack-query', '/vite-app'],
  tools: noWorkspaceTools,
})

const frontendWorkspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: skillsRoot }),
  skills: [
    '/supabase-js',
    '/tanstack-router',
    '/tanstack-query',
    '/shadcn-ui',
    '/tailwind-v4',
    '/react-19',
    '/vite-app',
  ],
  tools: noWorkspaceTools,
})

// --- Module-level agents (visible to Mastra Studio) ---

export const analystAgent = new Agent({
  id: 'analyst',
  name: 'Analyst',
  model: dynamicModel,
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
})

export const backendAgent = new Agent({
  id: 'backend-engineer',
  name: 'Backend Engineer',
  model: dynamicModel,
  description: 'Fills SLOT markers in tRPC router files with custom procedures',
  instructions: `You are the backend engineer for VibeStack-generated applications.

Your ONLY job is to fill SLOT markers in tRPC router files with custom procedures.

Generated apps use tRPC + Drizzle. The router skeletons are pre-generated with standard CRUD.
You fill the SLOT marked: // {/* SLOT: CUSTOM_PROCEDURES */}

Custom procedures to add:
- Full-text search across entity fields
- Complex joins across related tables
- Business logic (computed fields, aggregations, batch operations)

Rules:
- Only modify files you are given — do not create new files
- Use the existing Drizzle schema imports
- Use protectedProcedure for user-owned data, publicProcedure otherwise
- Input validation with Zod
- No TODO/FIXME/placeholder comments`,
  tools: {
    writeFile: writeFileTool,
    writeFiles: writeFilesTool,
    readFile: readFileTool,
    listFiles: listFilesTool,
    createDirectory: createDirectoryTool,
    searchDocs: searchDocsTool,
  },
  workspace: backendWorkspace,
  defaultOptions: { maxSteps: 25 },
})

export const frontendAgent = new Agent({
  id: 'frontend-engineer',
  name: 'Frontend Engineer',
  model: dynamicModel,
  description: 'Fills SLOT markers in page skeletons with JSX component bodies',
  instructions: `You are the frontend engineer for VibeStack-generated applications.

Your ONLY job is to fill SLOT markers in page skeleton files with JSX component bodies.

The page skeletons have all imports, hooks, state, and route definitions pre-wired.
You fill the SLOT marked: {/* SLOT: COMPONENT_BODY */}

For list pages, build:
- Data table/grid showing entity records from the list query
- Create dialog/modal triggered by the isCreateOpen state
- Delete confirmation using the deleteTargetId state
- Loading and empty states

For detail pages, build:
- Entity detail view using the getById query
- Edit form toggled by the isEditing state
- Back navigation link

Rules:
- Only write JSX inside the SLOT markers — do not modify imports, hooks, or state
- Use shadcn/ui components (Button, Card, Input, Dialog, Table)
- Use Tailwind CSS classes for layout and styling
- Handle loading, error, and empty states
- No TODO/FIXME/placeholder comments`,
  tools: {
    writeFile: writeFileTool,
    writeFiles: writeFilesTool,
    readFile: readFileTool,
    listFiles: listFilesTool,
    createDirectory: createDirectoryTool,
    searchDocs: searchDocsTool,
  },
  workspace: frontendWorkspace,
  defaultOptions: { maxSteps: 30 },
})

export const repairAgent = new Agent({
  id: 'repair',
  name: 'Repair Agent',
  model: dynamicModel,
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
  defaultOptions: { maxSteps: 15 },
})
