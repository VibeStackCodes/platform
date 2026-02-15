/**
 * Mastra Workflows — deterministic, structured pipelines for tasks that don't need LLM reasoning.
 *
 * Unlike agent networks (LLM-driven routing), workflows run steps in a fixed order
 * with typed inputs/outputs. Use workflows for infrastructure provisioning, data pipelines,
 * and other deterministic sequences.
 *
 * Visible in Mastra Studio under the "Workflows" tab.
 */

import { createStep, createWorkflow } from '@mastra/core/workflows'
import { z } from 'zod'
import { contractToSQL } from '../contract-to-sql'
import { contractToTypes } from '../contract-to-types'
import { buildRepoName, createRepo, getInstallationToken } from '../github'
import {
  createSandbox as createSandboxFn,
  downloadDirectory,
  getSandbox,
  pushToGitHub as pushToGitHubFn,
} from '../sandbox'
import { DesignPreferencesSchema, SchemaContractSchema, validateContract } from '../schema-contract'
import { createSupabaseProject as createSupabaseProjectFn, runMigration } from '../supabase-mgmt'
import { analystAgent, pmAgent } from './registry'
import { validateSQLTool } from './tools'

// ============================================================================
// Shared schemas
// ============================================================================

const infraInputSchema = z.object({
  appName: z.string(),
  projectId: z.string(),
})

// ============================================================================
// Analyst Output Schema — used by analystStep for structuredOutput
// ============================================================================

export const AnalystOutputSchema = z.object({
  appName: z.string().describe('Short application name (e.g., "TaskFlow")'),
  appDescription: z.string().describe('One-line app description'),
  contract: SchemaContractSchema.describe('Database schema contract'),
  designPreferences: DesignPreferencesSchema.describe('UI design preferences'),
})

// ============================================================================
// Analyst Step — 1 LLM call with structuredOutput → SchemaContract + metadata
// Note: Uses createStep({ execute }) instead of createStep(agent) to avoid
// circular ESM dependency — analystAgent is undefined at module init time.
// ============================================================================

export const analystStep = createStep({
  id: 'analyst',
  inputSchema: z.object({ prompt: z.string() }),
  outputSchema: AnalystOutputSchema,
  execute: async ({ inputData }) => {
    const result = await analystAgent.generate(inputData.prompt, {
      structuredOutput: { schema: AnalystOutputSchema },
    })
    return result.object
  },
})

// ============================================================================
// Infra Provision Steps (all independent — run in parallel)
// ============================================================================

const createSandboxStep = createStep({
  id: 'create-sandbox',
  inputSchema: infraInputSchema,
  outputSchema: z.object({
    sandboxId: z.string(),
  }),
  execute: async ({ inputData }) => {
    const sandbox = await createSandboxFn({
      language: 'typescript',
      autoStopInterval: 60,
      labels: { app: inputData.appName, project: inputData.projectId },
    })
    return { sandboxId: sandbox.id }
  },
})

const createSupabaseStep = createStep({
  id: 'create-supabase',
  inputSchema: infraInputSchema,
  outputSchema: z.object({
    supabaseProjectId: z.string(),
    supabaseUrl: z.string(),
    supabaseAnonKey: z.string(),
  }),
  execute: async ({ inputData }) => {
    const uniqueName = `${inputData.appName}-${Date.now().toString(36).slice(-5)}`
    const project = await createSupabaseProjectFn(uniqueName, 'us-east-1')
    return {
      supabaseProjectId: project.id,
      supabaseUrl: project.url,
      supabaseAnonKey: project.anonKey,
    }
  },
})

const createGitHubRepoStep = createStep({
  id: 'create-github-repo',
  inputSchema: infraInputSchema,
  outputSchema: z.object({
    githubCloneUrl: z.string(),
    githubHtmlUrl: z.string(),
    repoName: z.string(),
  }),
  execute: async ({ inputData }) => {
    const repoName = buildRepoName(inputData.appName, inputData.projectId)
    const repo = await createRepo(repoName)
    return {
      githubCloneUrl: repo.cloneUrl,
      githubHtmlUrl: repo.htmlUrl,
      repoName,
    }
  },
})

