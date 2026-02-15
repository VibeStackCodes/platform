import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import {
  writeFileTool,
  readFileTool,
  listFilesTool,
  createDirectoryTool,
  runCommandTool,
  runBuildTool,
  runLintTool,
  runTypeCheckTool,
  validateSQLTool,
  getPreviewUrlTool,
  createSandboxTool,
  pushToGitHubTool,
  deployToVercelTool,
  searchDocsTool,
  createSupabaseProjectTool,
  runMigrationTool,
  createGitHubRepoTool,
  getGitHubTokenTool,
} from './tools';
import { generateShadcnManifest } from '@/lib/shadcn-manifest';
import { createHeliconeProvider, type AllowedModel } from './provider';

/**
 * Shared PostgresStore singleton — prevents per-request connection pool creation.
 * When createAgentNetwork() is called per-request, each supervisor's Memory
 * reuses this single store instance instead of spawning a new pool.
 */
let _sharedStore: PostgresStore | null = null;
function getSharedStore(): PostgresStore | null {
  if (!_sharedStore && process.env.DATABASE_URL) {
    _sharedStore = new PostgresStore({
      id: 'supervisor-memory',
      connectionString: process.env.DATABASE_URL,
    });
  }
  return _sharedStore;
}

/**
 * Lazily generate shadcn component manifest for frontend agent context
 */
let _manifestCache: string | null = null;
function getShadcnManifestString(): string {
  if (!_manifestCache) {
    try {
      const manifest = generateShadcnManifest();
      _manifestCache = JSON.stringify(manifest, null, 2);
    } catch {
      _manifestCache = '{}';
    }
  }
  return _manifestCache;
}

/**
 * Factory function that creates the full 9-agent network per request.
 * Each invocation uses a Helicone-proxied provider tagged with the userId
 * so that LLM costs are tracked per user.
 *
 * @param model  - The allowed model to use (e.g. 'gpt-5.2')
 * @param userId - User ID for Helicone per-user cost tracking
 * @returns Object containing the supervisor agent with all sub-agents wired in
 */
export function createAgentNetwork(model: AllowedModel, userId: string): { supervisor: Agent } {
  const provider = createHeliconeProvider(userId);
  const llm = provider(model);

  // --- Sub-agents ---

  const analystAgent = new Agent({
    id: 'analyst',
    name: 'Analyst',
    model: llm,
    description: 'Converses with users to extract and clarify app requirements',
    instructions: `You are a requirements analyst for VibeStack, an AI app builder that generates Vite + React + Supabase applications.

Your role:
1. Extract structured requirements from user descriptions:
   - App name and one-line description
   - Core features (categorize each as: auth, crud, dashboard, messaging, realtime, custom)
   - Data entities with fields and relationships
   - Design preferences (colors, fonts, layout style)

2. Apply smart defaults when unspecified:
   - Auth: Supabase Auth with email/password + Google OAuth
   - Styling: Modern minimal with Tailwind CSS v4, primary blue (#3b82f6), Inter font
   - Database: PostgreSQL via Supabase with RLS enabled on all tables
   - State: TanStack Query for server state management

3. Ask ONE clarifying question at a time when critical requirements are ambiguous.

Output structured JSON with: appName, description, features[], entities[], designTokens.`,
    tools: {
      searchDocs: searchDocsTool,
    },
  });

  const infraAgent = new Agent({
    id: 'infra-engineer',
    name: 'Infrastructure Engineer',
    model: llm,
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
  });

  const dbaAgent = new Agent({
    id: 'database-admin',
    name: 'Database Administrator',
    model: llm,
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
3. If validation fails, fix the SQL — do NOT ask for help, fix it yourself
4. Write validated migration to sandbox: supabase/migrations/001_initial.sql
5. Execute migration against Supabase project via run-migration tool

Required roles in SQL: authenticated, anon, service_role
Required schema stubs: auth.uid() function must be available (provided by Supabase)`,
    tools: {
      runCommand: runCommandTool,
      writeFile: writeFileTool,
      readFile: readFileTool,
      validateSQL: validateSQLTool,
      searchDocs: searchDocsTool,
      runMigration: runMigrationTool,
    },
  });

  const backendAgent = new Agent({
    id: 'backend-engineer',
    name: 'Backend Engineer',
    model: llm,
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
   - src/hooks/use-<entity>.ts — TanStack Query hooks for CRUD
   - Pattern: useQuery for reads, useMutation for writes
   - Always include loading/error states

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
- Use @/ path alias for imports`,
    tools: {
      writeFile: writeFileTool,
      readFile: readFileTool,
      listFiles: listFilesTool,
      createDirectory: createDirectoryTool,
      searchDocs: searchDocsTool,
    },
  });

  const frontendAgent = new Agent({
    id: 'frontend-engineer',
    name: 'Frontend Engineer',
    model: llm,
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
- Use @/ path alias for all imports`,
    tools: {
      writeFile: writeFileTool,
      readFile: readFileTool,
      listFiles: listFilesTool,
      createDirectory: createDirectoryTool,
      searchDocs: searchDocsTool,
    },
  });

  const reviewerAgent = new Agent({
    id: 'code-reviewer',
    name: 'Code Reviewer',
    model: llm,
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
  });

  const qaAgent = new Agent({
    id: 'qa-engineer',
    name: 'QA Engineer',
    model: llm,
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
  });

  const devOpsAgent = new Agent({
    id: 'devops-engineer',
    name: 'DevOps Engineer',
    model: llm,
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
  });

  // --- Supervisor ---

  const supervisor = new Agent({
    id: 'supervisor',
    name: 'Supervisor',
    model: llm,
    description: 'Orchestrates the entire app generation lifecycle by delegating to specialist agents',
    instructions: `You orchestrate full-stack app generation for VibeStack using a team of 8 specialist agents.

Generated apps are Vite + React + Supabase, running in Daytona sandboxes.

## Agent Delegation Flow

Phase 1 — Requirements:
  → analyst: Extract requirements from user message

Phase 2 — Infrastructure (parallel):
  → infra-engineer: Create sandbox + Supabase project + GitHub repo
  → database-admin: Design schema + validate SQL + run migration

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
    ...(getSharedStore()
      ? {
          memory: new Memory({
            storage: getSharedStore()!,
            options: {
              // Store FULL conversation history (no truncation)
              lastMessages: false,

              // Working Memory — persistent user context across threads
              workingMemory: {
                enabled: true,
                scope: 'resource', // Shared across all projects for this user
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

              // TODO: Semantic Recall — requires PgVector + embedder
              // semanticRecall: {
              //   topK: 5,
              //   messageRange: 3,
              //   scope: 'resource',
              // },

              // TODO: Observational Memory — requires Observer + Reflector agent config
              // See: https://mastra.ai/docs/memory/overview
            },
          }),
        }
      : {}),
  });

  return { supervisor };
}

// Backward compatibility — route.ts still imports supervisorAgent directly.
// Task 4 will update route.ts to use createAgentNetwork and remove this.
const _defaultNetwork = createAgentNetwork('gpt-5.2', 'system');
export const supervisorAgent = _defaultNetwork.supervisor;

/**
 * Central Mastra instance — bare instance since agents are now per-request.
 */
export const mastra = new Mastra({});
