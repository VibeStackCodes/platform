// server/lib/agents/orchestrator.ts
//
// XState invoke handlers — each function maps to one machine state.
// The machine calls these via fromPromise actors.

import { jsonrepair } from 'jsonrepair'
import type { SchemaContract, DesignPreferences, TableDef } from '../schema-contract'
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
        return {
          type: 'done',
          appName: part.input.appName,
          appDescription: part.input.appDescription,
          contract: part.input.contract,
          designPreferences: part.input.designPreferences,
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

export function buildFeatureAnalysisPrompt(table: TableDef, contract: SchemaContract): string {
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

  return `Analyze the "${table.name}" entity and produce a PageFeatureSpec.

Table columns:
${columns}

${related.length > 0 ? `Related tables: ${related.join(', ')}` : ''}

Rules:
- Every field/searchField/sortDefault MUST be one of: ${table.columns.map((c) => c.name).join(', ')}
- Use 'badge' format for status/enum fields, 'date' for timestamps, 'boolean' for booleans
- Skip auto-managed fields (id, created_at, updated_at, user_id) from create/edit forms
- Use 'select' inputType for enum-like text fields with known values
- Provide a friendly emptyStateMessage
- For filters, use 'search' for text fields, 'select' for enum-like fields, 'boolean' for boolean columns`
}

export async function runCodeGeneration(input: {
  blueprint: AppBlueprint
  contract: SchemaContract
  sandboxId: string
}): Promise<CodeGenResult> {
  // Dynamic imports to avoid circular deps and lazy-load assembler dependencies
  const { frontendAgent, backendAgent } = await import('./registry')
  const { PageFeatureSchema, CustomProcedureSchema, validateFeatureSpec } = await import(
    './feature-schema'
  )
  const { assembleListPage, assembleDetailPage, assembleProcedures } = await import('./assembler')

  let totalTokens = 0
  const assembledFiles: Array<{ path: string; content: string }> = []
  const validationWarnings: Array<{ table: string; errors: string[] }> = []
  const skippedEntities: string[] = []

  // For each entity table, run feature analysis + procedure generation in parallel
  for (const table of input.contract.tables) {
    // Skip junction/system tables
    if (table.name.startsWith('_')) continue

    // 1. Feature analysis — LLM returns PageFeatureSpec via structured output
    const featurePrompt = buildFeatureAnalysisPrompt(table, input.contract)

    const [featureResult, procedureResult] = await Promise.allSettled([
      frontendAgent.generate(featurePrompt, {
        structuredOutput: { schema: PageFeatureSchema },
        maxSteps: 1,
      }),
      backendAgent.generate(
        `Generate custom tRPC procedures for the "${table.name}" entity. Include search, filtering, and any business logic.`,
        {
          structuredOutput: { schema: CustomProcedureSchema },
          maxSteps: 1,
        },
      ),
    ])

    // 2. Parse feature spec with jsonrepair (E1)
    if (featureResult.status === 'rejected') {
      console.error(`Feature analysis failed for ${table.name}:`, featureResult.reason)
      skippedEntities.push(table.name)
      continue // Skip this entity
    }

    totalTokens += featureResult.value.totalUsage?.totalTokens ?? 0

    // Validate the feature spec with Zod
    const featureParsed = PageFeatureSchema.safeParse(
      featureResult.value.object ?? featureResult.value,
    )
    if (!featureParsed.success) {
      console.error(`Feature spec validation failed for ${table.name}:`, featureParsed.error.format())
      skippedEntities.push(table.name)
      continue
    }

    const featureSpec = featureParsed.data

    // Validate against contract
    const validation = validateFeatureSpec(featureSpec, input.contract)
    if (!validation.valid) {
      validationWarnings.push({ table: table.name, errors: validation.errors })
      // Continue with what we have — the assembler handles missing fields gracefully
    }

    // 3. Assemble pages deterministically
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

    assembledFiles.push(
      { path: `src/routes/_authenticated/${entityPlural}.tsx`, content: listPageContent },
      { path: `src/routes/_authenticated/${entityPlural}.$id.tsx`, content: detailPageContent },
    )

    // 4. Assemble custom procedures
    if (procedureResult.status === 'fulfilled') {
      totalTokens += procedureResult.value.totalUsage?.totalTokens ?? 0

      // Validate the procedure spec with Zod
      const procParsed = CustomProcedureSchema.safeParse(
        procedureResult.value.object ?? procedureResult.value,
      )
      if (!procParsed.success) {
        console.error(
          `Procedure spec validation failed for ${table.name}:`,
          procParsed.error.format(),
        )
        // Skip custom procedures but keep the base router
      } else {
        const procSpec = procParsed.data

        // Find the tRPC router in the blueprint
        const routerFile = input.blueprint.fileTree.find(
          (f) => f.path === `server/trpc/routers/${table.name}.ts`,
        )
        if (routerFile) {
          const patchedRouter = assembleProcedures(routerFile.content, procSpec)
          assembledFiles.push({ path: routerFile.path, content: patchedRouter })
        }
      }
    }
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
  const { repairAgent } = await import('./registry')

  // Build repair prompt from validation errors
  const skeletons = input.blueprint.fileTree
    .filter((f) => f.isLLMSlot)
    .map((f) => ({ path: f.path, content: f.content }))

  const repairPrompt = buildRepairPrompt(input.validation, skeletons)
  if (!repairPrompt) {
    return { tokensUsed: 0 }
  }

  const result = await repairAgent.generate(repairPrompt, {
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
}): Promise<ProvisioningResult> {
  // This will be wired to create Daytona sandbox + Supabase project
  // For now, return placeholder — real implementation needs sandbox.ts + supabase-mgmt.ts
  return {
    sandboxId: '',
    supabaseProjectId: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    githubCloneUrl: '',
    githubHtmlUrl: '',
    repoName: '',
    tokensUsed: 0,
  }
}

// ============================================================================
// Deployment handler (bonus — for the deploying state)
// ============================================================================

export async function runDeployment(input: {
  sandboxId: string
  projectId: string
}): Promise<DeploymentResult> {
  // Placeholder — real implementation needs Vercel deployment
  return {
    deploymentUrl: '',
    tokensUsed: 0,
  }
}
