#!/usr/bin/env bun
/**
 * E2E Pipeline Test Runner — 10 Diverse Apps
 *
 * Runs the full VibeStack generation pipeline for one of 10 diverse app prompts:
 *   Analysis → Blueprint → Provisioning → CodeGen → Validation → Review → GitHub Push → Vercel Deploy
 *
 * Usage:
 *   bun scripts/e2e-pipeline-test.ts --prompt=1   # simple recipe app
 *   bun scripts/e2e-pipeline-test.ts --prompt=5   # luxury watch catalog
 *   bun scripts/e2e-pipeline-test.ts --prompt=10  # restaurant management
 *
 * Env: reads from .env.local automatically (bun feature)
 */

import { writeFileSync, appendFileSync, existsSync } from 'node:fs'

// ============================================================================
// Config
// ============================================================================

const TEST_PROMPTS = [
  {
    id: 1,
    name: 'Recipe App (ultra-vague)',
    prompt: `recipe app`,
    hint: 'No auth needed — public recipe browsing',
  },
  {
    id: 2,
    name: 'Book Reading Tracker (personal)',
    prompt: `I want to track the books I read. I need to log each book with its title, author, genre, my rating out of 5, when I started and finished reading it, and a personal review. I want to organize my books into reading lists like "Currently Reading", "Want to Read", and "Finished".`,
    hint: 'Personal auth app — warm library aesthetic',
  },
  {
    id: 3,
    name: 'Remote Developer Job Board (public catalog)',
    prompt: `Build a remote job board for developer positions. Companies can post jobs with title, company name, location (remote/hybrid/onsite), job type (full-time/contract/freelance), tech stack required, salary range, and description. Job seekers can browse and filter by job type, tech stack, and location. No user authentication needed — anyone can view listings.`,
    hint: 'No auth — dark terminal/code aesthetic',
  },
  {
    id: 4,
    name: 'Personal Finance Tracker (SaaS with auth)',
    prompt: `Build a personal finance tracker. Users track income and expenses with: amount, category (Food, Transport, Entertainment, Bills, Shopping, Income, Other), date, description, and whether it's recurring.

The dashboard shows:
- Current month spending by category
- Income vs expenses for the last 6 months
- Running balance (total income - total expenses)
- Top 3 spending categories this month

Users can filter transactions by date range and category.`,
    hint: 'Auth app — emerald/dark finance aesthetic',
  },
  {
    id: 5,
    name: 'Luxury Watch Catalog (e-commerce browse)',
    prompt: `Build a product catalog for a luxury watch boutique called "Meridian". Display watches with: name, brand, reference number, case material (steel/gold/platinum/titanium), movement type (automatic/manual/quartz), water resistance, price, and a description. Include a companion collection table for organizing watches into collections (e.g., "Dress Watches", "Sports Watches", "Limited Edition"). No authentication — this is a public catalog.`,
    hint: 'No auth — navy/gold luxury e-commerce aesthetic',
  },
  {
    id: 6,
    name: 'Medical Clinic Scheduling (healthcare)',
    prompt: `Build a patient appointment management system for a small family medical clinic. The system needs to track:
- Patients: first name, last name, date of birth, phone, email, medical record number, insurance provider
- Doctors: first name, last name, specialization, license number, active status
- Appointments: patient (FK), doctor (FK), appointment date/time, type (new patient / follow-up / urgent), status (scheduled/confirmed/completed/cancelled/no-show), chief complaint, duration in minutes, notes

Receptionists can view all appointments, create new ones, and update statuses. The appointment list should show today's schedule first.`,
    hint: 'Auth app — teal/white medical aesthetic',
  },
  {
    id: 7,
    name: 'SaaS CRM for Small Agencies (multi-entity)',
    prompt: `Build a lightweight CRM for small creative agencies to manage their client relationships and sales pipeline.

Entities:
- Companies: name, industry, website, size (1-10/11-50/51-200/200+), country, notes
- Contacts: first name, last name, email, phone, job title, company (FK), is_primary_contact
- Deals: title, company (FK), contact (FK), value (numeric), stage (lead/proposal/negotiation/closed-won/closed-lost), probability (0-100), expected_close_date, notes
- Activities: deal (FK), contact (FK), type (call/email/meeting/demo), subject, notes, completed (boolean), activity_date

The pipeline view should default to showing deals sorted by stage then value.`,
    hint: 'Auth app — deep violet/slate SaaS aesthetic',
  },
  {
    id: 8,
    name: 'Travel Blog CMS (editorial content)',
    prompt: `Build a content management system for a travel blog called "Wanderlust Journal".

Entities:
- Destinations: name, country, continent, description, best_season (spring/summer/fall/winter/year-round), cover_image_url
- Authors: name, bio, avatar_url, email, social_handle
- Articles: title, slug, author (FK), destination (FK), status (draft/review/published), published_at, excerpt, content (long text), cover_image_url, read_time_minutes
- Tags: name, color (hex code), slug

Writers sign in to create and edit articles. Published articles are visible to all.`,
    hint: 'Auth app — coral/terracotta editorial aesthetic',
  },
  {
    id: 9,
    name: 'Agency Project Management (complex SaaS)',
    prompt: `Build a project management tool for creative agencies with the following structure:

Clients: company name, contact person, email, phone, country, contract value, status (prospect/active/paused/churned)

Projects: name, client (FK), project manager name, start_date, deadline, budget, status (briefing/production/review/delivered/invoiced), description

Deliverables: title, project (FK), type (logo/website/copy/video/photo/social/other), status (brief/in-progress/internal-review/client-review/approved/delivered), assignee_name, due_date, revision_count, notes

Time entries: project (FK), deliverable (FK), person_name, hours, billable (boolean), date, description

Dashboard defaults to showing active projects sorted by deadline (soonest first). Deliverables default to showing in-progress and review items.`,
    hint: 'Auth app — bold amber/dark agency aesthetic',
  },
  {
    id: 10,
    name: 'Restaurant Management System (hospitality)',
    prompt: `Build a restaurant management system for "La Piazza" an Italian restaurant.

Menu categories: name, description, display_order, active (boolean)
Menu items: name, category (FK), description, price, dietary_tags (text, comma-separated like "vegetarian,gluten-free"), available (boolean), preparation_time_minutes, image_url, calories
Tables: table_number (integer), capacity, location (indoor/outdoor/bar/private), status (available/occupied/reserved/closed)
Reservations: guest_name, guest_email, guest_phone, table (FK), party_size, reservation_date, reservation_time, status (pending/confirmed/seated/completed/cancelled/no-show), special_requests
Orders: table (FK), reservation (FK, optional), status (open/in-progress/ready/served/paid/cancelled), total_amount, notes, ordered_at
Order items: order (FK), menu_item (FK), quantity, unit_price, special_instructions, status (pending/cooking/ready/served)

Staff sign in to manage reservations and orders. The reservation list defaults to today's date.`,
    hint: 'Auth app — warm terracotta/cream Italian restaurant aesthetic',
  },
]

