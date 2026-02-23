#!/usr/bin/env bun
/**
 * LLM Full-Page Generation Experiment + Visual Eval
 *
 * Generates a static app from a user prompt, validates it, then scores it
 * against the EVALUATION CRITERIA rubric using Claude Vision.
 *
 * Pipeline:
 *   1. Analyst (gpt-5.2) → PRD + app description
 *   2. Architect (gpt-5.2-codex) → CreativeSpec + DesignSystem tokens
 *   3. Page Generation (parallel gpt-5.2-codex) → full .tsx files per route
 *   4. Assembly (deterministic) → all scaffold files + route tree
 *   5. Validation → static analysis + tsc --noEmit
 *   6. Visual Eval → Playwright screenshots + Claude Vision scoring
 *
 * Usage:
 *   bun scripts/llm-fullpage-experiment.ts                    # default prompt
 *   bun scripts/llm-fullpage-experiment.ts --test=LP-03       # test prompt by ID
 *   bun scripts/llm-fullpage-experiment.ts --prompt="..."     # custom prompt
 *   bun scripts/llm-fullpage-experiment.ts --keep             # keep /tmp dirs
 *   bun scripts/llm-fullpage-experiment.ts --no-eval          # skip visual eval
 *   bun scripts/llm-fullpage-experiment.ts --eval-only=/tmp/vibestack-fullpage-...  # eval existing build
 */

