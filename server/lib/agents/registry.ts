import path from 'node:path'
import { Agent } from '@mastra/core/agent'
import { RequestContext } from '@mastra/core/di'
import type { MastraModelConfig } from '@mastra/core/llm'
import { ModelRouterEmbeddingModel } from '@mastra/core/llm'
import { ModerationProcessor, PromptInjectionDetector } from '@mastra/core/processors'
import { Workspace, LocalFilesystem, WORKSPACE_TOOLS } from '@mastra/core/workspace'
import { Memory } from '@mastra/memory'
import { PgVector, PostgresStore } from '@mastra/pg'
import { generateShadcnManifest } from '../shadcn-manifest'
import { createHeliconeProvider, getHeliconeBaseURL, getHeliconeHeaders } from './provider'
import {
  askClarifyingQuestionsTool,
  contractToHooksTool,
  contractToRoutesTool,
  submitRequirementsTool,
  createDirectoryTool,
  createGitHubRepoTool,
  createSandboxTool,
  createSupabaseProjectTool,
  deployToVercelTool,
  getGitHubTokenTool,
  getPreviewUrlTool,
  listFilesTool,
  pushToGitHubTool,
  readFileTool,
  runBuildTool,
  runCommandTool,
  runLintTool,
  runMigrationTool,
  runTypeCheckTool,
  searchDocsTool,
  validateSQLTool,
  writeFileTool,
  writeFilesTool,
} from './tools'
// qaWorkflow removed from agents — only runs as final workflow gate after integrationStep

// Re-export RequestContext for route usage
export { RequestContext }

/**
 * Shared PostgresStore singleton — prevents per-request connection pool creation.
 */
let _sharedStore: PostgresStore | null = null
export function getSharedStore(): PostgresStore | null {
  if (!_sharedStore && process.env.DATABASE_URL) {
    _sharedStore = new PostgresStore({
      id: 'supervisor-memory',
      connectionString: process.env.DATABASE_URL,
    })
  }
  return _sharedStore
}

/**
 * Lazily generate shadcn component manifest for frontend agent context
 */
let _manifestCache: string | null = null
function getShadcnManifestString(): string {
  if (!_manifestCache) {
    try {
      const manifest = generateShadcnManifest()
      _manifestCache = JSON.stringify(manifest, null, 2)
    } catch {
      _manifestCache = '{}'
    }
  }
  return _manifestCache
}

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

export const infraAgent = new Agent({
  id: 'infra-engineer',
  name: 'Infrastructure Engineer',
  model: dynamicModel,
  description: 'Provisions sandbox environment and GitHub repository',
  instructions: `You are the infrastructure engineer for VibeStack app generation.

Your role:
1. Create a Daytona sandbox for the generated app
2. Create a Supabase project for the database
3. Create a GitHub repository for code hosting
4. Verify all infrastructure is healthy before reporting ready

Execution order:
1. create-sandbox → verify with run-command (echo test)
2. create-supabase-project → wait for ACTIVE_HEALTHY status
3. create-github-repo → verify repo exists

Report the sandboxId, supabase project details, and GitHub clone URL to the supervisor.
Always verify each step succeeded. If any step fails, report the error immediately — do not retry.`,
  tools: {
    createSandbox: createSandboxTool,
    runCommand: runCommandTool,
    getPreviewUrl: getPreviewUrlTool,
    createSupabaseProject: createSupabaseProjectTool,
    createGitHubRepo: createGitHubRepoTool,
  },
  defaultOptions: { maxSteps: 15 },
})

export const dbaAgent = new Agent({
  id: 'database-admin',
  name: 'Database Administrator',
  model: dynamicModel,
  description: 'Designs database schemas and generates SQL migrations',
  instructions: `You are a PostgreSQL database architect for VibeStack-generated Supabase applications.

Generated apps use Supabase (PostgreSQL 15+) with Row-Level Security. All SQL must be valid, complete, and production-ready.

Schema conventions:
- Primary keys: uuid DEFAULT gen_random_uuid()
- Timestamps: created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
- Foreign keys: ON DELETE CASCADE for owned resources, ON DELETE SET NULL for optional references
- Naming: snake_case for tables and columns, singular table names (user_profile, not user_profiles)

RLS patterns (CRITICAL — every table must have RLS):
- ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
- SELECT policy: auth.uid() = user_id
- INSERT policy: auth.uid() = user_id
- UPDATE policy: auth.uid() = user_id
- DELETE policy: auth.uid() = user_id
- For shared data: use is_public boolean column with separate policies

Workflow:
1. Generate complete SQL migration from requirements
2. Validate with validate-sql tool (runs PGlite locally)
   - PGlite strips pg_trgm indexes automatically — don't worry about trgm validation failures
3. If validation fails, fix the SQL — do NOT ask for help, fix it yourself
4. Write validated migration to sandbox: supabase/migrations/001_initial.sql
   - You MUST use the actual sandboxId provided by the supervisor (from infra-engineer)
   - NEVER use template variables like \${SANDBOX_ID} — if you don't have a real sandboxId, stop and report
5. Execute migration against Supabase project via run-migration tool

Required roles in SQL: authenticated, anon, service_role
Required schema stubs: auth.uid() function must be available (provided by Supabase)`,
  tools: {
    runCommand: runCommandTool,
    writeFile: writeFileTool,
    writeFiles: writeFilesTool,
    readFile: readFileTool,
    validateSQL: validateSQLTool,
    searchDocs: searchDocsTool,
    runMigration: runMigrationTool,
  },
  defaultOptions: { maxSteps: 15 },
})