const promptArg = process.argv.find((a) => a.startsWith('--prompt='))
const promptIndex = promptArg ? parseInt(promptArg.split('=')[1], 10) - 1 : 0
const TEST_CONFIG = TEST_PROMPTS[Math.min(promptIndex, TEST_PROMPTS.length - 1)] ?? TEST_PROMPTS[0]
const TEST_PROMPT = TEST_CONFIG.prompt

const LEARNINGS_PATH = `docs/e2e-pipeline-learnings-app${TEST_CONFIG.id}.md`
const MASTER_LEARNINGS_PATH = `docs/10-apps-learnings.md`

// ============================================================================
// Logging & Timing
// ============================================================================

const startTime = Date.now()
const phaseTimings: Array<{ phase: string; durationMs: number; tokens: number; status: string; notes: string }> = []

function elapsed(): string {
  return `[${((Date.now() - startTime) / 1000).toFixed(1)}s]`
}

function log(msg: string) {
  const line = `${elapsed()} ${msg}`
  console.log(line)
}

function logError(msg: string, error: unknown) {
  const errMsg = error instanceof Error ? error.message : String(error)
  console.error(`${elapsed()} ERROR: ${msg}: ${errMsg}`)
  if (error instanceof Error && error.stack) {
    console.error(error.stack)
  }
}

function trackPhase(phase: string, durationMs: number, tokens: number, status: string, notes = '') {
  phaseTimings.push({ phase, durationMs, tokens, status, notes })
  const statusIcon = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️' : '❌'
  log(`${statusIcon} ${phase}: ${status} (${(durationMs / 1000).toFixed(1)}s, ${tokens} tokens) ${notes}`)
}

// ============================================================================
// Phase 1: Analysis
// ============================================================================

