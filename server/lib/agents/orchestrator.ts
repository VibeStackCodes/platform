// server/lib/agents/orchestrator.ts
//
// XState invoke handlers — each function maps to one machine state.
// The machine calls these via fromPromise actors.

import type { SchemaContract } from '../schema-contract'
import { SchemaContractSchema, validateContract } from '../schema-contract'
import type { AppBlueprint } from '../app-blueprint'
import { contractToBlueprintWithDesignAgent } from '../app-blueprint'
import type { ValidationGateResult } from './validation'
import { runValidationGate } from './validation'
import { buildRepairPrompt } from './repair'

// ============================================================================
// Result types for each handler
// ============================================================================

export type AnalysisResult =
  | {
      type: 'done'
      appName: string
      appDescription: string
      contract: SchemaContract
      tokensUsed: number
    }
  | {
      type: 'clarification'
      questions: unknown[]
      tokensUsed: number
    }

export interface BlueprintResult {
  blueprint: AppBlueprint
  tokensUsed: number
}

export interface CodeGenResult {
  assembledFiles: Array<{ path: string; content: string }>
  tokensUsed: number
  warnings?: Array<{ table: string; errors: string[] }>
  skippedEntities?: string[]
}

export interface ValidationResult {
  validation: ValidationGateResult
  allPassed: boolean
  tokensUsed: number
}

export interface RepairResult {
  tokensUsed: number
}

export interface ProvisioningResult {
  sandboxId: string
  supabaseProjectId: string
  supabaseUrl: string
  supabaseAnonKey: string
  githubCloneUrl: string
  githubHtmlUrl: string
  repoName: string
  tokensUsed: number
}

export interface DeploymentResult {
  deploymentUrl: string
  tokensUsed: number
}

// ============================================================================
// Analysis handler (Task 6 + E1 jsonrepair)
// ============================================================================

export async function runAnalysis(input: {
  userMessage: string
  projectId: string
}): Promise<AnalysisResult> {
  // Dynamic import to avoid circular deps
  const { analystAgent } = await import('./registry')

  const result = await analystAgent.generate(input.userMessage, {
    maxSteps: 5,
  })

  const tokensUsed = result.totalUsage?.totalTokens ?? 0

  // Extract tool calls from AI SDK v5 content parts
  for (const step of result.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type !== 'tool-call') continue

      if (part.toolName === 'submitRequirements') {
        // Parse contract through Zod schema to apply all z.preprocess() coercions
        // (strips invalid FK refs, normalizes nulls, coerces string defaults, etc.)
        const contractParsed = SchemaContractSchema.safeParse(part.input.contract)
        if (!contractParsed.success) {
          console.error('[analysis] Contract schema validation failed:', contractParsed.error.format())
          throw new Error(`Analyst produced invalid contract: ${contractParsed.error.issues.map(i => i.message).join(', ')}`)
        }

        // Semantic validation: FK references must point to existing tables
        const contractValidation = validateContract(contractParsed.data)
        if (!contractValidation.valid) {
          console.error('[analysis] Contract semantic validation failed:', contractValidation.errors)
          throw new Error(`Analyst produced invalid contract: ${contractValidation.errors.join('; ')}`)
        }

        return {
          type: 'done',
          appName: part.input.appName,
          appDescription: part.input.appDescription,
          contract: contractParsed.data,
          tokensUsed,
        }
      }

      if (part.toolName === 'askClarifyingQuestions') {
        return {
          type: 'clarification',
          questions: part.input.questions,
          tokensUsed,
        }
      }
    }
  }

  throw new Error('Analyst agent did not call any tool')
}

// ============================================================================
// Blueprint handler (Task 7)
// ============================================================================

export async function runBlueprint(input: {
  userPrompt?: string
  appName: string
  appDescription: string
  contract: SchemaContract
}): Promise<BlueprintResult> {
  const blueprint = await contractToBlueprintWithDesignAgent(input)
  return { blueprint, tokensUsed: 0 }
}

// ============================================================================
// Code Generation handler (Task 8 + E1 jsonrepair)
// ============================================================================