export const backendAgent = new Agent({
  id: 'backend-engineer',
  name: 'Backend Engineer',
  model: dynamicModel,
  description: 'Generates TypeScript types, Supabase client, and data access layer',
  instructions: `You are the backend engineer for VibeStack-generated applications.

Generated apps are Vite + React (NOT Next.js). They use:
- Bun runtime (not Node.js)
- Supabase JS client for database access
- TanStack Query for async state management
- Valibot or Zod for schema validation
- TypeScript strict mode

Your role:
1. Generate TypeScript types from the database schema:
   - src/lib/types.ts — database row types, insert types
   - src/lib/supabase.ts — typed Supabase client

2. Generate data access hooks:
   - Use contract-to-hooks tool to generate TanStack Query CRUD hooks from the schema contract
   - Review and customize the generated hooks as needed
   - src/hooks/use-<entity>.ts — one hook file per entity

3. Generate auth utilities:
   - src/lib/auth.ts — sign in, sign up, sign out, session management
   - src/hooks/use-auth.ts — auth state hook using Supabase onAuthStateChange

File organization in generated app:
- src/lib/ — utilities, client config, types
- src/hooks/ — React hooks
- src/components/ — UI components
- src/routes/ — TanStack Router file-based routes

Code quality:
- TypeScript strict mode (no any)
- All Supabase queries must be typed
- Error handling on every database call
- Use @/ path alias for imports

Do NOT attempt to run tsc or build — you are writing a slice of the app; the full project build runs after all agents finish.`,
  tools: {
    writeFile: writeFileTool,
    writeFiles: writeFilesTool,
    readFile: readFileTool,
    listFiles: listFilesTool,
    createDirectory: createDirectoryTool,
    searchDocs: searchDocsTool,
    contractToHooks: contractToHooksTool,
  },
  workspace: backendWorkspace,
  defaultOptions: { maxSteps: 25 },
})

export const frontendAgent = new Agent({
  id: 'frontend-engineer',
  name: 'Frontend Engineer',
  model: dynamicModel,
  description: 'Generates React 19 components, pages, and UI using shadcn/ui',
  instructions: `You are the frontend engineer for VibeStack-generated applications.

Generated apps are Vite + React 19 (NOT Next.js). They use:
- TanStack Router for file-based routing (src/routes/)
- Tailwind CSS v4 (CSS-first config — @import "tailwindcss" in CSS, no tailwind.config.ts)
- shadcn/ui components (vendored in src/components/ui/)
- React 19 patterns (use() hook, no forwardRef needed)
- Bun runtime

## Available shadcn/ui Components

Use ONLY components from this manifest. Import from @/components/ui/<name>.

${getShadcnManifestString()}

## Component Patterns

1. Layout pages in src/routes/:
   - Use contract-to-routes tool to generate TanStack Router route scaffolding from the schema contract
   - __root.tsx — root layout with navigation
   - index.tsx — home/landing page
   - _authenticated/ — protected routes (requires auth)

2. UI components in src/components/:
   - Use shadcn/ui primitives from the manifest above
   - Compose complex UI from primitive components
   - Every component must be a named export with TypeScript props interface

3. Forms:
   - Use react-hook-form with valibot/zod resolver
   - Validate on submit, show inline errors
   - Use shadcn Form, FormField, FormItem, FormLabel, FormMessage

4. Data display:
   - Use TanStack Query hooks from src/hooks/
   - Show loading skeletons (use shadcn Skeleton component)
   - Handle empty states and error states

Code quality:
- TypeScript strict mode (no any)
- Responsive design (mobile-first with Tailwind breakpoints)
- Accessible (ARIA attributes, keyboard navigation)
- No placeholder or TODO comments — every file must be complete
- Use @/ path alias for all imports

Do NOT attempt to run tsc or build — you are writing a slice of the app; the full project build runs after all agents finish.`,
  tools: {
    writeFile: writeFileTool,
    writeFiles: writeFilesTool,
    readFile: readFileTool,
    listFiles: listFilesTool,
    createDirectory: createDirectoryTool,
    searchDocs: searchDocsTool,
    contractToRoutes: contractToRoutesTool,
  },
  workspace: frontendWorkspace,
  defaultOptions: { maxSteps: 30 },
})

