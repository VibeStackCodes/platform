#!/usr/bin/env bun
/**
 * LLM Full-Page Generation Experiment
 *
 * Tests the hypothesis: can gpt-5.2-codex generate pixel-perfect pages in
 * 1-shot prompting, surpassing the section composition engine?
 *
 * Pipeline:
 *   1. Analyst (gpt-5.2) → SchemaContract + app description
 *   2. Design Agent (gpt-5.2) → ThemeTokens + merged contract
 *   3. Creative Director (two-stage) → CreativeSpec (visual DNA + sitemap)
 *   4. Page Generation (parallel gpt-5.2-codex) → full .tsx files per route
 *   5. Assembly (deterministic) → all scaffold files + route tree
 *   6. Validation → static analysis + tsc --noEmit
 *
 * Tracks token usage and estimated cost per phase and total.
 *
 * Usage:
 *   bun scripts/llm-fullpage-experiment.ts                    # default prompt (RecipePress)
 *   bun scripts/llm-fullpage-experiment.ts --prompt="Build a personal finance tracker..."
 *   bun scripts/llm-fullpage-experiment.ts --keep             # keep /tmp dirs
 */

import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Pricing per 1M tokens (as of Feb 2026 — update if changed)
const PRICING = {
  'gpt-5.2': { input: 2.50, output: 10.0 },
  'gpt-5.2-codex': { input: 2.50, output: 10.0 },
} as const

const DEFAULT_PROMPT = `Build a real estate agency landing page.
The homepage should have a hero section with a search bar, featured property listings,
neighborhood guides, agent profiles, testimonials from happy homebuyers,
a "Why choose us" section, and a newsletter signup. Include pages for
About Us, Our Properties (gallery with static listings), Contact, and Blog
with 3-4 sample articles. Everything is static — no database, no admin.
It should feel premium, trustworthy, and modern.`

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const keepDirs = process.argv.includes('--keep')
const promptArg = process.argv.find((a) => a.startsWith('--prompt='))
const userPrompt = promptArg ? promptArg.split('=').slice(1).join('=') : DEFAULT_PROMPT

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

interface TokenUsage {
  phase: string
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  durationMs: number
}

const tokenLog: TokenUsage[] = []

