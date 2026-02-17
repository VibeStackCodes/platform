// server/lib/agents/orchestrator.ts
//
// XState invoke handlers — each function maps to one machine state.
// The machine calls these via fromPromise actors.

import type { SchemaContract, DesignPreferences, TableDef } from '../schema-contract'
import { SchemaContractSchema, DesignPreferencesSchema } from '../schema-contract'
import type { AppBlueprint } from '../app-blueprint'
import { contractToBlueprint } from '../app-blueprint'
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
      designPreferences: DesignPreferences
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
        const designParsed = DesignPreferencesSchema.safeParse(part.input.designPreferences)

        return {
          type: 'done',
          appName: part.input.appName,
          appDescription: part.input.appDescription,
          contract: contractParsed.data,
          designPreferences: designParsed.success ? designParsed.data : { style: 'modern', primaryColor: '#3b82f6', fontFamily: 'Inter' },
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

export function runBlueprint(input: {
  appName: string
  appDescription: string
  contract: SchemaContract
  designPreferences: DesignPreferences
}): BlueprintResult {
  const blueprint = contractToBlueprint(input)
  return { blueprint, tokensUsed: 0 }
}

// ============================================================================
// Code Generation handler (Task 8 + E1 jsonrepair)
// ============================================================================

// Pre-loaded sandbox context to eliminate agent readFile calls
// These come from the warmup-scaffold and don't change between runs
const SANDBOX_CONTEXT = {
  packageJson: `{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-router": "^1.0.0",
    "@supabase/supabase-js": "^2.95.0",
    "valibot": "^1.0.0",
    "@sentry/react": "^9.0.0",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.0",
    "class-variance-authority": "^0.7.1",
    "radix-ui": "^1.1.0",
    "@trpc/client": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "@tanstack/react-query": "^5.0.0",
    "drizzle-orm": "^0.45.0",
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "zod": "^4.0.0"
  }
}`,
  tsConfig: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}`,
  componentList: [
    'Button',
    'Card',
    'CardHeader',
    'CardTitle',
    'CardContent',
    'CardFooter',
    'Input',
    'Label',
    'Select',
    'SelectContent',
    'SelectItem',
    'SelectTrigger',
    'SelectValue',
    'Badge',
    'Dialog',
    'DialogContent',
    'DialogHeader',
    'DialogTitle',
    'DialogTrigger',
    'Table',
    'TableBody',
    'TableCell',
    'TableHead',
    'TableHeader',
    'TableRow',
    'Tabs',
    'TabsContent',
    'TabsList',
    'TabsTrigger',
    'DropdownMenu',
    'DropdownMenuContent',
    'DropdownMenuItem',
    'DropdownMenuTrigger',
    'AlertDialog',
    'Checkbox',
    'Switch',
    'Textarea',
    'Separator',
    'Skeleton',
    'Toast',
    'Sonner',
  ],
}

export function buildFeatureAnalysisPrompt(
  table: TableDef,
  contract: SchemaContract,
  sandboxContext?: { packageJson?: string; tsConfig?: string; componentList?: string[] },
): string {
  const columns = table.columns
    .map((c) => {
      const mods: string[] = [c.type]
      if (c.primaryKey) mods.push('PK')
      if (c.nullable === false) mods.push('NOT NULL')
      if (c.references) mods.push(`FK → ${c.references.table}.${c.references.column}`)
      return `  - ${c.name}: ${mods.join(', ')}`
    })
    .join('\n')

  const related = contract.tables
    .filter((t) => t.name !== table.name)
    .filter(
      (t) =>
        t.columns.some((c) => c.references?.table === table.name) ||
        table.columns.some((c) => c.references?.table === t.name),
    )
    .map((t) => t.name)

  let prompt = `Analyze the "${table.name}" entity and decide how to present it.

Table columns:
${columns}

${related.length > 0 ? `Related tables: ${related.join(', ')}` : ''}

Decide:
1. listColumns: Pick 3-6 most important columns to show in the data table (column names only)
2. headerField: Which column is the page title on the detail view (e.g. "title", "name")
3. enumFields: Which text columns have known enum values? List each with its options array
4. detailSections: Group ALL visible columns into 1-3 named sections (e.g. "Details", "Dates")

Valid column names: ${table.columns.map((c) => c.name).join(', ')}`

  if (sandboxContext) {
    prompt += `\n\n## Pre-loaded Context (DO NOT read these files — they are already provided)

### Available Dependencies (from package.json)
${sandboxContext.packageJson ?? 'Not available'}

### TypeScript Config
${sandboxContext.tsConfig ?? 'Not available'}

### Available UI Components
${sandboxContext.componentList?.join(', ') ?? 'Standard shadcn/ui components'}
`
  }

  return prompt
}

export async function runCodeGeneration(input: {
  blueprint: AppBlueprint
  contract: SchemaContract
  sandboxId: string
  supabaseProjectId: string
  supabaseUrl: string
  supabaseAnonKey: string
}): Promise<CodeGenResult> {
  // Dynamic imports to avoid circular deps and lazy-load assembler dependencies
  const { frontendAgent, backendAgent } = await import('./registry')
  const {
    PageConfigSchema,
    CustomProcedureSchema,
    derivePageFeatureSpec,
    validatePageConfig,
    validateFeatureSpec,
  } = await import('./feature-schema')
  const { assembleListPage, assembleDetailPage, assembleProcedures } = await import('./assembler')
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
        .replace('DATABASE_URL=__PLACEHOLDER__', `DATABASE_URL=${input.supabaseUrl}`)
        .replace('SUPABASE_URL=__PLACEHOLDER__', `SUPABASE_URL=${input.supabaseUrl}`)
        .replace('SUPABASE_ANON_KEY=__PLACEHOLDER__', `SUPABASE_ANON_KEY=${input.supabaseAnonKey}`)
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

  const migrationFile = input.blueprint.fileTree.find((f) => f.path === 'drizzle/0001_initial.sql')
  if (migrationFile) {
    const migResult = await runMigration(input.supabaseProjectId, migrationFile.content)
    if (!migResult.success) {
      console.error(`[codegen] Migration failed: ${migResult.error}`)
    } else {
      console.log('[codegen] Migration applied to Supabase')
    }
  }

  const seedSQL = contractToSeedSQL(input.contract)
  if (seedSQL) {
    const seedResult = await runMigration(input.supabaseProjectId, seedSQL)
    if (!seedResult.success) {
      console.error(`[codegen] Seed failed: ${seedResult.error}`)
      // Non-fatal — app works without seed data, just looks empty
    } else {
      console.log('[codegen] Seed data applied to Supabase')
    }
  }

  const assembledFiles: Array<{ path: string; content: string }> = []
  const validationWarnings: Array<{ table: string; errors: string[] }> = []
  const skippedEntities: string[] = []

  // Filter entity tables (skip junction/system tables)
  const entityTables = input.contract.tables.filter((t) => !t.name.startsWith('_'))

  // Process all entities in parallel
  const entityResults = await Promise.allSettled(
    entityTables.map(async (table) => {
      const files: Array<{ path: string; content: string }> = []
      let tokens = 0
      let warning: { table: string; errors: string[] } | undefined
      let skipped = false

      // ================================================================
      // Simplified structured output + deterministic derivation
      //
      // LLM decides: which columns to show, enum values, section grouping.
      // Everything else (formats, labels, types) derived from contract.
      // ================================================================

      const featurePrompt = buildFeatureAnalysisPrompt(table, input.contract, SANDBOX_CONTEXT)
      const procedurePrompt = `Analyze the "${table.name}" entity and design custom tRPC procedures. Include search, filtering, and any business logic.\n\nThink step-by-step:\n1. What queries would a user need beyond basic CRUD?\n2. What filters make sense for this entity's columns?\n3. What aggregations or computed values would be useful?\n\nDescribe each procedure with: name, purpose, query/mutation, input parameters, and the Drizzle ORM implementation.`

      // Feature config + procedures in parallel (constrained decoding)
      // Temperature set via agent defaultOptions (frontend: 0.3, backend: 0.2)
      const [configResult, procedureResult] = await Promise.allSettled([
        frontendAgent.generate(featurePrompt, {
          maxSteps: 1,
          structuredOutput: { schema: PageConfigSchema },
        }),
        backendAgent.generate(procedurePrompt, {
          maxSteps: 1,
          structuredOutput: { schema: CustomProcedureSchema },
        }),
      ])

      // Process feature config
      if (configResult.status === 'rejected') {
        console.error(`[codegen] Feature config failed for ${table.name}:`, configResult.reason)
        skipped = true
        return { files, tokens, warning, skipped, table: table.name }
      }

      tokens += configResult.value.totalUsage?.totalTokens ?? 0

      // Validate the LLM output
      const configParsed = PageConfigSchema.safeParse(configResult.value.object)
      if (!configParsed.success) {
        console.error(
          `[codegen] PageConfig validation failed for ${table.name}:`,
          configParsed.error.format(),
        )
        skipped = true
        return { files, tokens, warning, skipped, table: table.name }
      }

      // Validate field references before derivation
      const configValidation = validatePageConfig(configParsed.data, input.contract)
      if (!configValidation.valid) {
        warning = { table: table.name, errors: configValidation.errors }
      }

      // Derive full spec deterministically from config + contract
      const featureSpec = derivePageFeatureSpec(configParsed.data, input.contract)

      // Assemble pages deterministically
      const listPageContent = assembleListPage(featureSpec, input.contract)
      const detailPageContent = assembleDetailPage(featureSpec, input.contract)

      // Find the blueprint file paths for this entity's pages
      const entityKebab = table.name.replace(/_/g, '-')
      const entityPlural = entityKebab.endsWith('y')
        ? entityKebab.slice(0, -1) + 'ies'
        : entityKebab.endsWith('s') ||
            entityKebab.endsWith('sh') ||
            entityKebab.endsWith('ch') ||
            entityKebab.endsWith('x')
          ? entityKebab + 'es'
          : entityKebab + 's'

      files.push(
        { path: `src/routes/_authenticated/${entityPlural}.tsx`, content: listPageContent },
        { path: `src/routes/_authenticated/${entityPlural}.$id.tsx`, content: detailPageContent },
      )

      // Process procedure result
      if (procedureResult.status === 'fulfilled') {
        tokens += procedureResult.value.totalUsage?.totalTokens ?? 0

        // Default to empty procedures when LLM returns undefined (common with constrained decoding)
        const procObj = procedureResult.value.object ?? { procedures: [] }
        const procParsed = CustomProcedureSchema.safeParse(procObj)
        if (!procParsed.success) {
          console.warn(
            `[codegen] Procedure schema validation failed for ${table.name}, using empty procedures:`,
            procParsed.error.format(),
          )
        } else {
          const procSpec = procParsed.data

          const routerFile = input.blueprint.fileTree.find(
            (f) => f.path === `server/trpc/routers/${table.name}.ts`,
          )
          if (routerFile) {
            const patchedRouter = assembleProcedures(routerFile.content, procSpec)
            files.push({ path: routerFile.path, content: patchedRouter })
          }
        }
      }

      return { files, tokens, warning, skipped, table: table.name }
    }),
  )

  // Aggregate results
  let totalTokens = 0
  for (const result of entityResults) {
    if (result.status === 'fulfilled') {
      assembledFiles.push(...result.value.files)
      totalTokens += result.value.tokens
      if (result.value.warning) validationWarnings.push(result.value.warning)
      if (result.value.skipped) skippedEntities.push(result.value.table)
    } else {
      console.error('Entity processing failed:', result.reason)
    }
  }

  // Step 3: Write assembled files back to sandbox (overwriting skeleton SLOT files)
  if (assembledFiles.length > 0) {
    console.log(`[codegen] Writing ${assembledFiles.length} assembled files to sandbox...`)
    const assemblyUploads = assembledFiles.map((f) => ({
      content: f.content,
      path: `/workspace/${f.path}`,
    }))
    await uploadFiles(sandbox, assemblyUploads)
    console.log(`[codegen] Assembly complete: ${assembledFiles.length} files overwritten`)
  }

  return {
    assembledFiles,
    tokensUsed: totalTokens,
    warnings: validationWarnings.length > 0 ? validationWarnings : undefined,
    skippedEntities: skippedEntities.length > 0 ? skippedEntities : undefined,
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

  // Create sandbox-bound tools — sandboxId is deterministic, never in prompt
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
1. Only modify files that have errors — do not touch other files
2. Preserve the skeleton structure (imports, hooks, state declarations)
3. Only fix the specific error — do not refactor or add features
4. Use ESM imports (never require())
5. No TODO/FIXME/placeholder comments
6. If a type error is in generated code, fix the type — do not add \`as any\``,
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
// Provisioning handler (bonus — for the provisioning state)
// ============================================================================

export async function runProvisioning(input: {
  appName: string
  projectId: string
  userId?: string
}): Promise<ProvisioningResult> {
  // Run all three infrastructure operations in parallel — they have ZERO dependencies on each other
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

  // Handle failures — any infrastructure failure is fatal
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
// Deployment handler (bonus — for the deploying state)
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
        `Deployment timed out after ${Math.ceil(POLL_TIMEOUT_MS / 1000)}s — last state: ${lastState}`,
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