// ============================================================================
// Infra Provision Workflow — all 3 steps run in parallel
// ============================================================================

export const infraProvisionWorkflow = createWorkflow({
  id: 'infra-provision',
  inputSchema: z.object({
    appName: z.string().describe('Application name for the generated project'),
    projectId: z.string().describe('VibeStack project ID'),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    supabaseProjectId: z.string(),
    supabaseUrl: z.string(),
    supabaseAnonKey: z.string(),
    githubCloneUrl: z.string(),
    githubHtmlUrl: z.string(),
    repoName: z.string(),
  }),
})
  .parallel([createSandboxStep, createSupabaseStep, createGitHubRepoStep])
  .map(async ({ inputData }) => ({
    sandboxId: inputData['create-sandbox'].sandboxId,
    supabaseProjectId: inputData['create-supabase'].supabaseProjectId,
    supabaseUrl: inputData['create-supabase'].supabaseUrl,
    supabaseAnonKey: inputData['create-supabase'].supabaseAnonKey,
    githubCloneUrl: inputData['create-github-repo'].githubCloneUrl,
    githubHtmlUrl: inputData['create-github-repo'].githubHtmlUrl,
    repoName: inputData['create-github-repo'].repoName,
  }))
  .commit()

// ============================================================================
// SQL Validation Step — wraps the existing validateSQLTool as a workflow step
// (deterministic — 0 LLM calls, reuses cached PGlite from tools.ts)
// ============================================================================

export const validateSQLStep = createStep(validateSQLTool)

// ============================================================================
// Schema Generation Step — deterministic (0 LLM calls)
// Validates contract → generates SQL + TypeScript types
// ============================================================================

export const schemaGenerationStep = createStep({
  id: 'schema-generation',
  inputSchema: z.object({
    contract: SchemaContractSchema,
    sandboxId: z.string(),
  }),
  outputSchema: z.object({
    sql: z.string(),
    types: z.string(),
    sandboxId: z.string(),
  }),
  execute: async ({ inputData }) => {
    const validation = validateContract(inputData.contract)
    if (!validation.valid) {
      throw new Error(`SchemaContract validation failed: ${validation.errors.join('; ')}`)
    }
    const sql = contractToSQL(inputData.contract)
    const types = contractToTypes(inputData.contract)
    return { sql, types, sandboxId: inputData.sandboxId }
  },
})

// ============================================================================
// Write + Run Migration Steps (can run in parallel — no data dependency)
// ============================================================================

export const writeMigrationStep = createStep({
  id: 'write-migration',
  inputSchema: z.object({
    sandboxId: z.string(),
    sql: z.string(),
  }),
  outputSchema: z.object({ written: z.boolean(), error: z.string().optional() }),
  execute: async ({ inputData }) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      await sandbox.fs.uploadFile(
        Buffer.from(inputData.sql),
        '/workspace/supabase/migrations/001_initial.sql',
      )
      return { written: true }
    } catch (e) {
      return { written: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
})

export const runMigrationStep = createStep({
  id: 'run-migration',
  inputSchema: z.object({
    supabaseProjectId: z.string(),
    sql: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    executedAt: z.string(),
  }),
  execute: async ({ inputData }) => {
    return await runMigration(inputData.supabaseProjectId, inputData.sql)
  },
})

// ============================================================================
// QA Workflow — deterministic build validation (0 LLM calls)
// ============================================================================

const typeCheckStep = createStep({
  id: 'typecheck',
  inputSchema: z.object({ sandboxId: z.string() }),
  outputSchema: z.object({
    sandboxId: z.string(),
    typecheckPassed: z.boolean(),
    typecheckOutput: z.string(),
  }),
  execute: async ({ inputData }) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const result = await sandbox.process.executeCommand('tsc --noEmit', '/workspace', undefined, 60)
    return {
      sandboxId: inputData.sandboxId,
      typecheckPassed: result.exitCode === 0,
      typecheckOutput: result.result,
    }
  },
})