export async function runCodeGeneration(input: {
  blueprint: AppBlueprint
  contract: SchemaContract
  sandboxId: string
  supabaseProjectId: string
  supabaseUrl: string
  supabaseAnonKey: string
}): Promise<CodeGenResult> {
  // Dynamic imports to avoid circular deps
  const { getSandbox, uploadFiles } = await import('../sandbox')

  // Step 1: Write ALL blueprint files to sandbox (scaffold)
  const sandbox = await getSandbox(input.sandboxId)
  console.log(`[codegen] Writing ${input.blueprint.fileTree.length} blueprint files to sandbox...`)

  // Create all needed directories first
  const dirs = new Set<string>()
  for (const file of input.blueprint.fileTree) {
    const dir = `/workspace/${file.path}`.split('/').slice(0, -1).join('/')
    dirs.add(dir)
  }
  for (const dir of dirs) {
    try {
      await sandbox.process.executeCommand(`mkdir -p ${dir}`, '/workspace', undefined, 5)
    } catch {
      // ignore if exists
    }
  }

  // Write blueprint files, replacing .env placeholders with real credentials
  const blueprintUploads = input.blueprint.fileTree.map((file) => {
    let content = file.content
    if (file.path === '.env') {
      content = content
        .replace('VITE_SUPABASE_URL=__PLACEHOLDER__', `VITE_SUPABASE_URL=${input.supabaseUrl}`)
        .replace('VITE_SUPABASE_ANON_KEY=__PLACEHOLDER__', `VITE_SUPABASE_ANON_KEY=${input.supabaseAnonKey}`)
    }
    return { content, path: `/workspace/${file.path}` }
  })
  await uploadFiles(sandbox, blueprintUploads)
  console.log(`[codegen] Scaffold complete: ${blueprintUploads.length} files written`)

  // Install dependencies
  console.log('[codegen] Installing dependencies...')
  const installResult = await sandbox.process.executeCommand(
    'bun install --frozen-lockfile 2>&1 || bun install 2>&1',
    '/workspace',
    undefined,
    120,
  )
  if (installResult.exitCode !== 0) {
    console.warn(`[codegen] bun install exit code: ${installResult.exitCode}`)
  }

  // Apply migration + seed SQL to the real Supabase database
  // so the generated app launches with data already populated.
  // Seed SQL is generated in-memory (not shipped in the user's file tree).
  const { runMigration } = await import('../supabase-mgmt')
  const { contractToSeedSQL } = await import('../contract-to-seed')

  const migrationFile = input.blueprint.fileTree.find((f) => f.path === 'supabase/migrations/0001_initial.sql')
  if (migrationFile) {
    const migResult = await runMigration(input.supabaseProjectId, migrationFile.content)
    if (!migResult.success) {
      // FATAL per CLAUDE.md determinism rules — a bad migration means bad SQL generator.
      // Never silently continue: the app would launch with no tables and all queries fail.
      throw new Error(`[codegen] Migration failed — fix the SQL generator, not the symptom: ${migResult.error}`)
    }
    console.log('[codegen] Migration applied to Supabase')
  }

  const seedSQL = await contractToSeedSQL(input.contract)
  if (seedSQL) {
    const seedResult = await runMigration(input.supabaseProjectId, seedSQL)
    if (!seedResult.success) {
      console.error(`[codegen] Seed failed: ${seedResult.error}`)
      // Non-fatal -- app works without seed data, just looks empty
    } else {
      console.log('[codegen] Seed data applied to Supabase')
    }
  }

  // Themed route files are already generated in the blueprint.
  // Do not run legacy design-spec/skill-classifier/assembler overrides.
  const assembledFiles: Array<{ path: string; content: string }> = []
  return {
    assembledFiles,
    tokensUsed: 0,
  }
}

// ============================================================================
// Validation handler (Task 9)
// ============================================================================

export async function runValidation(input: {
  blueprint: AppBlueprint
  sandboxId: string
}): Promise<ValidationResult> {
  // Get sandbox via Daytona
  const { Daytona } = await import('@daytonaio/sdk')
  const daytona = new Daytona()
  const sandbox = await daytona.get(input.sandboxId)

  const validation = await runValidationGate(input.blueprint, sandbox)

  return {
    validation,
    allPassed: validation.allPassed,
    tokensUsed: 0, // No LLM calls in validation
  }
}