async function phase1_analysis() {
  log('Importing orchestrator...')
  const { runAnalysis } = await import('../server/lib/agents/orchestrator')

  log(`Prompt #${TEST_CONFIG.id}: ${TEST_CONFIG.name}`)
  log(`Prompt: "${TEST_PROMPT.slice(0, 100)}..."`)
  log(`Hint: ${TEST_CONFIG.hint}`)
  log('Calling analyst agent...')

  const result = await runAnalysis({
    userMessage: TEST_PROMPT,
    projectId: 'e2e-test-' + Date.now(),
  })

  if (result.type === 'clarification') {
    log(`Analyst wants clarification: ${JSON.stringify(result.questions, null, 2)}`)
    log('Retrying with hint appended...')

    const result2 = await runAnalysis({
      userMessage: `${TEST_PROMPT}\n\nAdditional context: ${TEST_CONFIG.hint}`,
      projectId: 'e2e-test-' + Date.now(),
    })
    return result2
  }

  return result
}

// ============================================================================
// Phase 2: Blueprint (deterministic)
// ============================================================================

async function phase2_blueprint(analysisResult: Extract<Awaited<ReturnType<typeof phase1_analysis>>, { type: 'done' }>) {
  const { runBlueprint } = await import('../server/lib/agents/orchestrator')

  log(`App: ${analysisResult.appName}`)
  log(`Description: ${analysisResult.appDescription}`)
  log(`Tables: ${analysisResult.contract.tables.map(t => t.name).join(', ')}`)

  const result = await runBlueprint({
    userPrompt: TEST_PROMPT,
    appName: analysisResult.appName,
    appDescription: analysisResult.appDescription,
    contract: analysisResult.contract,
  })

  log(`Blueprint files: ${result.blueprint.fileTree.length}`)
  log(`LLM slot files: ${result.blueprint.fileTree.filter(f => f.isLLMSlot).length}`)

  for (const file of result.blueprint.fileTree) {
    const slotTag = file.isLLMSlot ? ' [SLOT]' : ''
    log(`  L${file.layer} ${file.path} (${file.content.length} chars)${slotTag}`)
  }

  return result.blueprint
}

// ============================================================================
// Phase 3: Provisioning
// ============================================================================

async function phase3_provisioning(appName: string) {
  const { runProvisioning } = await import('../server/lib/agents/orchestrator')

  log('Starting parallel provisioning: Sandbox + Supabase + GitHub...')

  const result = await runProvisioning({
    appName,
    projectId: 'e2e-test-' + Date.now(),
    userId: '00000000-0000-4000-8000-000000000e2e',
  })

  log(`Sandbox ID: ${result.sandboxId}`)
  log(`Supabase Project: ${result.supabaseProjectId}`)
  log(`GitHub: ${result.githubHtmlUrl}`)

  return result
}

// ============================================================================
// Phase 4: Code Generation
// ============================================================================

async function phase4_codegen(blueprint: any, contract: any, sandboxId: string, supabaseProjectId: string, supabaseUrl: string, supabaseAnonKey: string) {
  const { runCodeGeneration } = await import('../server/lib/agents/orchestrator')

  log('Running code generation (scaffold + deterministic assembly)...')

  const result = await runCodeGeneration({
    blueprint,
    contract,
    sandboxId,
    supabaseProjectId,
    supabaseUrl,
    supabaseAnonKey,
  })

  log(`Assembled files: ${result.assembledFiles.length}`)
  for (const file of result.assembledFiles) {
    log(`  ${file.path} (${file.content.length} chars)`)
  }

  if (result.warnings && result.warnings.length > 0) {
    log(`Validation warnings:`)
    for (const w of result.warnings) log(`  ${w.table}: ${w.errors.join(', ')}`)
  }

  if (result.skippedEntities?.length) {
    log(`Skipped entities: ${result.skippedEntities.join(', ')}`)
  }

  log(`Tokens: ${result.tokensUsed}`)
  return result
}

// ============================================================================
// Phase 5: Validation
// ============================================================================

async function phase5_validation(blueprint: any, sandboxId: string) {
  const { runValidation } = await import('../server/lib/agents/orchestrator')

  log('Running validation gate...')
  const result = await runValidation({ blueprint, sandboxId })

  log(`Manifest: ${result.validation.manifest.passed ? 'PASS' : 'FAIL'}`)
  log(`Scaffold: ${result.validation.scaffold.passed ? 'PASS' : 'FAIL'}`)
  log(`TypeCheck: ${result.validation.typecheck.passed ? 'PASS' : 'FAIL'}`)
  if (!result.validation.typecheck.passed) {
    for (const e of result.validation.typecheck.errors.slice(0, 5)) log(`  ${e.slice(0, 300)}`)
  }
  log(`Lint: ${result.validation.lint.passed ? 'PASS' : 'FAIL'}`)
  log(`Build: ${result.validation.build.passed ? 'PASS' : 'FAIL'}`)
  if (!result.validation.build.passed) {
    for (const e of result.validation.build.errors.slice(0, 5)) log(`  ${e.slice(0, 300)}`)
  }
  log(`Overall: ${result.allPassed ? 'ALL PASSED' : 'FAILED'}`)

  return result
}