const lintStep = createStep({
  id: 'lint',
  inputSchema: z.object({
    sandboxId: z.string(),
    typecheckPassed: z.boolean(),
    typecheckOutput: z.string(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    typecheckPassed: z.boolean(),
    typecheckOutput: z.string(),
    lintPassed: z.boolean(),
    lintOutput: z.string(),
  }),
  execute: async ({ inputData }) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const result = await sandbox.process.executeCommand(
      'npx biome check --write',
      '/workspace',
      undefined,
      30,
    )
    return {
      ...inputData,
      lintPassed: result.exitCode === 0,
      lintOutput: result.result,
    }
  },
})

const buildStep = createStep({
  id: 'build',
  inputSchema: z.object({
    sandboxId: z.string(),
    typecheckPassed: z.boolean(),
    typecheckOutput: z.string(),
    lintPassed: z.boolean(),
    lintOutput: z.string(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    typecheckPassed: z.boolean(),
    typecheckOutput: z.string(),
    lintPassed: z.boolean(),
    lintOutput: z.string(),
    buildPassed: z.boolean(),
    buildOutput: z.string(),
  }),
  execute: async ({ inputData }) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const result = await sandbox.process.executeCommand(
      'bun run build',
      '/workspace',
      undefined,
      120,
    )
    return {
      ...inputData,
      buildPassed: result.exitCode === 0,
      buildOutput: result.result,
    }
  },
})

export const qaWorkflow = createWorkflow({
  id: 'qa-validation',
  inputSchema: z.object({
    sandboxId: z.string().describe('Sandbox ID to validate'),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    typecheckPassed: z.boolean(),
    typecheckOutput: z.string(),
    lintPassed: z.boolean(),
    lintOutput: z.string(),
    buildPassed: z.boolean(),
    buildOutput: z.string(),
  }),
})
  .then(typeCheckStep)
  .then(lintStep)
  .then(buildStep)
  .commit()

// ============================================================================
// Integration Step — deterministic (0 LLM calls)
// Wires feature outputs into shared files (barrel exports, root route, layout)
// ============================================================================

export const integrationStep = createStep({
  id: 'integration',
  inputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    tables: z.array(z.string()).describe('Table names from SchemaContract'),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    filesWritten: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const filesWritten: string[] = []

    // 1. Generate barrel export for hooks
    const hookImports = inputData.tables
      .map((t) => `export * from './use-${t.replace(/_/g, '-')}'`)
      .join('\n')
    const hooksIndex = `// Auto-generated by VibeStack — do not edit manually\n${hookImports}\n`
    await sandbox.fs.uploadFile(Buffer.from(hooksIndex), '/workspace/src/hooks/index.ts')
    filesWritten.push('src/hooks/index.ts')

    // 2. Generate nav links for app layout
    const navLinks = inputData.tables
      .map((t) => {
        const kebab = t.replace(/_/g, '-')
        const label = t
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        return `  { to: '/${kebab}', label: '${label}s' }`
      })
      .join(',\n')

    const layoutContent = `// Auto-generated by VibeStack — do not edit manually
import { Link, Outlet } from '@tanstack/react-router'

const navLinks = [
${navLinks},
]

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <nav className="container mx-auto flex items-center gap-6 py-4">
          <Link to="/" className="text-lg font-bold">${inputData.appName}</Link>
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-sm text-muted-foreground hover:text-foreground"
              activeProps={{ className: 'text-foreground font-medium' }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="container mx-auto py-6">
        <Outlet />
      </main>
    </div>
  )
}
`
    await sandbox.fs.uploadFile(
      Buffer.from(layoutContent),
      '/workspace/src/components/app-layout.tsx',
    )
    filesWritten.push('src/components/app-layout.tsx')

    return { sandboxId: inputData.sandboxId, filesWritten }
  },
})