import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRICING = {
  'gpt-5.2': { input: 2.50, output: 10.0 },
  'gpt-5.2-codex': { input: 2.50, output: 10.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
} as const

const DEFAULT_PROMPT = `Build a real estate agency landing page.
The homepage should have a hero section with a search bar, featured property listings,
neighborhood guides, agent profiles, testimonials from happy homebuyers,
a "Why choose us" section, and a newsletter signup. Include pages for
About Us, Our Properties (gallery with static listings), Contact, and Blog
with 3-4 sample articles. Everything is static — no database, no admin.
It should feel premium, trustworthy, and modern.`

const EVAL_RUBRIC = `Score this generated web application screenshot against each criterion on a 1-10 scale.
Be strict — a 7 means "good but not great", a 9 means "nearly professional quality".

CRITERIA:

1. **Design coherence** (1-10): Does it look like ONE designer made it? Consistent palette, typography, spacing throughout. Fail signals: mixed aesthetics, inconsistent spacing, random colour choices.

2. **Content quality** (1-10): Is the copy believable and specific? Fail signals: Lorem ipsum, "[Your text here]", generic "Welcome to Our Platform", buzzwords without substance.

3. **Image relevance** (1-10): Do images match the section context and page aesthetic? Are they the right aspect ratio? Do they create atmosphere? Fail signals: "business team" stock photos, broken/missing images, wrong mood.

4. **Interactivity signals** (1-10): Do buttons have hover states? Are there visual affordances (shadows, borders, transitions)? Does the layout suggest working interactions? Fail signals: flat dead-looking buttons, no visual feedback cues.

5. **Responsiveness** (1-10): ONLY score this for mobile screenshots. Does it work at this viewport? Fail signals: horizontal overflow, overlapping text, broken layouts, unreadable text.

6. **Distinctiveness** (1-10): Would you mistake this for a different AI-generated site? Does it have a clear aesthetic point of view? Fail signals: generic purple gradient, Inter font, centered card grid like every other AI output.

7. **Visual polish** (1-10): Attention to detail — proper whitespace, alignment, hierarchy, professional feel. Fail signals: cramped sections, misaligned elements, amateur spacing.

Respond with ONLY valid JSON (no markdown fences):
{
  "scores": {
    "design_coherence": <number>,
    "content_quality": <number>,
    "image_relevance": <number>,
    "interactivity_signals": <number>,
    "responsiveness": <number or null if desktop screenshot>,
    "distinctiveness": <number>,
    "visual_polish": <number>
  },
  "overall": <number>,
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "one_line_summary": "<one sentence verdict>"
}`

// ---------------------------------------------------------------------------
// Test prompt loader
// ---------------------------------------------------------------------------

function loadTestPrompt(id: string): string {
  const file = readFileSync(join(import.meta.dirname, 'test-prompts.md'), 'utf-8')
  const regex = new RegExp(`###\\s+${id.replace(/[-]/g, '[-]')}\\s+[^\\n]*\\n\`\`\`\\n([\\s\\S]*?)\`\`\``, 'i')
  const match = file.match(regex)
  if (!match) {
    const ids = [...file.matchAll(/###\s+([\w-]+)\s+/g)].map((m) => m[1])
    console.error(`Unknown test prompt "${id}". Available: ${ids.join(', ')}`)
    process.exit(1)
  }
  return match[1].trim()
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const keepDirs = process.argv.includes('--keep')
const noEval = process.argv.includes('--no-eval')
const promptArg = process.argv.find((a) => a.startsWith('--prompt='))
const testArg = process.argv.find((a) => a.startsWith('--test='))
const evalOnlyArg = process.argv.find((a) => a.startsWith('--eval-only='))
const userPrompt = testArg
  ? loadTestPrompt(testArg.split('=')[1])
  : promptArg
    ? promptArg.split('=').slice(1).join('=')
    : DEFAULT_PROMPT

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
// Screenshot capture via Playwright
// ---------------------------------------------------------------------------

async function captureScreenshots(appDir: string): Promise<{ desktop: string[]; mobile: string[] }> {
  const screenshotDir = join(appDir, '.eval-screenshots')
  mkdirSync(screenshotDir, { recursive: true })

  // Start Vite dev server
  log('  Starting Vite dev server...')
  const viteProcess = spawn('npx', ['vite', '--port', '4444', '--host', '127.0.0.1'], {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development' },
  })

  // Wait for Vite to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite startup timeout')), 30000)
    viteProcess.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes('Local:') || data.toString().includes('localhost:4444')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    viteProcess.on('error', (err) => { clearTimeout(timeout); reject(err) })
  })
  log('  Vite ready on port 4444')

  // Discover routes from the generated route tree
  const routes = ['/']
  try {
    const routeTree = readFileSync(join(appDir, 'src', 'routeTree.gen.ts'), 'utf-8')
    const routeMatches = [...routeTree.matchAll(/path:\s*['"]([^'"]+)['"]/g)]
    for (const m of routeMatches) {
      if (m[1] !== '/' && !m[1].includes('$')) routes.push(m[1])
    }
  } catch { /* only screenshot / if route tree is unreadable */ }

  const desktopFiles: string[] = []
  const mobileFiles: string[] = []

  try {
    // Use Playwright programmatically
    const pw = await import('playwright')
    const browser = await pw.chromium.launch({ headless: true })

    for (const route of routes) {
      const routeSlug = route === '/' ? 'home' : route.replace(/\//g, '-').replace(/^-/, '')

      // Desktop: 1440x900
      const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await desktopPage.goto(`http://127.0.0.1:4444${route}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {})
      await desktopPage.waitForTimeout(1000)

      // Full-page screenshot
      const desktopPath = join(screenshotDir, `desktop-${routeSlug}.png`)
      await desktopPage.screenshot({ path: desktopPath, fullPage: true })
      desktopFiles.push(desktopPath)
      log(`    Desktop: ${route} → ${desktopPath}`)
      await desktopPage.close()

      // Mobile: 375x812
      const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } })
      await mobilePage.goto(`http://127.0.0.1:4444${route}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {})
      await mobilePage.waitForTimeout(1000)

      const mobilePath = join(screenshotDir, `mobile-${routeSlug}.png`)
      await mobilePage.screenshot({ path: mobilePath, fullPage: true })
      mobileFiles.push(mobilePath)
      log(`    Mobile:  ${route} → ${mobilePath}`)
      await mobilePage.close()
    }

    await browser.close()
  } finally {
    viteProcess.kill('SIGTERM')
  }

  return { desktop: desktopFiles, mobile: mobileFiles }
}

// ---------------------------------------------------------------------------
// Claude Vision scoring
// ---------------------------------------------------------------------------

interface EvalScores {
  design_coherence: number
  content_quality: number
  image_relevance: number
  interactivity_signals: number
  responsiveness: number | null
  distinctiveness: number
  visual_polish: number
}

interface EvalResult {
  scores: EvalScores
  overall: number
  strengths: string[]
  weaknesses: string[]
  one_line_summary: string
}

async function scoreWithClaudeVision(
  screenshotPaths: string[],
  viewport: 'desktop' | 'mobile',
  prompt: string,
): Promise<{ result: EvalResult; inputTokens: number; outputTokens: number }> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic()

  const imageContent = screenshotPaths.map((path) => {
    const data = readFileSync(path)
    return {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/png' as const,
        data: data.toString('base64'),
      },
    }
  })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `These are ${viewport} screenshots (${viewport === 'desktop' ? '1440px' : '375px'} wide) of a generated web app.

Original user prompt: "${prompt.slice(0, 500)}"

${EVAL_RUBRIC}`,
          },
        ],
      },
    ],
  })

  const text = response.content.find((c) => c.type === 'text')?.text ?? '{}'
  // Strip markdown fences if present
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const parsed = JSON.parse(jsonStr) as EvalResult

  return {
    result: parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

// ---------------------------------------------------------------------------
// Generation pipeline
// ---------------------------------------------------------------------------

async function runGenerationPipeline(): Promise<{ tmpDir: string; validation: { errors: { type: string; file: string; line?: number; message: string }[]; warnings: { type: string; file: string; message: string }[]; valid: boolean }; tscErrors: string[]; generatedPages: { route: string; fileName: string; content: string }[]; spec: any }> {
  // Initialize Helicone context
  const { setGlobalHeliconeContext } = await import('../server/lib/agents/provider')
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
      userMessage: `${userPrompt}\n\nAdditional context: build exactly what I described, no need to ask questions.`,
      projectId: `fullpage-exp-${Date.now()}`,
    })
  }

  if (analysisResult.type !== 'done') {
    log('ERROR: Analyst did not produce requirements')
    process.exit(1)
  }

  trackUsage('analyst', 'gpt-5.2', analysisResult.tokensUsed ?? 0, 0, Date.now() - t1)
  log(`  App: ${analysisResult.appName}`)
  log(`  PRD: ${(analysisResult.appDescription ?? '').slice(0, 120)}...`)

  // --- Phase 2: Architect Agent ---
  log('\nPhase 2: Running architect agent...')
  const { runArchitect } = await import('../server/lib/agents/orchestrator')

  const t2 = Date.now()
  const architectResult = await runArchitect({
    appName: analysisResult.appName,
    prd: analysisResult.appDescription,
  })
  const { spec, tokens } = architectResult
  trackUsage('architect', 'gpt-5.2-codex', architectResult.tokensUsed, 0, Date.now() - t2)

  log(`  Fonts: ${tokens.fonts.display} / ${tokens.fonts.body}`)
  log(`  Card style: ${tokens.style.cardStyle}, Nav: ${tokens.style.navStyle}`)
  log(`  Aesthetic: ${spec.designSystem.aestheticDirection}`)
  log(`  Pages in sitemap: ${spec.sitemap.length}`)
  log(`  Routes: ${spec.sitemap.map((p: { route: string }) => p.route).join(', ')}`)

  // --- Phase 3: Page Generation ---
  log('\nPhase 3: Generating pages in parallel...')
  const { generatePages } = await import('../server/lib/page-generator')

  const t3 = Date.now()
  const pageResult = await generatePages({ spec, tokens })
  const generatedPages = pageResult.pages
  trackUsage('page-generation', 'gpt-5.2-codex', pageResult.usage.inputTokens, pageResult.usage.outputTokens, Date.now() - t3)
  log(`  Generated ${generatedPages.length} pages in ${((Date.now() - t3) / 1000).toFixed(1)}s`)
  for (const page of generatedPages) {
    log(`    ${page.route} → src/${page.fileName} (${page.content.length} chars)`)
  }

  // --- Phase 4: Assembly ---
  log('\nPhase 4: Assembling app files (deterministic)...')
  const { assembleApp } = await import('../server/lib/deterministic-assembly')

  const assembledFiles = assembleApp({
    spec,
    generatedPages,
    appName: analysisResult.appName,
    tokens,
    includeUiKit: true,
  })

  // Write to tmpDir
  const slug = analysisResult.appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const tmpDir = join('/tmp', `vibestack-fullpage-${slug}-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })

  for (const file of assembledFiles) {
    const filePath = join(tmpDir, file.path)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, file.content)
  }
  log(`  Written ${assembledFiles.length} files to ${tmpDir}`)

  // Scaffold files
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
    `  <link href="${tokens.fonts.googleFontsUrl}" rel="stylesheet" />`,
    '</head>', '<body>', '  <div id="root"></div>',
    '  <script type="module" src="/src/main.tsx"></script>',
    '</body>', '</html>',
  ].join('\n'))

  // Symlink node_modules
  const projectRoot = join(import.meta.dirname, '..')
  try {
    execFileSync('ln', ['-sf', join(projectRoot, 'node_modules'), join(tmpDir, 'node_modules')])
  } catch { /* ignore */ }

  // Copy ui-kit
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

  // --- Phase 5: Validation ---
  log('\nPhase 5: Running static analysis validator...')
  const { validateGeneratedApp } = await import('../server/lib/page-validator')

  const fileMap = new Map(assembledFiles.map((f) => [f.path, f.content]))
  const validRoutes = spec.sitemap.map((p: { route: string }) => p.route)
  const validation = validateGeneratedApp({ files: fileMap, validRoutes, hasSupabase: false })

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

  // tsc
  log('\n  Running tsc --noEmit...')
  let tscOutput = ''
  try {
    tscOutput = execFileSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      encoding: 'utf-8', timeout: 60000, cwd: tmpDir,
    })
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string }
    tscOutput = (e.stdout ?? '') + (e.stderr ?? '')
  }
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

  return { tmpDir, validation, tscErrors, generatedPages, spec }
}

// ---------------------------------------------------------------------------
// Visual eval pipeline
// ---------------------------------------------------------------------------

async function runVisualEval(tmpDir: string) {
  log('\n' + '═'.repeat(70))
  log('PHASE 6: VISUAL EVALUATION (Claude Vision)')
  log('═'.repeat(70))

  // Capture screenshots
  log('\n  Capturing screenshots with Playwright...')
  const { desktop, mobile } = await captureScreenshots(tmpDir)

  if (desktop.length === 0) {
    log('  ERROR: No screenshots captured. Skipping visual eval.')
    return null
  }

  // Score desktop screenshots
  log('\n  Scoring desktop screenshots with Claude Vision...')
  const t6d = Date.now()
  const desktopEval = await scoreWithClaudeVision(desktop, 'desktop', userPrompt)
  trackUsage('visual-eval-desktop', 'claude-sonnet-4-6', desktopEval.inputTokens, desktopEval.outputTokens, Date.now() - t6d)

  // Score mobile screenshots
  log('  Scoring mobile screenshots with Claude Vision...')
  const t6m = Date.now()
  const mobileEval = await scoreWithClaudeVision(mobile, 'mobile', userPrompt)
  trackUsage('visual-eval-mobile', 'claude-sonnet-4-6', mobileEval.inputTokens, mobileEval.outputTokens, Date.now() - t6m)

  // Merge scores — average desktop and mobile, use mobile for responsiveness
  const d = desktopEval.result.scores
  const m = mobileEval.result.scores
  const avg = (a: number | null, b: number | null) => {
    if (a == null && b == null) return null
    if (a == null) return b
    if (b == null) return a
    return Math.round(((a + b) / 2) * 10) / 10
  }

  const merged: Record<string, number | null> = {
    design_coherence: avg(d.design_coherence, m.design_coherence),
    content_quality: avg(d.content_quality, m.content_quality),
    image_relevance: avg(d.image_relevance, m.image_relevance),
    interactivity_signals: avg(d.interactivity_signals, m.interactivity_signals),
    responsiveness: m.responsiveness, // mobile-only score
    distinctiveness: avg(d.distinctiveness, m.distinctiveness),
    visual_polish: avg(d.visual_polish, m.visual_polish),
  }

  const scoredValues = Object.values(merged).filter((v): v is number => v != null)
  const overallAvg = scoredValues.length > 0
    ? Math.round((scoredValues.reduce((a, b) => a + b, 0) / scoredValues.length) * 10) / 10
    : 0

  return {
    desktop: desktopEval.result,
    mobile: mobileEval.result,
    merged,
    overall: overallAvg,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log('=== LLM Full-Page Generation Experiment ===')
  log(`Prompt: ${userPrompt.slice(0, 100)}...`)
  log(`Keep dirs: ${keepDirs}`)
  log(`Visual eval: ${noEval ? 'DISABLED' : 'ENABLED'}`)
  log('')

  let tmpDir: string
  let validation: { errors: any[]; warnings: any[]; valid: boolean }
  let tscErrors: string[]
  let generatedPages: { route: string; fileName: string; content: string }[]
  let _spec: any

  if (evalOnlyArg) {
    // --eval-only mode: skip generation, just eval existing build
    tmpDir = evalOnlyArg.split('=')[1]
    if (!existsSync(tmpDir)) {
      log(`ERROR: Directory does not exist: ${tmpDir}`)
      process.exit(1)
    }
    log(`Eval-only mode: ${tmpDir}`)
    validation = { errors: [], warnings: [], valid: true }
    tscErrors = []
    generatedPages = []
    _spec = null
  } else {
    const result = await runGenerationPipeline()
    tmpDir = result.tmpDir
    validation = result.validation
    tscErrors = result.tscErrors
    generatedPages = result.generatedPages
    _spec = result.spec
  }

  // Visual eval
  let evalResult: Awaited<ReturnType<typeof runVisualEval>> = null
  if (!noEval) {
    try {
      evalResult = await runVisualEval(tmpDir)
    } catch (err) {
      log(`  Visual eval failed: ${err}`)
      log('  (Install playwright: bunx playwright install chromium)')
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
  log('COST REPORT')
  log(`${'═'.repeat(70)}`)

  log('\n| Phase                        | Model            | Input    | Output   | Cost     | Time   |')
  log('|------------------------------|------------------|----------|----------|----------|--------|')
  for (const t of tokenLog) {
    log(
      `| ${t.phase.padEnd(28)} | ${t.model.padEnd(16)} | ${String(t.inputTokens).padEnd(8)} | ${String(t.outputTokens).padEnd(8)} | $${t.cost.toFixed(4).padEnd(7)} | ${(t.durationMs / 1000).toFixed(1).padEnd(5)}s |`,
    )
  }
  log('|------------------------------|------------------|----------|----------|----------|--------|')
  log(
    `| ${'TOTAL'.padEnd(28)} | ${' '.repeat(16)} | ${String(totalInputTokens).padEnd(8)} | ${String(totalOutputTokens).padEnd(8)} | $${totalCost.toFixed(4).padEnd(7)} | ${(totalDuration / 1000).toFixed(1).padEnd(5)}s |`,
  )

  if (!evalOnlyArg) {
    log(`\nPages generated: ${generatedPages.length}`)
    log(`Static analysis errors: ${validation.errors.length}`)
    log(`Static analysis warnings: ${validation.warnings.length}`)
    log(`TypeScript errors: ${tscErrors.length}`)
  }

  // Visual eval report
  if (evalResult) {
    log(`\n${'═'.repeat(70)}`)
    log('VISUAL EVALUATION SCORES (Claude Vision)')
    log(`${'═'.repeat(70)}`)

    log('\n| Criterion              | Desktop | Mobile | Merged |')
    log('|------------------------|---------|--------|--------|')
    const criteria = ['design_coherence', 'content_quality', 'image_relevance', 'interactivity_signals', 'responsiveness', 'distinctiveness', 'visual_polish'] as const
    for (const key of criteria) {
      const dScore = evalResult.desktop.scores[key]
      const mScore = evalResult.mobile.scores[key]
      const merged = evalResult.merged[key]
      log(
        `| ${key.replace(/_/g, ' ').padEnd(22)} | ${dScore != null ? String(dScore).padEnd(7) : 'n/a    '} | ${mScore != null ? String(mScore).padEnd(6) : 'n/a   '} | ${merged != null ? String(merged).padEnd(6) : 'n/a   '} |`,
      )
    }
    log('|------------------------|---------|--------|--------|')
    log(`| ${'OVERALL'.padEnd(22)} | ${String(evalResult.desktop.overall).padEnd(7)} | ${String(evalResult.mobile.overall).padEnd(6)} | ${String(evalResult.overall).padEnd(6)} |`)

    log(`\nDesktop verdict: ${evalResult.desktop.one_line_summary}`)
    log(`Mobile verdict:  ${evalResult.mobile.one_line_summary}`)

    log('\nStrengths (desktop):')
    for (const s of evalResult.desktop.strengths) log(`  + ${s}`)
    log('Weaknesses (desktop):')
    for (const w of evalResult.desktop.weaknesses) log(`  - ${w}`)

    log('\nStrengths (mobile):')
    for (const s of evalResult.mobile.strengths) log(`  + ${s}`)
    log('Weaknesses (mobile):')
    for (const w of evalResult.mobile.weaknesses) log(`  - ${w}`)

    // Determine pass/fail
    const passThreshold = 6.0
    const passed = evalResult.overall >= passThreshold
    log(`\n${passed ? 'PASS' : 'FAIL'} — Overall: ${evalResult.overall}/10 (threshold: ${passThreshold})`)
  }

  log(`\nOutput directory: ${tmpDir}`)
  log(`Total cost: $${totalCost.toFixed(4)}`)
  if (generatedPages.length > 0) {
    log(`Cost per page: $${(totalCost / generatedPages.length).toFixed(4)}`)
  }

  if (!keepDirs && tscErrors.length === 0 && validation.valid) {
    log('\nPass --keep to preserve the output directory.')
  }

  log(`\nTo serve: cd ${tmpDir} && npx vite --port 4000`)

  // Write eval report as JSON
  if (evalResult) {
    const reportPath = join(tmpDir, 'eval-report.json')
    writeFileSync(reportPath, JSON.stringify({
      prompt: userPrompt,
      testId: testArg?.split('=')[1] ?? null,
      timestamp: new Date().toISOString(),
      costs: tokenLog,
      totalCost,
      validation: { errors: validation.errors.length, warnings: validation.warnings.length, tscErrors: tscErrors.length },
      scores: evalResult,
    }, null, 2))
    log(`Eval report: ${reportPath}`)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