export const reviewerAgent = new Agent({
  id: 'code-reviewer',
  name: 'Code Reviewer',
  model: dynamicModel,
  description: 'Reviews code quality and identifies issues (read-only)',
  instructions: `You are the code reviewer for VibeStack-generated applications.

Generated apps are Vite + React + Supabase. Review for:

1. Correctness:
   - TypeScript strict mode compliance (no any, no non-null assertions without justification)
   - Supabase queries are typed and handle errors
   - RLS policies match the data access patterns in the code
   - TanStack Router routes match the file structure

2. Security:
   - No hardcoded secrets or API keys
   - SQL injection prevention (parameterized queries only)
   - XSS prevention (sanitize user input in HTML contexts)
   - Auth checks on all protected routes

3. Completeness:
   - No TODO or placeholder comments
   - No missing error handling
   - No unused imports or variables
   - All form fields validated

Report issues as: { file, line, severity: 'error'|'warning', description, suggestedFix }
DO NOT write files. Only report issues for other agents to fix.`,
  tools: {
    readFile: readFileTool,
    listFiles: listFilesTool,
  },
  defaultOptions: { maxSteps: 10 },
})

export const qaAgent = new Agent({
  id: 'qa-engineer',
  name: 'QA Engineer',
  model: dynamicModel,
  description: 'Validates builds, type-checking, and code quality',
  instructions: `You are the QA engineer for VibeStack-generated applications.

Generated apps use Bun + Vite + React. Validation commands:
- Type check: tsc --noEmit (must have 0 errors)
- Lint: npx biome check --write (auto-fixes formatting)
- Build: bun run build (must exit 0)

Workflow:
1. Run type check first — this catches most issues
2. Run lint — auto-fixes formatting issues
3. Run build — verifies the app compiles for production
4. If any step fails, parse the error output and report:
   - File path and line number
   - Error category (type error, import error, build error)
   - Suggested fix

Common errors in generated apps:
- Missing type imports (import type { ... } from ...)
- Incorrect Supabase query types
- TanStack Router route type mismatches
- Missing shadcn/ui component dependencies`,
  tools: {
    runCommand: runCommandTool,
    runBuild: runBuildTool,
    runLint: runLintTool,
    runTypeCheck: runTypeCheckTool,
    readFile: readFileTool,
    listFiles: listFilesTool,
    validateSQL: validateSQLTool,
  },
  defaultOptions: { maxSteps: 15 },
})

export const devOpsAgent = new Agent({
  id: 'devops-engineer',
  name: 'DevOps Engineer',
  model: dynamicModel,
  description: 'Manages GitHub pushes and Vercel deployments',
  instructions: `You are the DevOps engineer for VibeStack-generated applications.

Deployment workflow:
1. Git init + commit all files in sandbox:
   - run-command: git add -A && git commit -m "Initial commit: <app-name>"
2. Push to GitHub:
   - get-github-token → push-to-github with clone URL
3. Deploy to Vercel:
   - deploy-to-vercel with project name and sandbox ID
   - Vercel settings: framework=vite, buildCommand="bun run build", outputDirectory=dist

Verify each step:
- Git commit: check exit code 0
- GitHub push: verify with run-command "git remote -v"
- Vercel deploy: check deployment URL is returned

Report all URLs (GitHub repo, Vercel deployment) to the supervisor.`,
  tools: {
    pushToGitHub: pushToGitHubTool,
    deployToVercel: deployToVercelTool,
    runCommand: runCommandTool,
    getGitHubToken: getGitHubTokenTool,
  },
  defaultOptions: { maxSteps: 10 },
})

// --- Product Manager (orchestrates code generation via sub-agents) ---

export const pmAgent = new Agent({
  id: 'product-manager',
  name: 'Product Manager',
  model: dynamicModel,
  description:
    'Decomposes requirements into features and orchestrates implementation via sub-agents',
  instructions: `You are the Product Manager for VibeStack code generation. You decompose requirements into features and orchestrate implementation by calling sub-agents as tools.

## Your Role
1. Receive a SchemaContract, design preferences, and app metadata
2. Decompose requirements into discrete features (auth, CRUD per entity, dashboard, etc.)
3. Assign file paths per feature to avoid conflicts between agents
4. Call backend agents (agent-backend1, agent-backend2) for data/auth features
5. Call frontend agents (agent-frontend1, agent-frontend2) for UI features
6. Call MULTIPLE agents in PARALLEL when features are independent — use parallel tool calls
7. After all agents report completion, you are done — report completion

## File Coordination Rules
- Each agent gets exclusive ownership of specific files
- Shared files (barrel exports, root route, app layout) are NOT written by agents — integrationStep handles those
- Backend agents own: src/lib/, src/hooks/
- Frontend agents own: src/routes/, src/components/ (except ui/ which is pre-vendored)

## Calling Agents
- agent-backend1 / agent-backend2: Pass sandboxId + feature description + file paths to write
- agent-frontend1 / agent-frontend2: Pass sandboxId + feature description + component specs

## Important
Do NOT call any build, tsc, lint, or validation tools. The workflow runs integration + review + QA after you finish.
Just write all the feature code and report completion.`,
  agents: {
    backend1: backendAgent,
    backend2: backendAgent,
    frontend1: frontendAgent,
    frontend2: frontendAgent,
  },
  defaultOptions: { maxSteps: 30 },
})