// ============================================================================
// Code Generation Step — PM agent orchestrates sub-agents (N LLM calls)
// ============================================================================

/** Build a detailed prompt for the PM agent from structured generation data */
function buildCodeGenPrompt(data: {
  sandboxId: string
  contract: z.infer<typeof SchemaContractSchema>
  types: string
  sql: string
  appName: string
  appDescription: string
  designPreferences: z.infer<typeof DesignPreferencesSchema>
  supabaseUrl: string
  supabaseAnonKey: string
}): string {
  const tableNames = data.contract.tables.map((t) => t.name).join(', ')
  return `Generate a full-stack "${data.appName}" application in sandbox ${data.sandboxId}.

## App Description
${data.appDescription}

## Database Tables
${tableNames}

## Schema Contract (JSON)
${JSON.stringify(data.contract, null, 2)}

## Generated TypeScript Types
\`\`\`typescript
${data.types}
\`\`\`

## Generated SQL Migration
\`\`\`sql
${data.sql}
\`\`\`

## Design Preferences
- Style: ${data.designPreferences.style}
- Primary Color: ${data.designPreferences.primaryColor}
- Font: ${data.designPreferences.fontFamily}

## Environment
- Sandbox ID: ${data.sandboxId}
- Supabase URL: ${data.supabaseUrl}
- Supabase Anon Key: ${data.supabaseAnonKey}

## File Coordination Rules
- Backend agents write: src/lib/, src/hooks/
- Frontend agents write: src/routes/, src/components/ (NOT ui/ — already vendored)
- DO NOT write barrel exports (src/hooks/index.ts) or app layout — integrationStep handles those
- Each agent gets exclusive file ownership to prevent conflicts

## Instructions
1. Decompose into discrete features (auth, CRUD per entity, dashboard, etc.)
2. Assign file paths per feature to prevent conflicts
3. Call backend agents for data/auth features, frontend agents for UI features
4. Use PARALLEL tool calls for independent features
5. After agents complete, call agent-reviewer to review
6. If reviewer finds issues, route fixes to the appropriate agent
7. Call workflow-qaValidation for final build check
8. Maximum 3 fix iterations before reporting failure`
}