// ============================================================================
// Repair handler (Task 9 + E8 JSON Patch)
// ============================================================================

export async function runRepair(input: {
  blueprint: AppBlueprint
  validation: ValidationGateResult
  sandboxId: string
}): Promise<RepairResult> {
  const { Agent } = await import('@mastra/core/agent')
  const { createBoundSandboxTools } = await import('./tools')
  const { createAgentModelResolver } = await import('./provider')

  // Build repair prompt from validation errors
  const skeletons = input.blueprint.fileTree
    .filter((f) => f.isLLMSlot)
    .map((f) => ({ path: f.path, content: f.content }))

  const repairPrompt = buildRepairPrompt(input.validation, skeletons)
  if (!repairPrompt) {
    return { tokensUsed: 0 }
  }

  // Create sandbox-bound tools -- sandboxId is deterministic, never in prompt
  const boundTools = createBoundSandboxTools(input.sandboxId)

  // Create a per-call repair agent with sandbox-bound tools
  const boundRepairAgent = new Agent({
    id: 'repair',
    name: 'Repair Agent',
    model: createAgentModelResolver('repair'),
    description: 'Fixes validation errors in generated code with targeted, minimal changes',
    instructions: `You are the repair agent for VibeStack-generated applications.

You receive specific validation errors (TypeScript, lint, build) and fix them with minimal changes.

Rules:
1. Only modify files that have errors -- do not touch other files
2. Preserve the skeleton structure (imports, hooks, state declarations)
3. Only fix the specific error -- do not refactor or add features
4. Use ESM imports (never require())
5. No TODO/FIXME/placeholder comments
6. If a type error is in generated code, fix the type -- do not add \`as any\``,
    tools: boundTools,
    defaultOptions: { maxSteps: 15 },
  })

  const result = await boundRepairAgent.generate(repairPrompt, {
    maxSteps: 5,
  })

  const tokensUsed = result.totalUsage?.totalTokens ?? 0
  return { tokensUsed }
}

// ============================================================================
// Provisioning handler (bonus -- for the provisioning state)
// ============================================================================

export async function runProvisioning(input: {
  appName: string
  projectId: string
  userId?: string
}): Promise<ProvisioningResult> {
  // Run all three infrastructure operations in parallel -- they have ZERO dependencies on each other
  const [supabaseResult, sandboxResult, githubResult] = await Promise.allSettled([
    // 1. Try warm pool first, fall back to cold creation
    (async () => {
      // Try warm pool if userId is available
      if (input.userId) {
        try {
          const { claimWarmProject } = await import('../supabase-pool')
          const warm = await claimWarmProject(input.userId)
          if (warm) {
            return {
              supabaseProjectId: warm.supabaseProjectId,
              supabaseUrl: warm.supabaseUrl,
              anonKey: warm.anonKey,
              serviceRoleKey: warm.serviceRoleKey,
              dbHost: warm.dbHost,
              dbPassword: warm.dbPassword,
            }
          }
        } catch (error) {
          // Warm pool not available or failed, fall through to cold creation
          console.warn(
            '[provisioning] Warm pool unavailable, falling back to cold creation:',
            error,
          )
        }
      }

      // Fallback: cold creation (60-120s)
      // Add timestamp suffix to avoid name collisions across runs
      const { createSupabaseProject } = await import('../supabase-mgmt')
      const project = await createSupabaseProject(`${input.appName}-${Date.now()}`)
      return {
        supabaseProjectId: project.id,
        supabaseUrl: project.url,
        anonKey: project.anonKey,
        serviceRoleKey: project.serviceRoleKey,
        dbHost: project.dbHost,
        dbPassword: project.dbPassword,
      }
    })(),
    // 2. Create sandbox (~10-20s)
    (async () => {
      const { createSandbox } = await import('../sandbox')
      return createSandbox({
        language: 'typescript',
        autoStopInterval: 60,
        labels: { project: input.projectId },
      })
    })(),
    // 3. Create GitHub repo (~2-5s)
    (async () => {
      const { createRepo, buildRepoName } = await import('../github')
      return createRepo(buildRepoName(input.appName, input.projectId))
    })(),
  ])

  // Handle failures -- any infrastructure failure is fatal
  if (supabaseResult.status === 'rejected') {
    throw new Error(`Supabase provisioning failed: ${supabaseResult.reason}`)
  }
  if (sandboxResult.status === 'rejected') {
    throw new Error(`Sandbox creation failed: ${sandboxResult.reason}`)
  }
  if (githubResult.status === 'rejected') {
    throw new Error(`GitHub repo creation failed: ${githubResult.reason}`)
  }

  const supabase = supabaseResult.value
  const sandbox = sandboxResult.value
  const github = githubResult.value

  return {
    sandboxId: sandbox.id,
    supabaseProjectId: supabase.supabaseProjectId,
    supabaseUrl: supabase.supabaseUrl,
    supabaseAnonKey: supabase.anonKey,
    githubCloneUrl: github.cloneUrl,
    githubHtmlUrl: github.htmlUrl,
    repoName: github.repoName,
    tokensUsed: 0,
  }
}