function trackUsage(phase: string, model: string, input: number, output: number, durationMs: number) {
  const pricing = PRICING[model as keyof typeof PRICING] ?? { input: 2.5, output: 10.0 }
  const cost = (input * pricing.input + output * pricing.output) / 1_000_000
  tokenLog.push({ phase, model, inputTokens: input, outputTokens: output, cost, durationMs })
  log(`  [cost] ${model} — ${input} in / ${output} out — $${cost.toFixed(4)} (${(durationMs / 1000).toFixed(1)}s)`)
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const globalStart = Date.now()

function elapsed(): string {
  return `[${((Date.now() - globalStart) / 1000).toFixed(1)}s]`
}

function log(msg: string) {
  console.log(`${elapsed()} ${msg}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('=== LLM Full-Page Generation Experiment ===')
  log(`Prompt: ${userPrompt.slice(0, 100)}...`)
  log(`Keep dirs: ${keepDirs}`)
  log('')

  // Initialize Helicone context
  const { setGlobalHeliconeContext } = await import(
    '../server/lib/agents/provider'
  )
  setGlobalHeliconeContext({
    userId: '00000000-0000-4000-8000-00000000exp1',
    projectId: 'llm-fullpage-experiment',
    sessionId: `fullpage-${Date.now()}`,
    environment: 'experiment',
  })

  // --- Phase 1: Analyst ---
  log('Phase 1: Running analyst agent...')
  const { runAnalysis } = await import('../server/lib/agents/orchestrator')

  const t1 = Date.now()
  let analysisResult = await runAnalysis({
    userMessage: userPrompt,
    projectId: `fullpage-exp-${Date.now()}`,
  })

  if (analysisResult.type === 'clarification') {
    log('  Analyst asked for clarification — retrying with hint...')
    analysisResult = await runAnalysis({
      userMessage: `${userPrompt}\n\nAdditional: This is a recipe website with blog, categories, ingredients, and step-by-step instructions.`,
      projectId: `fullpage-exp-${Date.now()}`,
    })
  }

  if (analysisResult.type !== 'done') {
    log('ERROR: Analyst did not produce requirements')
    process.exit(1)
  }

  trackUsage('analyst', 'gpt-5.2', analysisResult.tokensUsed ?? 0, 0, Date.now() - t1)
  log(`  App: ${analysisResult.appName}`)
  log(`  Tables: ${analysisResult.contract.tables.map((t) => t.name).join(', ')}`)

  // --- Phase 2: Design Agent ---
  log('\nPhase 2: Running design agent...')
  const { runDesignAgent } = await import('../server/lib/agents/design-agent')

  const t2 = Date.now()
  const designResult = await runDesignAgent(analysisResult.appName, userPrompt)
  trackUsage('design', 'gpt-5.2', 0, 0, Date.now() - t2)

  const tokens = designResult.tokens
  log(`  Fonts: ${tokens.fonts.display} / ${tokens.fonts.body}`)
  log(`  Card style: ${tokens.style.cardStyle}, Nav: ${tokens.style.navStyle}`)

  // --- Phase 3: Creative Director ---
  log('\nPhase 3: Running creative director...')
  const { runCreativeDirector } = await import('../server/lib/creative-director')

  const t3 = Date.now()
  const cdResult = await runCreativeDirector({
    userPrompt,
    appName: analysisResult.appName,
    appDescription: analysisResult.appDescription,
    contract: analysisResult.contract,
    tokens,
  })
  const spec = cdResult.spec
  trackUsage('creative-director', 'gpt-5.2', cdResult.usage.inputTokens, cdResult.usage.outputTokens, Date.now() - t3)

  log(`  Archetype: ${spec.archetype}`)
  log(`  Pages in sitemap: ${spec.sitemap.length}`)
  log(`  Routes: ${spec.sitemap.map((p) => p.route).join(', ')}`)

  // --- Phase 3.5: Fetch Unsplash images ---
  log('\nPhase 3.5: Fetching Unsplash images...')
  const { fetchHeroImages } = await import('../server/lib/unsplash')
  // Extract domain keywords from user prompt — Unsplash works best with short, generic queries
  // Use first ~50 chars of user prompt to capture domain keywords (not the LLM-generated brand name)
  const imageQuery = userPrompt.split(/[.\n]/)[0].slice(0, 60).trim()
  const heroImages = await fetchHeroImages(imageQuery, 10)
  const imagePool = heroImages.map((img) => img.url)
  log(`  Fetched ${imagePool.length} Unsplash images for query: "${imageQuery.slice(0, 60)}..."`)

  // --- Phase 4: Page Generation ---
  log('\nPhase 4: Generating pages in parallel...')
  const { generatePages } = await import('../server/lib/page-generator')

  const t4 = Date.now()
  const pageResult = await generatePages({
    spec,
    imagePool,
  })
  const generatedPages = pageResult.pages
  trackUsage('page-generation', 'gpt-5.2-codex', pageResult.usage.inputTokens, pageResult.usage.outputTokens, Date.now() - t4)
  log(`  Generated ${generatedPages.length} pages in ${((Date.now() - t4) / 1000).toFixed(1)}s`)
  for (const page of generatedPages) {
    log(`    ${page.route} → src/${page.fileName} (${page.content.length} chars)`)
  }

  // --- Phase 5: Assembly ---
  log('\nPhase 5: Assembling app files (deterministic)...')
  const { assembleApp } = await import('../server/lib/deterministic-assembly')

  const assembledFiles = assembleApp({
    spec,
    generatedPages,
    appName: analysisResult.appName,
    includeUiKit: true,
  })

  // Write all assembled files to tmpDir
  const slug = analysisResult.appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const tmpDir = join('/tmp', `vibestack-fullpage-${slug}-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })

  for (const file of assembledFiles) {
    const filePath = join(tmpDir, file.path)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, file.content)
  }

  log(`  Written ${assembledFiles.length} files to ${tmpDir}`)

  // Write additional scaffold files not produced by assembleApp:
  // package.json, tsconfig.json, index.html, .env
  const appSlug = analysisResult.appName.toLowerCase().replace(/\s+/g, '-')
  const tsconfig = {
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true, baseUrl: '.', paths: { '@/*': ['./src/*'] }, types: ['vite/client'] },
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    exclude: ['node_modules'],
  }
  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: appSlug, private: true }, null, 2))
  writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))
  writeFileSync(join(tmpDir, 'index.html'), [
    '<!DOCTYPE html>', '<html lang="en">', '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${analysisResult.appName}</title>`,
    '  <link rel="preconnect" href="https://fonts.googleapis.com" />',
    `  <link href="${spec.visualDna.typography.googleFontsUrl}" rel="stylesheet" />`,
    '</head>', '<body>', '  <div id="root"></div>',
    '  <script type="module" src="/src/main.tsx"></script>',
    '</body>', '</html>',
  ].join('\n'))
  // No .env needed for static apps

  // Symlink node_modules from project root for tsc validation
  const projectRoot = join(import.meta.dirname, '..')
  try {
    execFileSync('ln', ['-sf', join(projectRoot, 'node_modules'), join(tmpDir, 'node_modules')])
  } catch {
    /* ignore */
  }

  // Copy shadcn/ui components from snapshot/ui-kit/
  log('\n  Copying shadcn components from snapshot/ui-kit/...')
  const uiKitSrc = join(import.meta.dirname, '..', 'snapshot', 'ui-kit')
  const uiDest = join(tmpDir, 'src', 'components', 'ui')
  const libDest = join(tmpDir, 'src', 'lib')
  mkdirSync(uiDest, { recursive: true })
  mkdirSync(libDest, { recursive: true })

  try {
    const entries = readdirSync(uiKitSrc)
    for (const entry of entries) {
      if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue
      const fileContent = readFileSync(join(uiKitSrc, entry), 'utf-8')
      if (entry === 'utils.ts') {
        writeFileSync(join(libDest, 'utils.ts'), fileContent)
      } else {
        writeFileSync(join(uiDest, entry), fileContent)
      }
    }
    log(`  Copied ${entries.filter(e => e.endsWith('.tsx') || e.endsWith('.ts')).length} ui-kit files`)
  } catch (err) {
    log(`  WARNING: Could not copy ui-kit: ${err}`)
  }

  // --- Phase 6: Validation ---
  log('\nPhase 6: Running static analysis validator...')
  const { validateGeneratedApp } = await import('../server/lib/page-validator')

  const fileMap = new Map(assembledFiles.map((f) => [f.path, f.content]))
  const validRoutes = spec.sitemap.map((p) => p.route)
  const validation = validateGeneratedApp({
    files: fileMap,
    validRoutes,
    hasSupabase: spec.archetype !== 'static',
  })

  if (validation.valid) {
    log('  Static analysis: PASS')
  } else {
    log(`  Static analysis: FAIL (${validation.errors.length} errors)`)
    for (const err of validation.errors.slice(0, 20)) {
      log(`    ERROR [${err.type}] ${err.file}${err.line != null ? `:${err.line}` : ''} — ${err.message}`)
    }
  }

  if (validation.warnings.length > 0) {
    log(`  Warnings: ${validation.warnings.length}`)
    for (const warn of validation.warnings.slice(0, 10)) {
      log(`    WARN [${warn.type}] ${warn.file} — ${warn.message}`)
    }
  }

  // Also run tsc --noEmit for full TypeScript validation
  log('\n  Running tsc --noEmit...')
  let tscOutput = ''
  try {
    tscOutput = execFileSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: tmpDir,
    })
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string }
    tscOutput = (e.stdout ?? '') + (e.stderr ?? '')
  }

  // Filter route-tree false positives
  const tscErrors = tscOutput.split('\n').filter((line) => {
    if (!line.includes('error TS')) return false
    if (line.includes("is not assignable to parameter of type 'undefined'")) return false
    if (line.includes("Property 'search' is missing")) return false
    if (/is not assignable to type '"\."/.test(line)) return false
    if (/Type '"\/[^"]*"' is not assignable/.test(line)) return false
    if (/Type '`\/[^`]*`' is not assignable/.test(line)) return false
    if (line.includes("is not assignable to type '\"") && line.includes('"."')) return false
    if (line.includes('routeTree.gen')) return false
    return true
  })

  if (tscErrors.length === 0) {
    log('  tsc: PASS')
  } else {
    log(`  tsc: FAIL (${tscErrors.length} errors)`)
    for (const err of tscErrors.slice(0, 20)) {
      log(`    ${err.slice(0, 200)}`)
    }
  }

  // ============================================================================
  // Summary Report
  // ============================================================================

  const totalDuration = Date.now() - globalStart
  const totalInputTokens = tokenLog.reduce((s, t) => s + t.inputTokens, 0)
  const totalOutputTokens = tokenLog.reduce((s, t) => s + t.outputTokens, 0)
  const totalCost = tokenLog.reduce((s, t) => s + t.cost, 0)

  log(`\n${'═'.repeat(70)}`)
  log('LLM FULL-PAGE GENERATION — COST REPORT')
  log(`${'═'.repeat(70)}`)

  log('\n| Phase                        | Model          | Input    | Output   | Cost     | Time   |')
  log('|------------------------------|----------------|----------|----------|----------|--------|')
  for (const t of tokenLog) {
    log(
      `| ${t.phase.padEnd(28)} | ${t.model.padEnd(14)} | ${String(t.inputTokens).padEnd(8)} | ${String(t.outputTokens).padEnd(8)} | $${t.cost.toFixed(4).padEnd(7)} | ${(t.durationMs / 1000).toFixed(1).padEnd(5)}s |`,
    )
  }
  log('|------------------------------|----------------|----------|----------|----------|--------|')
  log(
    `| ${'TOTAL'.padEnd(28)} | ${' '.repeat(14)} | ${String(totalInputTokens).padEnd(8)} | ${String(totalOutputTokens).padEnd(8)} | $${totalCost.toFixed(4).padEnd(7)} | ${(totalDuration / 1000).toFixed(1).padEnd(5)}s |`,
  )

  log(`\nPages generated: ${generatedPages.length}`)
  log(`Static analysis errors: ${validation.errors.length}`)
  log(`Static analysis warnings: ${validation.warnings.length}`)
  log(`TypeScript errors: ${tscErrors.length}`)
  log(`Output directory: ${tmpDir}`)
  log(`Total cost: $${totalCost.toFixed(4)}`)
  if (generatedPages.length > 0) {
    log(`Cost per page: $${(totalCost / generatedPages.length).toFixed(4)}`)
  }

  if (!keepDirs && tscErrors.length === 0 && validation.valid) {
    log('\nPass --keep to preserve the output directory.')
  }

  log(`\nTo serve: cd ${tmpDir} && npx vite --port 4000`)

}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