export const codeGenStep = createStep({
  id: 'code-generation',
  inputSchema: z.object({
    sandboxId: z.string(),
    contract: SchemaContractSchema,
    types: z.string(),
    sql: z.string(),
    appName: z.string(),
    appDescription: z.string(),
    designPreferences: DesignPreferencesSchema,
    supabaseUrl: z.string(),
    supabaseAnonKey: z.string(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    tables: z.array(z.string()),
    codeGenComplete: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const prompt = buildCodeGenPrompt(inputData)
    await pmAgent.generate(prompt)
    return {
      sandboxId: inputData.sandboxId,
      appName: inputData.appName,
      tables: inputData.contract.tables.map((t) => t.name),
      codeGenComplete: true,
    }
  },
})

// ============================================================================
// Deploy Workflow — deterministic git + push + deploy (0 LLM calls)
// ============================================================================

/** Escape a string for safe use in shell commands */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`
}

const gitCommitStep = createStep({
  id: 'git-commit',
  inputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    githubCloneUrl: z.string(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    githubCloneUrl: z.string(),
    commitSuccess: z.boolean(),
    commitOutput: z.string(),
  }),
  execute: async ({ inputData }) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const commitMsg = escapeShellArg(`Initial commit: ${inputData.appName}`)
    const result = await sandbox.process.executeCommand(
      `git add -A && git commit -m ${commitMsg}`,
      '/workspace',
      undefined,
      30,
    )
    return {
      sandboxId: inputData.sandboxId,
      appName: inputData.appName,
      githubCloneUrl: inputData.githubCloneUrl,
      commitSuccess: result.exitCode === 0,
      commitOutput: result.result,
    }
  },
})

const gitPushStep = createStep({
  id: 'git-push',
  inputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    githubCloneUrl: z.string(),
    commitSuccess: z.boolean(),
    commitOutput: z.string(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    githubCloneUrl: z.string(),
    pushSuccess: z.boolean(),
    pushOutput: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData.commitSuccess) {
      return {
        sandboxId: inputData.sandboxId,
        appName: inputData.appName,
        githubCloneUrl: inputData.githubCloneUrl,
        pushSuccess: false,
        pushOutput: `Skipped: git commit failed — ${inputData.commitOutput}`,
      }
    }
    const sandbox = await getSandbox(inputData.sandboxId)
    const token = await getInstallationToken()
    await pushToGitHubFn(sandbox, inputData.githubCloneUrl, token)
    return {
      sandboxId: inputData.sandboxId,
      appName: inputData.appName,
      githubCloneUrl: inputData.githubCloneUrl,
      pushSuccess: true,
      pushOutput: `Pushed to ${inputData.githubCloneUrl}`,
    }
  },
})

const vercelDeployStep = createStep({
  id: 'vercel-deploy',
  inputSchema: z.object({
    sandboxId: z.string(),
    appName: z.string(),
    githubCloneUrl: z.string(),
    pushSuccess: z.boolean(),
    pushOutput: z.string(),
  }),
  outputSchema: z.object({
    deploymentUrl: z.string(),
    deploymentId: z.string(),
    githubCloneUrl: z.string(),
    status: z.string(),
    error: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData.pushSuccess) {
      return {
        deploymentUrl: '',
        deploymentId: '',
        githubCloneUrl: inputData.githubCloneUrl,
        status: 'skipped',
        error: `Skipped: git push failed — ${inputData.pushOutput}`,
      }
    }

    const vercelToken = process.env.VERCEL_TOKEN
    if (!vercelToken) {
      return {
        deploymentUrl: '',
        deploymentId: '',
        githubCloneUrl: inputData.githubCloneUrl,
        status: 'failed',
        error: 'VERCEL_TOKEN environment variable is required',
      }
    }

    const teamId = process.env.VERCEL_TEAM_ID
    const sandbox = await getSandbox(inputData.sandboxId)
    const files = await downloadDirectory(sandbox, '/workspace')

    const vercelFiles = files.map((f) => ({
      file: f.path,
      data: f.content.toString('base64'),
    }))

    const projectSlug = inputData.appName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const response = await fetch(
      `https://api.vercel.com/v13/deployments${teamId ? `?teamId=${teamId}` : ''}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectSlug,
          files: vercelFiles,
          projectSettings: {
            framework: 'vite',
            buildCommand: 'bun run build',
            devCommand: 'bun run dev',
            installCommand: 'bun install',
            outputDirectory: 'dist',
          },
          target: 'production',
        }),
      },
    )

    if (!response.ok) {
      const errText = await response.text()
      return {
        deploymentUrl: '',
        deploymentId: '',
        githubCloneUrl: inputData.githubCloneUrl,
        status: 'failed',
        error: `Vercel deployment failed: ${errText}`,
      }
    }

    const deployment = (await response.json()) as {
      id: string
      url: string
      readyState: string
    }

    return {
      deploymentUrl: `https://${deployment.url}`,
      deploymentId: deployment.id,
      githubCloneUrl: inputData.githubCloneUrl,
      status: deployment.readyState,
    }
  },
})