// ============================================================================
// Deployment handler (bonus -- for the deploying state)
// ============================================================================

/**
 * Fetch with timeout protection
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 30_000, ...fetchOptions } = options
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

export async function runDeployment(input: {
  sandboxId: string
  projectId: string
  contract?: SchemaContract | null
  blueprint?: AppBlueprint | null
  supabaseProjectId?: string | null
  githubCloneUrl?: string | null
}): Promise<DeploymentResult> {
  // Lazy imports to avoid circular dependencies
  const { getSandbox, runCommand, downloadDirectory } = await import('../sandbox')
  const { updateProject } = await import('../db/queries')
  const { buildAppSlug } = await import('../slug')
  const { db } = await import('../db/client')
  const { eq } = await import('drizzle-orm')
  const { projects } = await import('../db/schema')
  const Sentry = await import('@sentry/node')

  try {
    // 1. Get sandbox
    const sandbox = await getSandbox(input.sandboxId)

    // 2. Build file manifest from source files for generation state persistence
    const sourceFiles = await downloadDirectory(sandbox, '/workspace')
    const fileManifest: Record<string, string> = {}
    for (const file of sourceFiles) {
      const hash = `${file.content.length}:${Buffer.from(file.content).toString('base64').slice(0, 16)}`
      fileManifest[file.path] = hash
    }

    // 3. Persist generation state early (enables iterative editing even if deployment fails)
    await updateProject(input.projectId, {
      generationState: {
        contract: input.contract ?? null,
        blueprint: input.blueprint ?? null,
        sandboxId: input.sandboxId,
        supabaseProjectId: input.supabaseProjectId ?? null,
        githubRepo: input.githubCloneUrl ?? null,
        fileManifest,
        lastEditedAt: new Date().toISOString(),
      },
    })

    // 4. Get project details from DB for deployment
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1)

    if (!project) {
      throw new Error(`Project ${input.projectId} not found`)
    }

    // 5. Write production env vars
    const envContent = [
      project.supabaseUrl ? `VITE_SUPABASE_URL=${project.supabaseUrl}` : '',
      project.supabaseAnonKey ? `VITE_SUPABASE_ANON_KEY=${project.supabaseAnonKey}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    if (envContent) {
      await sandbox.fs.uploadFile(Buffer.from(envContent + '\n'), '/workspace/.env.production')
    }

    // 6. Production build
    const buildResult = await runCommand(sandbox, 'bun run build', 'deploy-build', {
      cwd: '/workspace',
      timeout: 120,
    })

    if (buildResult.exitCode !== 0) {
      const output = buildResult.stdout?.slice(-2000) || ''
      const stderr = buildResult.stderr?.slice(-1000) || ''
      throw new Error(
        `Production build failed (exit code ${buildResult.exitCode}):\n${output}\n${stderr}`,
      )
    }

    // 7. Download dist/ for Vercel deployment
    const builtFiles = await downloadDirectory(sandbox, '/workspace/dist')

    // 8. Deploy to Vercel
    const vercelToken = process.env.VERCEL_TOKEN
    if (!vercelToken) {
      throw new Error('VERCEL_TOKEN environment variable is required for deployment')
    }

    const teamId = process.env.VERCEL_TEAM_ID
    const slug = (project.name || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-')

    const vercelFiles = builtFiles.map((f) => ({
      file: f.path,
      data: f.content.toString('base64'),
    }))

    const envVars: Record<string, string> = {}
    if (project.supabaseUrl) envVars.VITE_SUPABASE_URL = project.supabaseUrl
    if (project.supabaseAnonKey) envVars.VITE_SUPABASE_ANON_KEY = project.supabaseAnonKey

    // Deploy with retry (max 2 attempts)
    let deployResponse: Response | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      deployResponse = await fetchWithTimeout(
        `https://api.vercel.com/v13/deployments${teamId ? `?teamId=${teamId}` : ''}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: slug,
            files: vercelFiles,
            projectSettings: {
              framework: 'vite',
              buildCommand: 'bun run build',
              devCommand: 'bun run dev',
              installCommand: 'bun install',
              outputDirectory: 'dist',
            },
            target: 'production',
            ...(Object.keys(envVars).length > 0 ? { env: envVars } : {}),
          }),
          timeout: 60_000,
        },
      )
      if (deployResponse.ok || deployResponse.status < 500) break
      if (attempt < 1) {
        console.warn(`[deployment] Vercel returned ${deployResponse.status}, retrying...`)
        await new Promise((r) => setTimeout(r, 2000))
      }
    }

    if (!deployResponse!.ok) {
      const error = await deployResponse!.text()
      throw new Error(`Vercel deployment failed: ${error}`)
    }

    const deployment = (await deployResponse!.json()) as { id: string; url: string }
    let deploymentUrl = `https://${deployment.url}`

    // Poll with explicit timeout
    const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
    const POLL_INTERVAL_MS = 5_000
    const pollStart = Date.now()
    let lastState = 'UNKNOWN'

    while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
      const statusRes = await fetchWithTimeout(
        `https://api.vercel.com/v13/deployments/${deployment.id}${teamId ? `?teamId=${teamId}` : ''}`,
        {
          headers: { Authorization: `Bearer ${vercelToken}` },
          timeout: 10_000,
        },
      )

      if (statusRes.ok) {
        const status = (await statusRes.json()) as { readyState: string }
        lastState = status.readyState
        if (status.readyState === 'READY') {
          console.log(`[deployment] Deployment ready: ${deploymentUrl}`)
          break
        }
        if (status.readyState === 'ERROR' || status.readyState === 'CANCELED') {
          throw new Error(`Deployment ${status.readyState}`)
        }
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    if (lastState !== 'READY') {
      throw new Error(
        `Deployment timed out after ${Math.ceil(POLL_TIMEOUT_MS / 1000)}s -- last state: ${lastState}`,
      )
    }

    // 9. Optional: assign custom domain
    const wildcardDomain = process.env.VERCEL_WILDCARD_DOMAIN
    if (wildcardDomain) {
      const appSlug = buildAppSlug(project.name, input.projectId)
      const customDomain = `${appSlug}.${wildcardDomain}`

      const domainResponse = await fetchWithTimeout(
        `https://api.vercel.com/v10/projects/${slug}/domains${teamId ? `?teamId=${teamId}` : ''}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: customDomain }),
          timeout: 10_000,
        },
      )

      if (domainResponse.ok) {
        deploymentUrl = `https://${customDomain}`
        console.log(`[deployment] Custom domain assigned: ${deploymentUrl}`)
      } else {
        console.warn(`[deployment] Custom domain assignment failed: ${await domainResponse.text()}`)
      }
    }

    // 10. Update project record with deployment URL
    await updateProject(input.projectId, {
      deployUrl: deploymentUrl,
      status: 'deployed',
    })

    return {
      deploymentUrl,
      tokensUsed: 0,
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { operation: 'deployment' },
      extra: { sandboxId: input.sandboxId, projectId: input.projectId },
    })
    throw error
  }
}