// ============================================================================
// Phase 6: Repair (if validation failed)
// ============================================================================

async function phase6_repair(blueprint: any, validation: any, sandboxId: string, attempt: number) {
  const { runRepair } = await import('../server/lib/agents/orchestrator')

  log(`Repair attempt ${attempt}/2...`)
  const result = await runRepair({ blueprint, validation: validation.validation, sandboxId })
  log(`Repair tokens: ${result.tokensUsed}`)
  return result
}

// ============================================================================
// Phase 7: Code Review
// ============================================================================

async function phase7_codeReview(blueprint: any, contract: any, sandboxId: string) {
  const { runCodeReview } = await import('../server/lib/agents/code-review')

  log('Running code review (deterministic + LLM checks)...')
  const result = await runCodeReview({ blueprint, contract, sandboxId })

  log(`Code review passed: ${result.passed}`)
  log(`Deterministic issues: ${result.deterministicIssues.length}`)
  log(`LLM issues: ${result.llmIssues.length}`)
  log(`Tokens: ${result.tokensUsed}`)

  return result
}

// ============================================================================
// Phase 8: GitHub Push
// ============================================================================

async function phase8_githubPush(
  githubCloneUrl: string,
  blueprintFiles: Array<{ path: string; content: string; isLLMSlot: boolean }>,
  assembledFiles: Array<{ path: string; content: string }>,
) {
  const { pushFilesViaAPI } = await import('../server/lib/github')

  // Parse owner/repo from clone URL: https://github.com/OWNER/REPO[.git]
  const match = githubCloneUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match) throw new Error(`Cannot parse GitHub URL: ${githubCloneUrl}`)
  const [, owner, repo] = match

  // Merge blueprint static files + assembled LLM-slot files.
  // Assembled files take precedence (they replace slot stubs with real content).
  const fileMap = new Map<string, string>(blueprintFiles.map((f) => [f.path, f.content]))
  for (const af of assembledFiles) {
    fileMap.set(af.path, af.content)
  }
  const allFiles = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }))

  log(`Pushing ${allFiles.length} files to GitHub via REST API (${blueprintFiles.length} blueprint + ${assembledFiles.length} assembled)...`)
  log(`  Repo: ${owner}/${repo}`)

  await pushFilesViaAPI(allFiles, owner, repo)
  log('GitHub push complete (REST API — no sandbox git timeout)')
}

// ============================================================================
// Phase 9: Vercel Deployment (build in sandbox → upload dist/ → deploy)
// ============================================================================