export const deployWorkflow = createWorkflow({
  id: 'deploy',
  inputSchema: z.object({
    sandboxId: z.string().describe('Sandbox ID with built code'),
    appName: z.string().describe('Application name'),
    githubCloneUrl: z.string().describe('GitHub clone URL'),
  }),
  outputSchema: z.object({
    deploymentUrl: z.string(),
    deploymentId: z.string(),
    githubCloneUrl: z.string(),
    status: z.string(),
    error: z.string().optional(),
  }),
})
  .then(gitCommitStep)
  .then(gitPushStep)
  .then(vercelDeployStep)
  .commit()

// ============================================================================
// App Generation Workflow — full pipeline replacing supervisor agent network
// Phases: Analyst → Infra → Schema → Migration → CodeGen → Integration → QA
// ============================================================================

/** Final QA gate — combines typecheck + lint + build in a single step */
const finalQAGateStep = createStep({
  id: 'final-qa-gate',
  inputSchema: z.object({ sandboxId: z.string() }),
  outputSchema: z.object({
    sandboxId: z.string(),
    typecheckPassed: z.boolean(),
    typecheckOutput: z.string(),
    lintPassed: z.boolean(),
    lintOutput: z.string(),
    buildPassed: z.boolean(),
    buildOutput: z.string(),
  }),
  execute: async ({ inputData }) => {
    const sandbox = await getSandbox(inputData.sandboxId)

    const tsc = await sandbox.process.executeCommand('tsc --noEmit', '/workspace', undefined, 60)
    const lint = await sandbox.process.executeCommand(
      'npx biome check --write',
      '/workspace',
      undefined,
      30,
    )
    const build = await sandbox.process.executeCommand(
      'bun run build',
      '/workspace',
      undefined,
      120,
    )

    return {
      sandboxId: inputData.sandboxId,
      typecheckPassed: tsc.exitCode === 0,
      typecheckOutput: tsc.result,
      lintPassed: lint.exitCode === 0,
      lintOutput: lint.result,
      buildPassed: build.exitCode === 0,
      buildOutput: build.result,
    }
  },
})

/** Workflow output schema */
const appGenerationOutputSchema = z.object({
  sandboxId: z.string(),
  appName: z.string(),
  supabaseUrl: z.string(),
  githubHtmlUrl: z.string(),
  repoName: z.string(),
  typecheckPassed: z.boolean(),
  lintPassed: z.boolean(),
  buildPassed: z.boolean(),
})

export const appGenerationWorkflow = createWorkflow({
  id: 'app-generation',
  inputSchema: z.object({
    userMessage: z.string().describe('User description of the app to build'),
    projectId: z.string().describe('VibeStack project ID'),
  }),
  outputSchema: appGenerationOutputSchema,
})