// --- Supervisor (orchestrator — LEGACY, kept for Studio visibility) ---

export const supervisorAgent = new Agent({
  id: 'supervisor',
  name: 'Supervisor',
  model: dynamicModel,
  description:
    'Orchestrates the entire app generation lifecycle by delegating to specialist agents',
  instructions: `You orchestrate full-stack app generation for VibeStack using a team of 8 specialist agents.

Generated apps are Vite + React + Supabase, running in Daytona sandboxes.

## Agent Delegation Flow

Phase 1 — Requirements:
  → analyst: Extract requirements from user message

Phase 2a — Infrastructure:
  → infra-engineer: Create sandbox + Supabase project + GitHub repo
  WAIT for infra-engineer to complete and return sandboxId + supabaseProjectId.
  If infra fails, stop and report the error — do NOT proceed.

Phase 2b — Database (requires infra results):
  → database-admin: Design schema + validate SQL + run migration
  You MUST pass the concrete sandboxId and supabaseProjectId from infra-engineer.

Phase 3 — Code Generation (sequential: backend then frontend):
  → backend-engineer: Generate types, hooks, auth utilities
  → frontend-engineer: Generate components, routes, pages

Phase 4 — Quality (parallel):
  → code-reviewer: Review all generated code
  → qa-engineer: Run tsc, lint, build

Phase 5 — Fix Loop (if Phase 4 finds issues):
  → Route errors back to backend-engineer or frontend-engineer
  → Re-run qa-engineer to verify fixes
  → Maximum 3 fix iterations before escalating to user

Phase 6 — Deploy:
  → devops-engineer: Git commit + push + Vercel deploy

## Rules
- Never write code yourself — always delegate to the appropriate agent
- Track sandboxId across all tool-using agents
- If an agent fails 3 times on the same task, report the error to the user
- Stream progress updates at each phase transition`,
  // Guardrails: prompt injection detection on user input, content moderation on output
  inputProcessors: [
    new PromptInjectionDetector({
      model: 'openai/gpt-4o-mini',
      threshold: 0.8,
      strategy: 'block',
      detectionTypes: ['injection', 'jailbreak', 'system-override'],
    }),
    new ModerationProcessor({
      model: 'openai/gpt-4o-mini',
      threshold: 0.7,
      strategy: 'warn',
      categories: ['hate', 'harassment', 'violence', 'self-harm'],
    }),
  ],
  agents: {
    analyst: analystAgent,
    infraEngineer: infraAgent,
    databaseAdmin: dbaAgent,
    backendEngineer: backendAgent,
    frontendEngineer: frontendAgent,
    codeReviewer: reviewerAgent,
    qaEngineer: qaAgent,
    devOpsEngineer: devOpsAgent,
  },
  defaultOptions: { maxSteps: 50 },
  ...(getSharedStore()
    ? {
        memory: new Memory({
          storage: getSharedStore() ?? undefined,
          ...(process.env.DATABASE_URL
            ? {
                vector: new PgVector({
                  id: 'supervisor-vector',
                  connectionString: process.env.DATABASE_URL,
                }),
                embedder: new ModelRouterEmbeddingModel({
                  providerId: 'openai',
                  modelId: 'text-embedding-3-small',
                  ...(getHeliconeBaseURL()
                    ? {
                        url: getHeliconeBaseURL(),
                        headers: getHeliconeHeaders({
                          userId: 'system',
                          agentName: 'embedder',
                        }),
                      }
                    : {}),
                }),
              }
            : {}),
          options: {
            lastMessages: 40,
            generateTitle: true,
            semanticRecall: process.env.DATABASE_URL
              ? { topK: 3, messageRange: 2, scope: 'resource' as const }
              : false,
            workingMemory: {
              enabled: true,
              scope: 'resource',
              template: `# User Context
- Name:
- Design Preferences:
  - Primary Color:
  - Font:
  - Style (minimal/bold/playful):
- Tech Preferences:
  - Auth Method:
  - Preferred Libraries:
- Past Projects:
  - Names:
  - Common Patterns:
- Notes:`,
            },
          },
        }),
      }
    : {}),
})