async function phase9_vercelDeploy(
  sandboxId: string,
  appName: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<string> {
  const { getSandbox, runCommand, downloadDirectory } = await import('../server/lib/sandbox')

  const VERCEL_TOKEN = process.env.VERCEL_TOKEN
  const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

  if (!VERCEL_TOKEN) {
    throw new Error('VERCEL_TOKEN not set — skipping Vercel deployment')
  }

  const sandbox = await getSandbox(sandboxId)

  // Step 1: Write production env vars
  log('Writing production env vars to sandbox...')
  await sandbox.fs.uploadFile(
    Buffer.from(`VITE_SUPABASE_URL=${supabaseUrl}\nVITE_SUPABASE_ANON_KEY=${supabaseAnonKey}\n`),
    '/workspace/.env.production',
  )

  // Step 2: Build in sandbox
  log('Building app in sandbox (bun run build)...')
  const buildResult = await runCommand(sandbox, 'bun run build 2>&1', 'prod-build', {
    cwd: '/workspace',
    timeout: 180,
  })

  if (buildResult.exitCode !== 0) {
    throw new Error(`Production build failed: ${buildResult.stdout?.slice(-1000)}`)
  }
  log('Build succeeded')

  // Step 3: Download dist/ files
  log('Downloading dist/ from sandbox...')
  const distFiles = await downloadDirectory(sandbox, '/workspace/dist')
  log(`Downloaded ${distFiles.length} dist files`)

  // Step 4: Encode files for Vercel Files API
  // Add vercel.json with SPA rewrites so client-side routing works
  const vercelJsonContent = JSON.stringify({
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
    headers: [
      {
        source: '/assets/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ],
  })

  const vercelFiles: Array<{ file: string; data: string; encoding?: string }> = [
    { file: 'vercel.json', data: vercelJsonContent },
    ...distFiles.map((f) => {
      const relativePath = f.path.replace(/^\/workspace\/dist\//, '')
      const isText = /\.(html|js|css|txt|json|svg|map|ico|xml|woff|woff2)$/.test(relativePath)
      if (isText) {
        return { file: relativePath, data: f.content.toString('utf-8') }
      }
      return { file: relativePath, data: f.content.toString('base64'), encoding: 'base64' }
    }),
  ]

  // Step 5: Deploy to Vercel — static SPA upload (no build step)
  log(`Deploying ${vercelFiles.length} files to Vercel...`)
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ''

  // Build a slug from app name (fresh project per app, no wildcard project)
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30) + '-' + Date.now().toString(36)

  for (let attempt = 0; attempt < 2; attempt++) {
    const deployPayload: Record<string, unknown> = {
      name: slug,
      files: vercelFiles,
      // Tell Vercel: no build needed, just serve the files
      projectSettings: {
        framework: null,
        buildCommand: '',
        outputDirectory: '',
        installCommand: '',
      },
      // No `project` field — create a new project each time for clean deploys
    }

    const res = await fetch(`https://api.vercel.com/v13/deployments${teamQuery}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deployPayload),
    })

    if (!res.ok && res.status >= 500 && attempt === 0) {
      log(`Vercel returned ${res.status}, retrying...`)
      await new Promise((r) => setTimeout(r, 3000))
      continue
    }

    const data = (await res.json()) as { id?: string; url?: string; error?: { message: string }; readyState?: string }
    if (data.error) throw new Error(`Vercel API error: ${data.error.message}`)

    const deploymentId = data.id!
    log(`Deployment created: ${deploymentId}`)

    // Wait for ready — poll every 5s, up to 3 minutes
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const pollRes = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}${teamQuery}`, {
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
      })
      const pollData = (await pollRes.json()) as { readyState?: string; url?: string; errorMessage?: string }
      if (pollData.readyState === 'READY') {
        const url = `https://${pollData.url}`
        log(`✓ Deployed: ${url}`)
        return url
      }
      if (pollData.readyState === 'ERROR' || pollData.readyState === 'CANCELED') {
        // Fetch build logs to diagnose
        const logsRes = await fetch(
          `https://api.vercel.com/v2/deployments/${deploymentId}/events${teamQuery}`,
          { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
        )
        const logsText = logsRes.ok ? await logsRes.text() : '(no logs)'
        const lastLines = logsText.split('\n').slice(-20).join('\n')
        log(`Build logs (last 20 lines):\n${lastLines}`)
        throw new Error(`Vercel deploy failed: ${pollData.readyState}${pollData.errorMessage ? `: ${pollData.errorMessage}` : ''}`)
      }
      process.stdout.write(`  ${i * 5}s: ${pollData.readyState ?? 'pending'}...\r`)
    }
    throw new Error(`Deployment ${deploymentId} timed out after 3 minutes`)
  }

  throw new Error('Vercel deployment failed after retries')
}

// ============================================================================
// Cleanup
// ============================================================================

async function cleanup(sandboxId: string | null) {
  log('\n--- Cleanup ---')
  if (sandboxId) {
    try {
      const { getDaytonaClient, getSandbox } = await import('../server/lib/sandbox')
      const daytona = getDaytonaClient()
      const sandbox = await getSandbox(sandboxId)
      await daytona.delete(sandbox)
      log(`Deleted sandbox: ${sandboxId}`)
    } catch (error) {
      logError('Sandbox cleanup failed', error)
    }
  }
}

// ============================================================================
// Write learnings
// ============================================================================

function writeLearnings(results: {
  analysis: any
  blueprint: any
  provisioning: any
  codegen: any
  validation: any
  review: any
  vercelUrl: string | null
  notes: string[]
}) {
  const totalDuration = Date.now() - startTime
  const totalTokens = phaseTimings.reduce((sum, p) => sum + p.tokens, 0)
  const estimatedCost = (totalTokens / 1_000_000 * 2.5).toFixed(4) // ~$2.50/MTok for gpt-4o level

  const tableRows = phaseTimings.map((p, i) =>
    `| ${i + 1} | ${p.phase} | ${p.status} | ${(p.durationMs / 1000).toFixed(1)}s | ${p.tokens} | ${p.notes.slice(0, 80)} |`
  ).join('\n')

  const content = `# App ${TEST_CONFIG.id}: ${TEST_CONFIG.name}

**Date**: ${new Date().toISOString().split('T')[0]}
**Prompt Complexity**: ${TEST_CONFIG.name.includes('vague') ? 'Ultra-vague' : TEST_CONFIG.name.includes('complex') ? 'Complex' : 'Medium'}
**Vercel URL**: ${results.vercelUrl ? `[Live](${results.vercelUrl})` : 'N/A'}
**Total Duration**: ${(totalDuration / 1000).toFixed(1)}s
**Total Tokens**: ${totalTokens} (~$${estimatedCost})

---

## Prompt

\`\`\`
${TEST_PROMPT}
\`\`\`

## Phase Summary

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
${tableRows}

## Design Choices (from analyst)

${results.analysis ? `- **App Name**: ${results.analysis.appName}
- **Description**: ${results.analysis.appDescription}
- **Tables**: ${results.analysis.contract?.tables?.map((t: any) => t.name).join(', ')}` : 'Failed'}

## Blueprint

${results.blueprint ? `- **Total Files**: ${results.blueprint.fileTree?.length}
- **LLM Slot Files**: ${results.blueprint.fileTree?.filter((f: any) => f.isLLMSlot).length}
- **Auth**: ${results.blueprint.features?.auth ? 'Yes' : 'No'}` : 'Failed'}

## Code Generation

${results.codegen ? `- **Assembled Files**: ${results.codegen.assembledFiles?.length}
- **Tokens**: ${results.codegen.tokensUsed}
- **Warnings**: ${results.codegen.warnings?.length ?? 0}` : 'Failed'}

## Validation

${results.validation ? `- **Manifest**: ${results.validation.validation?.manifest?.passed ? 'PASS' : 'FAIL'}
- **TypeCheck**: ${results.validation.validation?.typecheck?.passed ? 'PASS' : 'FAIL'}
- **Build**: ${results.validation.validation?.build?.passed ? 'PASS' : 'FAIL'}
- **Overall**: ${results.validation.allPassed ? '✅ ALL PASSED' : '❌ FAILED'}` : 'Failed'}

## Code Review

${results.review ? `- **Passed**: ${results.review.passed}
- **Deterministic Issues**: ${results.review.deterministicIssues?.length}
- **LLM Issues**: ${results.review.llmIssues?.length}` : 'Skipped'}

## Provisioning

${results.provisioning ? `- **GitHub**: ${results.provisioning.githubHtmlUrl}
- **Supabase**: ${results.provisioning.supabaseUrl}` : 'Failed'}

## Learnings

### Architecture Observations
${results.notes.filter((n: string) => n.startsWith('[ARCH]')).map((n: string) => `- ${n.replace('[ARCH] ', '')}`).join('\n') || '(none)'}

### Bugs Found
${results.notes.filter((n: string) => n.startsWith('[BUG]')).map((n: string) => `- ${n.replace('[BUG] ', '')}`).join('\n') || '(none)'}

### Performance Notes
${results.notes.filter((n: string) => n.startsWith('[PERF]')).map((n: string) => `- ${n.replace('[PERF] ', '')}`).join('\n') || '(none)'}
`

  writeFileSync(LEARNINGS_PATH, content)
  log(`\nLearnings written to ${LEARNINGS_PATH}`)

  // Append to master learnings file
  const masterEntry = `\n## App ${TEST_CONFIG.id}: ${TEST_CONFIG.name}\n` +
    `- **URL**: ${results.vercelUrl ? results.vercelUrl : 'N/A'}\n` +
    `- **Duration**: ${(totalDuration / 1000).toFixed(1)}s | **Tokens**: ${totalTokens} (~$${estimatedCost})\n` +
    `- **Tables**: ${results.analysis?.contract?.tables?.map((t: any) => t.name).join(', ')}\n` +
    `- **Status**: ${results.validation?.allPassed ? '✅' : '❌'}\n`

  try {
    if (!existsSync(MASTER_LEARNINGS_PATH)) {
      writeFileSync(MASTER_LEARNINGS_PATH, `# 10 Apps Build Log\n\nGenerated by VibeStack — ${new Date().toISOString().split('T')[0]}\n`)
    }
    appendFileSync(MASTER_LEARNINGS_PATH, masterEntry)
    log(`Appended to master learnings: ${MASTER_LEARNINGS_PATH}`)
  } catch {
    // non-fatal
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log(`=== VibeStack E2E Pipeline — App ${TEST_CONFIG.id}/10: ${TEST_CONFIG.name} ===`)
  log(`Prompt: "${TEST_PROMPT.slice(0, 80)}..."`)
  log('')

  // Set up Helicone session context
  const sessionId = `e2e-app${TEST_CONFIG.id}-${Date.now()}`
  const { setGlobalHeliconeContext } = await import('../server/lib/agents/provider')
  setGlobalHeliconeContext({
    userId: '00000000-0000-4000-8000-000000000e2e',
    projectId: sessionId,
    sessionId,
    environment: 'e2e-10apps',
  })
  log(`Helicone session: ${sessionId}`)

  const notes: string[] = []
  let sandboxId: string | null = null
  let supabaseProjectId: string | null = null

  const results: any = {
    analysis: null,
    blueprint: null,
    provisioning: null,
    codegen: null,
    validation: null,
    review: null,
    vercelUrl: null,
    notes,
  }

  try {
    // --- Phase 1: Analysis ---
    const t1 = Date.now()
    const analysisResult = await phase1_analysis()
    const d1 = Date.now() - t1
    const tokens1 = analysisResult?.tokensUsed ?? 0

    if (!analysisResult || analysisResult.type !== 'done') {
      trackPhase('1. Analysis', d1, tokens1, 'FAIL', 'Analyst did not produce requirements')
      throw new Error('Analysis failed')
    }
    trackPhase('1. Analysis', d1, tokens1, 'PASS',
      `${analysisResult.contract.tables.length} tables`)
    results.analysis = analysisResult

    // Log theme selection from Design Agent
    if ('selectedTheme' in analysisResult) {
      log(`[design] Theme selected: ${analysisResult.selectedTheme}`)
      log(`[design] Theme reasoning: ${analysisResult.themeReasoning}`)
      const initialTableCount = analysisResult.contract.tables.length
      log(`[design] Tables from user schema: ${initialTableCount}`)
    }

    // --- Phase 2: Blueprint ---
    const t2 = Date.now()
    const blueprint = await phase2_blueprint(analysisResult)
    const d2 = Date.now() - t2
    trackPhase('2. Blueprint', d2, 0, 'PASS', `${blueprint.fileTree.length} files (deterministic)`)
    results.blueprint = blueprint

    notes.push(`[ARCH] Blueprint generates ${blueprint.fileTree.length} files across ${new Set(blueprint.fileTree.map((f: any) => f.layer)).size} layers`)

    // --- Phase 3: Provisioning ---
    const t3 = Date.now()
    const provisioningResult = await phase3_provisioning(analysisResult.appName)
    const d3 = Date.now() - t3
    sandboxId = provisioningResult.sandboxId
    supabaseProjectId = provisioningResult.supabaseProjectId
    trackPhase('3. Provisioning', d3, 0, 'PASS', `sandbox + supabase + github`)
    results.provisioning = provisioningResult
    notes.push(`[PERF] Provisioning: ${(d3/1000).toFixed(1)}s`)

    // --- Phase 4: Code Generation ---
    const t4 = Date.now()
    const codegenResult = await phase4_codegen(
      blueprint, analysisResult.contract, sandboxId,
      provisioningResult.supabaseProjectId,
      provisioningResult.supabaseUrl, provisioningResult.supabaseAnonKey,
    )
    const d4 = Date.now() - t4
    trackPhase('4. Code Generation', d4, codegenResult.tokensUsed,
      codegenResult.skippedEntities?.length ? 'PARTIAL' : 'PASS',
      `${codegenResult.assembledFiles.length} files`)
    results.codegen = codegenResult

    if (codegenResult.warnings?.length) {
      notes.push(`[BUG] Code gen warnings: ${JSON.stringify(codegenResult.warnings)}`)
    }

    // --- Phase 5: Validation ---
    const t5 = Date.now()
    let validationResult = await phase5_validation(blueprint, sandboxId)
    const d5 = Date.now() - t5
    trackPhase('5. Validation', d5, 0, validationResult.allPassed ? 'PASS' : 'FAIL',
      `manifest=${validationResult.validation.manifest.passed} tsc=${validationResult.validation.typecheck.passed} build=${validationResult.validation.build.passed}`)
    results.validation = validationResult

    // --- Phase 6: Repair (if needed, up to 2 attempts) ---
    if (!validationResult.allPassed) {
      for (let attempt = 1; attempt <= 2 && !validationResult.allPassed; attempt++) {
        const t6 = Date.now()
        await phase6_repair(blueprint, validationResult, sandboxId, attempt)
        const d6 = Date.now() - t6

        // Re-validate
        validationResult = await phase5_validation(blueprint, sandboxId)
        trackPhase(`6. Repair #${attempt}`, d6, 0,
          validationResult.allPassed ? 'PASS' : 'FAIL',
          `tsc=${validationResult.validation.typecheck.passed} build=${validationResult.validation.build.passed}`)
        results.validation = validationResult
        notes.push(`[BUG] Needed repair attempt ${attempt}`)
      }
    }

    // --- Phase 7: Code Review ---
    if (validationResult.allPassed) {
      try {
        const t7 = Date.now()
        const reviewResult = await phase7_codeReview(blueprint, analysisResult.contract, sandboxId)
        const d7 = Date.now() - t7
        trackPhase('7. Code Review', d7, reviewResult.tokensUsed,
          reviewResult.passed ? 'PASS' : 'WARN',
          `${reviewResult.deterministicIssues.length} det + ${reviewResult.llmIssues.length} LLM issues`)
        results.review = reviewResult
      } catch (error) {
        logError('Code review failed (non-blocking)', error)
      }
    }

    // --- Phase 8: GitHub Push ---
    if (provisioningResult.githubCloneUrl) {
      try {
        const t8 = Date.now()
        await phase8_githubPush(provisioningResult.githubCloneUrl, blueprint.fileTree, codegenResult.assembledFiles)
        const d8 = Date.now() - t8
        trackPhase('8. GitHub Push', d8, 0, 'PASS', provisioningResult.githubHtmlUrl)
      } catch (error) {
        logError('GitHub push failed', error)
        notes.push(`[BUG] GitHub push failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // --- Phase 9: Vercel Deploy ---
    if (validationResult.allPassed) {
      try {
        const t9 = Date.now()
        const vercelUrl = await phase9_vercelDeploy(
          sandboxId,
          analysisResult.appName,
          provisioningResult.supabaseUrl,
          provisioningResult.supabaseAnonKey,
        )
        const d9 = Date.now() - t9
        trackPhase('9. Vercel Deploy', d9, 0, 'PASS', vercelUrl)
        results.vercelUrl = vercelUrl

        log(`\n🚀 APP ${TEST_CONFIG.id} LIVE: ${vercelUrl}`)
        log(`   App: ${analysisResult.appName}`)

        // --- Phase 9.5: Update Supabase Auth SITE_URL ---
        // Must run after Vercel deploy so we know the live URL.
        // Fixes confirmation/magic-link emails redirecting to localhost:3000.
        if (blueprint.features?.auth && provisioningResult?.supabaseProjectId) {
          try {
            const { updateAuthConfig } = await import('../server/lib/supabase-mgmt')
            await updateAuthConfig(provisioningResult.supabaseProjectId, vercelUrl)
            log(`   Auth SITE_URL updated: ${vercelUrl}`)
          } catch (authErr) {
            logError('Auth config update failed (non-blocking)', authErr)
            notes.push(`[BUG] Supabase SITE_URL update failed: ${authErr instanceof Error ? authErr.message : String(authErr)}`)
          }
        }
      } catch (error) {
        logError('Vercel deploy failed', error)
        notes.push(`[BUG] Vercel deploy failed: ${error instanceof Error ? error.message : String(error)}`)
        trackPhase('9. Vercel Deploy', 0, 0, 'FAIL', (error instanceof Error ? error.message : String(error)).slice(0, 100))
      }
    } else {
      trackPhase('9. Vercel Deploy', 0, 0, 'SKIP', 'validation failed')
    }

    // --- Summary ---
    const totalDuration = Date.now() - startTime
    const totalTokens = phaseTimings.reduce((sum, p) => sum + p.tokens, 0)

    log('\n' + '='.repeat(60))
    log(`APP ${TEST_CONFIG.id} COMPLETE: ${TEST_CONFIG.name}`)
    log('='.repeat(60))
    log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`)
    log(`Total tokens: ${totalTokens} (~$${(totalTokens / 1_000_000 * 2.5).toFixed(4)})`)
    log(`Phases: ${phaseTimings.filter(p => p.status === 'PASS').length}/${phaseTimings.length} passed`)
    if (results.vercelUrl) log(`🔗 Live URL: ${results.vercelUrl}`)
    if (provisioningResult?.githubHtmlUrl) log(`📦 GitHub: ${provisioningResult.githubHtmlUrl}`)

  } catch (error) {
    logError('Pipeline failed', error)
    notes.push(`[BUG] Pipeline failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    writeLearnings(results)

    // Cleanup sandbox
    await cleanup(sandboxId)

    log('\n--- Resources Retained ---')
    if (supabaseProjectId) log(`  Supabase: ${supabaseProjectId} (retained for inspection)`)
  }
}

main().catch(console.error)