// Phase 1: Extract requirements via analyst agent (1 LLM call)
appGenerationWorkflow
  .map(
    async ({ inputData }) => ({
      prompt: inputData.userMessage,
    }),
    { id: 'prepare-analyst-prompt' },
  )
  .then(analystStep)

  // Phase 2: Provision infrastructure in parallel (0 LLM calls)
  .map(
    async ({ getInitData, getStepResult }) => {
      const trigger = getInitData<{ userMessage: string; projectId: string }>()
      const analyst = getStepResult<z.infer<typeof AnalystOutputSchema>>('analyst')
      return { appName: analyst.appName, projectId: trigger.projectId }
    },
    { id: 'prepare-infra-input' },
  )
  .parallel([createSandboxStep, createSupabaseStep, createGitHubRepoStep])

  // Merge parallel results into a flat object
  .map(
    async ({ inputData }) => ({
      sandboxId: (inputData as Record<string, Record<string, string>>)['create-sandbox'].sandboxId,
      supabaseProjectId: (inputData as Record<string, Record<string, string>>)['create-supabase']
        .supabaseProjectId,
      supabaseUrl: (inputData as Record<string, Record<string, string>>)['create-supabase']
        .supabaseUrl,
      supabaseAnonKey: (inputData as Record<string, Record<string, string>>)['create-supabase']
        .supabaseAnonKey,
      githubCloneUrl: (inputData as Record<string, Record<string, string>>)['create-github-repo']
        .githubCloneUrl,
      githubHtmlUrl: (inputData as Record<string, Record<string, string>>)['create-github-repo']
        .githubHtmlUrl,
      repoName: (inputData as Record<string, Record<string, string>>)['create-github-repo']
        .repoName,
    }),
    { id: 'merge-infra' },
  )

  // Phase 3: Generate schema artifacts — deterministic (0 LLM calls)
  .map(
    async ({ inputData, getStepResult }) => {
      const analyst = getStepResult<z.infer<typeof AnalystOutputSchema>>('analyst')
      return {
        contract: analyst.contract,
        sandboxId: (inputData as { sandboxId: string }).sandboxId,
      }
    },
    { id: 'prepare-schema-input' },
  )
  .then(schemaGenerationStep)

  // Phase 4a: Write migration file to sandbox
  .then(writeMigrationStep)

  // Phase 4b: Run migration against Supabase
  .map(
    async ({ getStepResult }) => {
      const infra = getStepResult<{ supabaseProjectId: string }>('merge-infra')
      const schema = getStepResult<{ sql: string }>('schema-generation')
      return { supabaseProjectId: infra.supabaseProjectId, sql: schema.sql }
    },
    { id: 'prepare-run-migration' },
  )
  .then(runMigrationStep)

  // Phase 5: Code generation via PM agent (N LLM calls)
  .map(
    async ({ getStepResult }) => {
      const analyst = getStepResult<z.infer<typeof AnalystOutputSchema>>('analyst')
      const infra = getStepResult<{
        sandboxId: string
        supabaseUrl: string
        supabaseAnonKey: string
      }>('merge-infra')
      const schema = getStepResult<{ sql: string; types: string }>('schema-generation')
      return {
        sandboxId: infra.sandboxId,
        contract: analyst.contract,
        types: schema.types,
        sql: schema.sql,
        appName: analyst.appName,
        appDescription: analyst.appDescription,
        designPreferences: analyst.designPreferences,
        supabaseUrl: infra.supabaseUrl,
        supabaseAnonKey: infra.supabaseAnonKey,
      }
    },
    { id: 'prepare-codegen-input' },
  )
  .then(codeGenStep)

  // Phase 6: Wire barrel exports and app layout — deterministic (0 LLM calls)
  .map(
    async ({ inputData }) => {
      const data = inputData as { sandboxId: string; appName: string; tables: string[] }
      return { sandboxId: data.sandboxId, appName: data.appName, tables: data.tables }
    },
    { id: 'prepare-integration-input' },
  )
  .then(integrationStep)

  // Phase 7: Final QA gate — deterministic (0 LLM calls)
  .map(
    async ({ inputData }) => ({
      sandboxId: (inputData as { sandboxId: string }).sandboxId,
    }),
    { id: 'prepare-qa-input' },
  )
  .then(finalQAGateStep)

  // Assemble final output
  .map(
    async ({ inputData, getStepResult }) => {
      const analyst = getStepResult<z.infer<typeof AnalystOutputSchema>>('analyst')
      const infra = getStepResult<{ githubHtmlUrl: string; repoName: string; supabaseUrl: string }>(
        'merge-infra',
      )
      const qa = inputData as {
        sandboxId: string
        typecheckPassed: boolean
        lintPassed: boolean
        buildPassed: boolean
      }
      return {
        sandboxId: qa.sandboxId,
        appName: analyst.appName,
        supabaseUrl: infra.supabaseUrl,
        githubHtmlUrl: infra.githubHtmlUrl,
        repoName: infra.repoName,
        typecheckPassed: qa.typecheckPassed,
        lintPassed: qa.lintPassed,
        buildPassed: qa.buildPassed,
      }
    },
    { id: 'assemble-output' },
  )
  .commit()
