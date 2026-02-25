#!/usr/bin/env bun
/**
 * Local E2E Renderer Verification — No provisioning, no sandbox, no deploy.
 *
 * Runs the real LLM pipeline (analyst + design agent) for multiple prompts,
 * then writes generated files to /tmp and validates locally via tsc --noEmit.
 *
 * Usage:
 *   bun scripts/local-e2e-renderer-test.ts                  # all prompts
 *   bun scripts/local-e2e-renderer-test.ts --prompt=1       # single prompt
 *   bun scripts/local-e2e-renderer-test.ts --prompt=1,3     # specific prompts
 *   bun scripts/local-e2e-renderer-test.ts --keep           # keep /tmp dirs
 *
 * Requires: OPENAI_API_KEY in .env.local (reads automatically via bun)
 * Optional: LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY for observability
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// ============================================================================
// Test Prompts (from docs/test-prompts.md)
// ============================================================================

interface TestPrompt {
  id: number
  name: string
  prompt: string
  hint: string
}

const TEST_PROMPTS: TestPrompt[] = [
  {
    id: 1,
    name: 'Bookmarks Manager (simple CRUD)',
    prompt: `Build a personal bookmarks manager. Users can save URLs with a title, description,
and tags. They can search bookmarks by title or tag, and star their favorites.`,
    hint: 'Auth app — simple CRUD with search and favorites',
  },
  {
    id: 2,
    name: 'Team Task Board (multi-role)',
    prompt: `Build a team task board with 2 roles: Admin and Member. Admins can create projects,
invite members, and see all tasks across projects. Members can only see tasks in
projects they belong to. Tasks have status (todo, in-progress, done), priority
(low, medium, high), and assignee. Include a real-time activity feed that shows
when tasks are moved between columns.`,
    hint: 'Auth app — multi-role, kanban board, realtime feed',
  },
  {
    id: 3,
    name: 'Personal Finance Tracker (dashboard)',
    prompt: `Build a personal finance tracker. Users log income and expenses with category, amount,
date, and notes. Categories include: Food, Transport, Entertainment, Bills, Shopping,
Income, and Other.

The dashboard shows:
- Monthly spending breakdown as a pie chart
- Income vs expenses trend as a line chart (last 6 months)
- Top 5 spending categories this month
- Running balance

Users can filter transactions by date range and category, and export to CSV.`,
    hint: 'Auth app — dashboard with charts, filtering, CSV export',
  },
  {
    id: 4,
    name: 'Recipe Website + Blog (capability)',
    prompt: 'Build a recipe website with a public blog and authoring admin.',
    hint: 'Capability composition: auth + public-website + recipes + blog',
  },
]

// ============================================================================
// CLI args
// ============================================================================

const keepDirs = process.argv.includes('--keep')
const promptArg = process.argv.find((a) => a.startsWith('--prompt='))
const selectedIds = promptArg
  ? promptArg.split('=')[1].split(',').map(Number)
  : TEST_PROMPTS.map((p) => p.id)

const selectedPrompts = TEST_PROMPTS.filter((p) => selectedIds.includes(p.id))

// ============================================================================
// Logging
// ============================================================================

const globalStart = Date.now()

function elapsed(): string {
  return `[${((Date.now() - globalStart) / 1000).toFixed(1)}s]`
}

function log(msg: string) {
  console.log(`${elapsed()} ${msg}`)
}

function logError(msg: string, error: unknown) {
  const errMsg = error instanceof Error ? error.message : String(error)
  console.error(`${elapsed()} ERROR: ${msg}: ${errMsg}`)
  if (error instanceof Error && error.stack) {
    console.error(error.stack.split('\n').slice(0, 5).join('\n'))
  }
}

// ============================================================================
// Local tsc validation (same pattern as themed-dry-run.test.ts)
// ============================================================================

interface ValidationResult {
  tmpDir: string
  fileCount: number
  routeFiles: string[]
  tscPassed: boolean
  tscErrors: string[]
}

function validateLocally(
  appName: string,
  fileTree: Array<{ path: string; content: string; layer?: number; isLLMSlot?: boolean }>,
): ValidationResult {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const tmpDir = join('/tmp', `vibestack-local-e2e-${slug}-${Date.now()}`)

  // Write all files from the blueprint
  for (const file of fileTree) {
    const filePath = join(tmpDir, file.path)
    mkdirSync(join(filePath, '..'), { recursive: true })
    writeFileSync(filePath, file.content)
  }

  // Write tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: '.',
      paths: { '@/*': ['./src/*'] },
      types: ['vite/client'],
    },
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    exclude: ['node_modules'],
  }
  writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

  // Symlink node_modules from project root
  const projectRoot = join(import.meta.dirname, '..')
  try {
    execFileSync('ln', ['-sf', join(projectRoot, 'node_modules'), join(tmpDir, 'node_modules')])
  } catch {
    // ignore if symlink already exists
  }

  // Collect route files for reporting
  const routeFiles = fileTree
    .filter((f) => f.path.startsWith('src/routes/') && f.path.endsWith('.tsx'))
    .map((f) => f.path)

  // Run tsc --noEmit
  let tscOutput = ''
  try {
    tscOutput = execFileSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: tmpDir,
    })
  } catch (error: any) {
    tscOutput = (error.stdout ?? '') + (error.stderr ?? '')
  }

  // Filter known false-positive route-tree errors
  // TanStack Router emits type errors when routes aren't registered in routeTree.gen.ts.
  // These are expected in our isolated test environment (no real route tree).
  const errors = tscOutput.split('\n').filter((line) => {
    if (!line.includes('error TS')) return false
    if (line.includes("is not assignable to parameter of type 'undefined'")) return false
    if (line.includes("Property 'search' is missing")) return false
    if (/is not assignable to type '"\."/.test(line)) return false
    if (/Type '"\/[^"]*"' is not assignable/.test(line)) return false
    // Template literal route types: Type '`/categories/${string}`' is not assignable
    if (/Type '`\/[^`]*`' is not assignable/.test(line)) return false
    // Catch-all: any "is not assignable to type" involving route path strings
    if (line.includes("is not assignable to type '\"") && line.includes('"."')) return false
    return true
  })

  return {
    tmpDir,
    fileCount: fileTree.length,
    routeFiles,
    tscPassed: errors.length === 0,
    tscErrors: errors,
  }
}

// ============================================================================
// Run one prompt through the pipeline
// ============================================================================

interface PromptResult {
  id: number
  name: string
  appName: string | null
  tables: string[]
  theme: string | null
  authPosture: string | null
  fileCount: number
  routeFiles: string[]
  tscPassed: boolean
  tscErrors: string[]
  tmpDir: string
  analysisDurationMs: number
  blueprintDurationMs: number
  analysisTokens: number
  error: string | null
}

async function runPrompt(prompt: TestPrompt): Promise<PromptResult> {
  const result: PromptResult = {
    id: prompt.id,
    name: prompt.name,
    appName: null,
    tables: [],
    theme: null,
    authPosture: null,
    fileCount: 0,
    routeFiles: [],
    tscPassed: false,
    tscErrors: [],
    tmpDir: '',
    analysisDurationMs: 0,
    blueprintDurationMs: 0,
    analysisTokens: 0,
    error: null,
  }

  try {
    // --- Phase 1: Analysis (LLM) ---
    log(`[${prompt.id}] Running analyst agent...`)
    const { runAnalysis } = await import('../server/lib/agents/orchestrator')

    const t1 = Date.now()
    let analysisResult = await runAnalysis({
      userMessage: prompt.prompt,
      projectId: `local-e2e-${prompt.id}-${Date.now()}`,
    })

    // If analyst asks for clarification, retry with hint
    if (analysisResult.type === 'clarification') {
      log(`[${prompt.id}] Analyst asked for clarification — retrying with hint...`)
      analysisResult = await runAnalysis({
        userMessage: `${prompt.prompt}\n\nAdditional context: ${prompt.hint}`,
        projectId: `local-e2e-${prompt.id}-${Date.now()}`,
      })
    }

    result.analysisDurationMs = Date.now() - t1

    if (analysisResult.type !== 'done') {
      result.error = 'Analyst did not produce requirements after hint retry'
      return result
    }

    result.appName = analysisResult.appName
    result.tables = analysisResult.contract.tables.map((t) => t.name)
    result.analysisTokens = analysisResult.tokensUsed ?? 0

    log(`[${prompt.id}] App: ${analysisResult.appName}`)
    log(`[${prompt.id}] Tables (${result.tables.length}): ${result.tables.join(', ')}`)

    // --- Phase 2: Blueprint (LLM for Design Agent + deterministic code gen) ---
    log(`[${prompt.id}] Running blueprint (design agent + code gen)...`)
    const { runBlueprint } = await import('../server/lib/agents/orchestrator')

    const t2 = Date.now()
    const blueprintResult = await runBlueprint({
      userPrompt: prompt.prompt,
      appName: analysisResult.appName,
      appDescription: analysisResult.appDescription,
      contract: analysisResult.contract,
    })
    result.blueprintDurationMs = Date.now() - t2

    const blueprint = blueprintResult.blueprint
    result.fileCount = blueprint.fileTree.length
    result.theme = blueprint.meta?.themeName ?? null
    result.authPosture = blueprint.meta?.authPosture ?? null

    log(`[${prompt.id}] Theme: ${result.theme ?? 'unknown'}`)
    log(`[${prompt.id}] Auth: ${result.authPosture ?? 'unknown'}`)
    log(`[${prompt.id}] Files: ${blueprint.fileTree.length}`)

    // --- Phase 3: Local validation (tsc --noEmit) ---
    log(`[${prompt.id}] Writing to /tmp and running tsc --noEmit...`)
    const validation = validateLocally(analysisResult.appName, blueprint.fileTree)

    result.routeFiles = validation.routeFiles
    result.tscPassed = validation.tscPassed
    result.tscErrors = validation.tscErrors
    result.tmpDir = validation.tmpDir

    if (validation.tscPassed) {
      log(`[${prompt.id}] tsc: PASS (${validation.routeFiles.length} route files)`)
    } else {
      log(`[${prompt.id}] tsc: FAIL (${validation.tscErrors.length} errors)`)
      for (const err of validation.tscErrors.slice(0, 10)) {
        log(`  ${err.slice(0, 200)}`)
      }
    }

    // Clean up unless --keep
    if (!keepDirs) {
      try {
        rmSync(validation.tmpDir, { recursive: true, force: true })
      } catch {
        // non-fatal
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    logError(`[${prompt.id}] Pipeline failed`, error)
  }

  return result
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log(`=== Local E2E Renderer Verification ===`)
  log(`Prompts: ${selectedPrompts.map((p) => `#${p.id}`).join(', ')}`)
  log(`Keep /tmp dirs: ${keepDirs}`)
  log('')

  const results: PromptResult[] = []

  // Run prompts sequentially (LLM calls should not be parallelized to avoid rate limits)
  for (const prompt of selectedPrompts) {
    log(`\n${'─'.repeat(60)}`)
    log(`Prompt #${prompt.id}: ${prompt.name}`)
    log(`${'─'.repeat(60)}`)

    const result = await runPrompt(prompt)
    results.push(result)
  }

  // ============================================================================
  // Summary Report
  // ============================================================================

  const totalDuration = Date.now() - globalStart
  const totalTokens = results.reduce((sum, r) => sum + r.analysisTokens, 0)

  log(`\n${'═'.repeat(60)}`)
  log(`LOCAL E2E RENDERER VERIFICATION — SUMMARY`)
  log(`${'═'.repeat(60)}\n`)

  // Table header
  const colW = { id: 3, name: 30, tables: 6, files: 5, routes: 6, tsc: 6, time: 7 }
  log(
    `| ${'#'.padEnd(colW.id)} | ${'App'.padEnd(colW.name)} | ${'Tbls'.padEnd(colW.tables)} | ${'Files'.padEnd(colW.files)} | ${'Routes'.padEnd(colW.routes)} | ${'TSC'.padEnd(colW.tsc)} | ${'Time'.padEnd(colW.time)} |`,
  )
  log(`|${'-'.repeat(colW.id + 2)}|${'-'.repeat(colW.name + 2)}|${'-'.repeat(colW.tables + 2)}|${'-'.repeat(colW.files + 2)}|${'-'.repeat(colW.routes + 2)}|${'-'.repeat(colW.tsc + 2)}|${'-'.repeat(colW.time + 2)}|`)

  for (const r of results) {
    const tscStatus = r.error ? 'ERR' : r.tscPassed ? 'PASS' : 'FAIL'
    const totalTime = ((r.analysisDurationMs + r.blueprintDurationMs) / 1000).toFixed(0) + 's'
    const appDisplay = (r.appName ?? r.name).slice(0, colW.name)

    log(
      `| ${String(r.id).padEnd(colW.id)} | ${appDisplay.padEnd(colW.name)} | ${String(r.tables.length).padEnd(colW.tables)} | ${String(r.fileCount).padEnd(colW.files)} | ${String(r.routeFiles.length).padEnd(colW.routes)} | ${tscStatus.padEnd(colW.tsc)} | ${totalTime.padEnd(colW.time)} |`,
    )
  }

  log('')
  log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`)
  log(`Total analysis tokens: ${totalTokens}`)
  log(`Passed: ${results.filter((r) => r.tscPassed).length}/${results.length}`)

  // Detail section for failures
  const failures = results.filter((r) => !r.tscPassed || r.error)
  if (failures.length > 0) {
    log(`\n--- FAILURES ---`)
    for (const f of failures) {
      log(`\n[${f.id}] ${f.name}`)
      if (f.error) {
        log(`  Error: ${f.error}`)
      } else {
        log(`  TSC errors (${f.tscErrors.length}):`)
        for (const err of f.tscErrors.slice(0, 15)) {
          log(`    ${err.slice(0, 200)}`)
        }
      }
      if (f.tmpDir && existsSync(f.tmpDir)) {
        log(`  Dir: ${f.tmpDir}`)
      }
    }
  }

  // Detail section for route files generated
  log(`\n--- GENERATED ROUTES ---`)
  for (const r of results) {
    if (r.routeFiles.length === 0) continue
    log(`\n[${r.id}] ${r.appName ?? r.name} (theme: ${r.theme}, auth: ${r.authPosture})`)
    for (const route of r.routeFiles.sort()) {
      log(`  ${route}`)
    }
  }

  // Exit code
  const allPassed = results.every((r) => r.tscPassed && !r.error)
  if (!allPassed) {
    log(`\nExit: 1 (failures detected)`)
    process.exit(1)
  }
  log(`\nAll ${results.length} apps passed local validation.`)
}

main().catch((err) => {
  logError('Fatal', err)
  process.exit(1)
})
