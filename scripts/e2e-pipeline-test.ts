#!/usr/bin/env bun
/**
 * E2E Pipeline Test Runner
 *
 * Runs the full VibeStack generation pipeline step-by-step:
 *   Analysis → Blueprint → Provisioning → Scaffold → CodeGen → Validation → Review → GitHub Push
 *
 * Skips: Vercel deployment (as requested)
 * Model: gpt-5.2 via Helicone proxy
 *
 * Usage:
 *   bun scripts/e2e-pipeline-test.ts
 *
 * Env: reads from .env.local automatically (bun feature)
 */

import { writeFileSync, appendFileSync } from 'node:fs'

// ============================================================================
// Config
// ============================================================================

const TEST_PROMPT = `Build a personal bookmarks manager. Users can save URLs with a title, description,
and tags. They can search bookmarks by title or tag, and star their favorites.`

const LEARNINGS_PATH = 'docs/e2e-pipeline-learnings.md'

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

async function runPhase<T>(phaseName: string, fn: () => Promise<T>): Promise<T | null> {
  log(`\n${'='.repeat(60)}`)
  log(`PHASE: ${phaseName}`)
  log(`${'='.repeat(60)}`)
  const phaseStart = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - phaseStart
    trackPhase(phaseName, duration, 0, 'PASS') // tokens updated by caller
    return result
  } catch (error) {
    const duration = Date.now() - phaseStart
    const errMsg = error instanceof Error ? error.message : String(error)
    trackPhase(phaseName, duration, 0, 'FAIL', errMsg.slice(0, 200))
    logError(phaseName, error)
    return null
  }
}

// ============================================================================
// Phase 1: Analysis
// ============================================================================

async function phase1_analysis() {
  log('Importing orchestrator...')
  const { runAnalysis } = await import('../server/lib/agents/orchestrator')

  log(`Prompt: "${TEST_PROMPT.slice(0, 80)}..."`)
  log('Calling analyst agent (gpt-5.2)...')

  const result = await runAnalysis({
    userMessage: TEST_PROMPT,
    projectId: 'e2e-test-' + Date.now(),
  })

  if (result.type === 'clarification') {
    log(`Analyst wants clarification: ${JSON.stringify(result.questions, null, 2)}`)
    log('NOTE: In production, the machine would pause here for user input.')
    log('For this test, re-running with enhanced prompt...')

    const enhancedPrompt = `${TEST_PROMPT}

Additional details:
- Authentication: email/password via Supabase Auth
- Styling: modern minimal, primary color #3b82f6 (blue), Inter font
- Each bookmark has: url (required), title, description, tags (text array), is_starred (boolean)
- RLS: users only see their own bookmarks`

    const result2 = await runAnalysis({
      userMessage: enhancedPrompt,
      projectId: 'e2e-test-' + Date.now(),
    })
    return result2
  }

  return result
}

// ============================================================================
// Phase 2: Blueprint (deterministic — 0 tokens)
// ============================================================================

async function phase2_blueprint(analysisResult: Extract<Awaited<ReturnType<typeof phase1_analysis>>, { type: 'done' }>) {
  const { runBlueprint } = await import('../server/lib/agents/orchestrator')

  log(`App: ${analysisResult.appName}`)
  log(`Description: ${analysisResult.appDescription}`)
  log(`Tables: ${analysisResult.contract.tables.map(t => t.name).join(', ')}`)
  log(`Columns per table: ${analysisResult.contract.tables.map(t => `${t.name}(${t.columns.length})`).join(', ')}`)

  const result = runBlueprint({
    appName: analysisResult.appName,
    appDescription: analysisResult.appDescription,
    contract: analysisResult.contract,
    designPreferences: analysisResult.designPreferences,
  })

  log(`Blueprint files: ${result.blueprint.fileTree.length}`)
  log(`LLM slot files: ${result.blueprint.fileTree.filter(f => f.isLLMSlot).length}`)
  log(`File layers: ${[...new Set(result.blueprint.fileTree.map(f => f.layer))].sort().join(', ')}`)

  for (const file of result.blueprint.fileTree) {
    const slotTag = file.isLLMSlot ? ' [SLOT]' : ''
    log(`  L${file.layer} ${file.path} (${file.content.length} chars)${slotTag}`)
  }

  return result.blueprint
}

// ============================================================================
// Phase 3: Provisioning (Sandbox + Supabase + GitHub)
// ============================================================================

async function phase3_provisioning(appName: string) {
  const { runProvisioning } = await import('../server/lib/agents/orchestrator')

  log('Starting parallel provisioning: Sandbox + Supabase + GitHub...')

  const result = await runProvisioning({
    appName,
    projectId: 'e2e-test-' + Date.now(),
    userId: 'e2e-test-user',
  })

  log(`Sandbox ID: ${result.sandboxId}`)
  log(`Supabase Project: ${result.supabaseProjectId}`)
  log(`Supabase URL: ${result.supabaseUrl}`)
  log(`GitHub Clone URL: ${result.githubCloneUrl}`)
  log(`GitHub HTML URL: ${result.githubHtmlUrl}`)
  log(`Repo Name: ${result.repoName}`)

  return result
}

// ============================================================================
// Phase 4: Write Blueprint Files to Sandbox
// ============================================================================

async function phase4_scaffold(blueprint: any, sandboxId: string, supabaseUrl: string, supabaseAnonKey: string) {
  const { getSandbox, uploadFile: upload } = await import('../server/lib/sandbox')

  log(`Getting sandbox: ${sandboxId}`)
  const sandbox = await getSandbox(sandboxId)

  // Write all blueprint files to sandbox, replacing .env placeholders
  log(`Writing ${blueprint.fileTree.length} blueprint files to sandbox...`)

  let written = 0
  for (const file of blueprint.fileTree) {
    let content = file.content

    // Replace .env placeholders with real credentials
    if (file.path === '.env') {
      content = content
        .replace('DATABASE_URL=__PLACEHOLDER__', `DATABASE_URL=${supabaseUrl}`)
        .replace('SUPABASE_URL=__PLACEHOLDER__', `SUPABASE_URL=${supabaseUrl}`)
        .replace('SUPABASE_ANON_KEY=__PLACEHOLDER__', `SUPABASE_ANON_KEY=${supabaseAnonKey}`)
    }

    const remotePath = `/workspace/${file.path}`

    // Ensure parent directory exists
    const dir = remotePath.split('/').slice(0, -1).join('/')
    try {
      await sandbox.process.executeCommand(`mkdir -p ${dir}`, '/workspace', undefined, 5)
    } catch {
      // ignore if dir exists
    }

    await upload(sandbox, content, remotePath)
    written++
  }

  log(`Wrote ${written}/${blueprint.fileTree.length} files to sandbox`)

  // Install dependencies
  log('Installing dependencies in sandbox...')
  const installResult = await sandbox.process.executeCommand(
    'bun install --frozen-lockfile 2>&1 || bun install 2>&1',
    '/workspace',
    undefined,
    120,
  )
  log(`bun install exit code: ${installResult.exitCode}`)
  if (installResult.exitCode !== 0) {
    log(`bun install output: ${installResult.result?.slice(-500)}`)
  }

  return sandbox
}

// ============================================================================
// Phase 5: Code Generation (LLM fills SLOT markers)
// ============================================================================

async function phase5_codegen(blueprint: any, contract: any, sandboxId: string, supabaseUrl: string, supabaseAnonKey: string) {
  const { runCodeGeneration } = await import('../server/lib/agents/orchestrator')

  log('Running code generation (scaffold + LLM fill + assembly write)...')

  const result = await runCodeGeneration({
    blueprint,
    contract,
    sandboxId,
    supabaseUrl,
    supabaseAnonKey,
  })

  log(`Assembled files: ${result.assembledFiles.length}`)
  for (const file of result.assembledFiles) {
    log(`  ${file.path} (${file.content.length} chars)`)
  }

  if (result.warnings && result.warnings.length > 0) {
    log(`Validation warnings:`)
    for (const w of result.warnings) {
      log(`  ${w.table}: ${w.errors.join(', ')}`)
    }
  }

  if (result.skippedEntities && result.skippedEntities.length > 0) {
    log(`Skipped entities: ${result.skippedEntities.join(', ')}`)
  }

  log(`Tokens used: ${result.tokensUsed}`)
  return result
}

// ============================================================================
// Phase 6: Write Assembled Files to Sandbox
// ============================================================================

async function phase6_assemblyWrite(assembledFiles: Array<{ path: string; content: string }>, sandboxId: string) {
  const { getSandbox, uploadFile: upload } = await import('../server/lib/sandbox')

  const sandbox = await getSandbox(sandboxId)
  log(`Writing ${assembledFiles.length} assembled files to sandbox (overwriting skeleton SLOT files)...`)

  for (const file of assembledFiles) {
    const remotePath = `/workspace/${file.path}`
    const dir = remotePath.split('/').slice(0, -1).join('/')
    try {
      await sandbox.process.executeCommand(`mkdir -p ${dir}`, '/workspace', undefined, 5)
    } catch {
      // ignore
    }
    await upload(sandbox, file.content, remotePath)
  }

  log(`Wrote ${assembledFiles.length} assembled files`)

  // List files in workspace for verification
  const lsResult = await sandbox.process.executeCommand(
    'find /workspace -type f ! -path "*/node_modules/*" ! -path "*/.git/*" | wc -l',
    '/workspace',
    undefined,
    10,
  )
  log(`Total files in sandbox workspace: ${lsResult.result?.trim()}`)

  return sandbox
}

// ============================================================================
// Phase 7: Validation
// ============================================================================

async function phase7_validation(blueprint: any, sandboxId: string) {
  const { runValidation } = await import('../server/lib/agents/orchestrator')

  log('Running validation gate: manifest → scaffold → tsc → lint → build...')

  const result = await runValidation({ blueprint, sandboxId })

  log(`Manifest: ${result.validation.manifest.passed ? 'PASS' : 'FAIL'}`)
  if (!result.validation.manifest.passed) {
    for (const e of result.validation.manifest.errors.slice(0, 10)) log(`  ${e}`)
  }

  log(`Scaffold: ${result.validation.scaffold.passed ? 'PASS' : 'FAIL'}`)
  if (!result.validation.scaffold.passed) {
    for (const e of result.validation.scaffold.errors.slice(0, 10)) log(`  ${e}`)
  }

  log(`TypeCheck: ${result.validation.typecheck.passed ? 'PASS' : 'FAIL'}`)
  if (!result.validation.typecheck.passed) {
    for (const e of result.validation.typecheck.errors.slice(0, 5)) log(`  ${e.slice(0, 300)}`)
  }

  log(`Lint: ${result.validation.lint.passed ? 'PASS' : 'FAIL'}`)
  if (!result.validation.lint.passed) {
    for (const e of result.validation.lint.errors.slice(0, 5)) log(`  ${e.slice(0, 300)}`)
  }

  log(`Build: ${result.validation.build.passed ? 'PASS' : 'FAIL'}`)
  if (!result.validation.build.passed) {
    for (const e of result.validation.build.errors.slice(0, 5)) log(`  ${e.slice(0, 300)}`)
  }

  log(`Overall: ${result.allPassed ? 'ALL PASSED' : 'FAILED'}`)

  return result
}

// ============================================================================
// Phase 8: Repair (if needed)
// ============================================================================

async function phase8_repair(blueprint: any, validation: any, sandboxId: string, attempt: number) {
  const { runRepair } = await import('../server/lib/agents/orchestrator')

  log(`Repair attempt ${attempt}/2...`)

  const result = await runRepair({
    blueprint,
    validation: validation.validation,
    sandboxId,
  })

  log(`Repair tokens used: ${result.tokensUsed}`)
  return result
}

// ============================================================================
// Phase 9: Code Review
// ============================================================================

async function phase9_codeReview(blueprint: any, contract: any, sandboxId: string) {
  const { runCodeReview } = await import('../server/lib/agents/code-review')

  log('Running code review (deterministic + LLM checks)...')

  const result = await runCodeReview({ blueprint, contract, sandboxId })

  log(`Code review passed: ${result.passed}`)
  log(`Deterministic issues: ${result.deterministicIssues.length}`)
  for (const issue of result.deterministicIssues) {
    log(`  [${issue.severity}] ${issue.file}: ${issue.message}`)
  }
  log(`LLM issues: ${result.llmIssues.length}`)
  for (const issue of result.llmIssues) {
    log(`  [${issue.severity}/${issue.category}] ${issue.file}: ${issue.description}`)
  }
  log(`Tokens used: ${result.tokensUsed}`)

  return result
}

// ============================================================================
// Phase 10: GitHub Push (skip Vercel)
// ============================================================================

async function phase10_githubPush(sandboxId: string, githubCloneUrl: string, repoName: string) {
  const { getSandbox, runCommand } = await import('../server/lib/sandbox')
  const { getInstallationToken } = await import('../server/lib/github')

  const sandbox = await getSandbox(sandboxId)

  log('Pushing generated code to GitHub...')

  // Get installation token for authenticated push
  const token = await getInstallationToken()
  // Build authenticated URL: https://x-access-token:TOKEN@github.com/org/repo.git
  const authenticatedUrl = githubCloneUrl.replace(
    'https://github.com/',
    `https://x-access-token:${token}@github.com/`,
  )

  // Git init + add + commit + push
  const commands = [
    'git init',
    'git config user.email "vibestack@vibestack.com"',
    'git config user.name "VibeStack Bot"',
    'git add -A',
    'git commit -m "Initial generation by VibeStack"',
    `git remote add origin ${authenticatedUrl}`,
    'git branch -M main',
    'git push -u origin main --force',
  ]

  for (const cmd of commands) {
    // Don't log the token
    const displayCmd = cmd.includes('x-access-token') ? 'git remote add origin https://x-access-token:***@github.com/...' : cmd
    log(`  $ ${displayCmd}`)
    const result = await runCommand(sandbox, cmd, 'git-push', {
      cwd: '/workspace',
      timeout: cmd.includes('push') ? 120 : 30,
    })
    if (result.exitCode !== 0 && !cmd.includes('remote add')) {
      log(`  Exit code: ${result.exitCode}`)
      log(`  Output: ${result.stdout?.slice(-300)}`)
      if (result.stderr) log(`  Stderr: ${result.stderr.slice(-300)}`)
    }
  }

  log('GitHub push complete')
}

// ============================================================================
// Cleanup
// ============================================================================

async function cleanup(sandboxId: string | null, supabaseProjectId: string | null) {
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

  // NOTE: Not cleaning up Supabase project — user may want to inspect it
  if (supabaseProjectId) {
    log(`Supabase project retained for inspection: ${supabaseProjectId}`)
  }
}

// ============================================================================
// Write learnings file
// ============================================================================

function writeLearnings(results: {
  analysis: any
  blueprint: any
  provisioning: any
  codegen: any
  validation: any
  repair: any
  review: any
  notes: string[]
}) {
  const totalDuration = Date.now() - startTime
  const totalTokens = phaseTimings.reduce((sum, p) => sum + p.tokens, 0)

  const tableRows = phaseTimings.map((p, i) =>
    `| ${i + 1} | ${p.phase} | ${p.status} | ${(p.durationMs / 1000).toFixed(1)}s | ${p.tokens} | ${p.notes.slice(0, 80)} |`
  ).join('\n')

  const content = `# E2E Pipeline Run — Learnings & Observations

**Date**: 2026-02-17
**Test Prompt**: Test 1 (Simple CRUD — Bookmarks Manager)
**Model**: gpt-5.2 via Helicone proxy
**Total Duration**: ${(totalDuration / 1000).toFixed(1)}s
**Total Tokens**: ${totalTokens}

---

## Pipeline Phases

| # | Phase | Status | Duration | Tokens | Notes |
|---|-------|--------|----------|--------|-------|
${tableRows}

## Analysis Output

${results.analysis ? `- **App Name**: ${results.analysis.appName}
- **Description**: ${results.analysis.appDescription}
- **Tables**: ${results.analysis.contract?.tables?.map((t: any) => t.name).join(', ')}
- **Tokens**: ${results.analysis.tokensUsed}` : 'Failed'}

## Blueprint Output

${results.blueprint ? `- **Total Files**: ${results.blueprint.fileTree?.length}
- **LLM Slot Files**: ${results.blueprint.fileTree?.filter((f: any) => f.isLLMSlot).length}
- **Layers**: ${[...new Set(results.blueprint.fileTree?.map((f: any) => f.layer))].sort().join(', ')}` : 'Failed'}

## Provisioning Output

${results.provisioning ? `- **Sandbox**: ${results.provisioning.sandboxId}
- **Supabase**: ${results.provisioning.supabaseProjectId} (${results.provisioning.supabaseUrl})
- **GitHub**: ${results.provisioning.githubHtmlUrl}` : 'Failed'}

## Code Generation Output

${results.codegen ? `- **Assembled Files**: ${results.codegen.assembledFiles?.length}
- **Tokens**: ${results.codegen.tokensUsed}
- **Warnings**: ${results.codegen.warnings?.length ?? 0}
- **Skipped**: ${results.codegen.skippedEntities?.join(', ') || 'none'}` : 'Failed'}

## Validation Output

${results.validation ? `- **Manifest**: ${results.validation.validation?.manifest?.passed ? 'PASS' : 'FAIL'}
- **Scaffold**: ${results.validation.validation?.scaffold?.passed ? 'PASS' : 'FAIL'}
- **TypeCheck**: ${results.validation.validation?.typecheck?.passed ? 'PASS' : 'FAIL'}
- **Lint**: ${results.validation.validation?.lint?.passed ? 'PASS' : 'FAIL'}
- **Build**: ${results.validation.validation?.build?.passed ? 'PASS' : 'FAIL'}
- **Overall**: ${results.validation.allPassed ? 'ALL PASSED' : 'FAILED'}` : 'Failed'}

## Code Review Output

${results.review ? `- **Passed**: ${results.review.passed}
- **Deterministic Issues**: ${results.review.deterministicIssues?.length}
- **LLM Issues**: ${results.review.llmIssues?.length}
- **Tokens**: ${results.review.tokensUsed}` : 'Skipped or Failed'}

## Learnings

### Architecture Observations

${results.notes.filter(n => n.startsWith('[ARCH]')).map(n => `- ${n.replace('[ARCH] ', '')}`).join('\n') || '(none)'}

### Bugs Found

${results.notes.filter(n => n.startsWith('[BUG]')).map(n => `- ${n.replace('[BUG] ', '')}`).join('\n') || '(none)'}

### Performance Notes

${results.notes.filter(n => n.startsWith('[PERF]')).map(n => `- ${n.replace('[PERF] ', '')}`).join('\n') || '(none)'}

### Recommendations

${results.notes.filter(n => n.startsWith('[REC]')).map(n => `- ${n.replace('[REC] ', '')}`).join('\n') || '(none)'}
`

  writeFileSync(LEARNINGS_PATH, content)
  log(`\nLearnings written to ${LEARNINGS_PATH}`)
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log('=== VibeStack E2E Pipeline Test ===')
  log(`Test Prompt: "${TEST_PROMPT.slice(0, 60)}..."`)
  log(`Model: gpt-5.2 via Helicone`)
  log('')

  const notes: string[] = []
  let sandboxId: string | null = null
  let supabaseProjectId: string | null = null

  const results: any = {
    analysis: null,
    blueprint: null,
    provisioning: null,
    codegen: null,
    validation: null,
    repair: null,
    review: null,
    notes,
  }

  try {
    // --- Phase 1: Analysis ---
    const phaseStart1 = Date.now()
    const analysisResult = await phase1_analysis()
    const duration1 = Date.now() - phaseStart1
    const tokens1 = analysisResult?.tokensUsed ?? 0

    if (!analysisResult || analysisResult.type !== 'done') {
      trackPhase('1. Analysis', duration1, tokens1, 'FAIL', 'Analyst did not produce requirements')
      throw new Error('Analysis failed to produce requirements')
    }

    // Overwrite the auto-tracked phase with correct tokens
    phaseTimings.pop() // remove the runPhase auto-entry if any
    trackPhase('1. Analysis', duration1, tokens1, 'PASS', `${analysisResult.contract.tables.length} tables`)
    results.analysis = analysisResult

    // --- Phase 2: Blueprint ---
    const phaseStart2 = Date.now()
    const blueprint = await phase2_blueprint(analysisResult)
    const duration2 = Date.now() - phaseStart2
    trackPhase('2. Blueprint', duration2, 0, 'PASS', `${blueprint.fileTree.length} files (deterministic)`)
    results.blueprint = blueprint

    notes.push(`[ARCH] Blueprint generates ${blueprint.fileTree.length} files across ${[...new Set(blueprint.fileTree.map(f => f.layer))].length} layers`)
    notes.push(`[ARCH] ${blueprint.fileTree.filter(f => f.isLLMSlot).length} files have SLOT markers for LLM filling`)

    // --- Phase 3: Provisioning ---
    const phaseStart3 = Date.now()
    const provisioningResult = await phase3_provisioning(analysisResult.appName)
    const duration3 = Date.now() - phaseStart3
    sandboxId = provisioningResult.sandboxId
    supabaseProjectId = provisioningResult.supabaseProjectId
    trackPhase('3. Provisioning', duration3, 0, 'PASS', `sandbox=${sandboxId?.slice(0, 8)}... supabase=${supabaseProjectId?.slice(0, 8)}...`)
    results.provisioning = provisioningResult

    notes.push(`[PERF] Provisioning took ${(duration3 / 1000).toFixed(1)}s (parallel: sandbox + supabase + github)`)

    // --- Phase 4: Code Generation (now includes scaffold write + assembly write) ---
    const phaseStart5 = Date.now()
    const codegenResult = await phase5_codegen(
      blueprint, analysisResult.contract, sandboxId,
      provisioningResult.supabaseUrl, provisioningResult.supabaseAnonKey,
    )
    const duration5 = Date.now() - phaseStart5
    trackPhase('4. Code Generation', duration5, codegenResult.tokensUsed,
      codegenResult.skippedEntities?.length ? 'PARTIAL' : 'PASS',
      `${codegenResult.assembledFiles.length} files, ${codegenResult.tokensUsed} tokens${codegenResult.skippedEntities?.length ? `, skipped: ${codegenResult.skippedEntities.join(', ')}` : ''}`)
    results.codegen = codegenResult

    notes.push(`[PERF] Code gen took ${(duration5 / 1000).toFixed(1)}s for ${codegenResult.assembledFiles.length} assembled files`)
    if (codegenResult.warnings?.length) {
      notes.push(`[BUG] Code gen validation warnings: ${JSON.stringify(codegenResult.warnings)}`)
    }

    // --- Phase 5: Validation ---
    const phaseStart7 = Date.now()
    let validationResult = await phase7_validation(blueprint, sandboxId)
    const duration7 = Date.now() - phaseStart7
    trackPhase('5. Validation', duration7, 0, validationResult.allPassed ? 'PASS' : 'FAIL',
      `manifest=${validationResult.validation.manifest.passed} scaffold=${validationResult.validation.scaffold.passed} tsc=${validationResult.validation.typecheck.passed} build=${validationResult.validation.build.passed}`)
    results.validation = validationResult

    // --- Phase 6: Repair (up to 2 attempts) ---
    let repairAttempt = 0
    while (!validationResult.allPassed && repairAttempt < 2) {
      repairAttempt++
      const phaseStart8 = Date.now()
      const repairResult = await phase8_repair(blueprint, validationResult, sandboxId, repairAttempt)
      const duration8 = Date.now() - phaseStart8
      trackPhase(`6. Repair #${repairAttempt}`, duration8, repairResult.tokensUsed, 'DONE', `${repairResult.tokensUsed} tokens`)
      results.repair = repairResult

      // Re-validate
      const revalStart = Date.now()
      validationResult = await phase7_validation(blueprint, sandboxId)
      const revalDuration = Date.now() - revalStart
      trackPhase(`5b. Re-Validation #${repairAttempt}`, revalDuration, 0, validationResult.allPassed ? 'PASS' : 'FAIL',
        `tsc=${validationResult.validation.typecheck.passed} build=${validationResult.validation.build.passed}`)
      results.validation = validationResult
    }

    // --- Phase 7: Code Review ---
    if (validationResult.allPassed) {
      try {
        const phaseStart9 = Date.now()
        const reviewResult = await phase9_codeReview(blueprint, analysisResult.contract, sandboxId)
        const duration9 = Date.now() - phaseStart9
        trackPhase('7. Code Review', duration9, reviewResult.tokensUsed,
          reviewResult.passed ? 'PASS' : 'WARN',
          `${reviewResult.deterministicIssues.length} deterministic + ${reviewResult.llmIssues.length} LLM issues`)
        results.review = reviewResult
      } catch (error) {
        logError('Code review failed (non-blocking)', error)
        notes.push(`[BUG] Code review threw: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      log('Skipping code review — validation did not pass')
      trackPhase('7. Code Review', 0, 0, 'SKIP', 'validation failed')
    }

    // --- Phase 8: GitHub Push ---
    if (provisioningResult.githubCloneUrl) {
      try {
        const phaseStart10 = Date.now()
        await phase10_githubPush(sandboxId, provisioningResult.githubCloneUrl, provisioningResult.repoName)
        const duration10 = Date.now() - phaseStart10
        trackPhase('10. GitHub Push', duration10, 0, 'PASS', provisioningResult.githubHtmlUrl)
      } catch (error) {
        logError('GitHub push failed', error)
        notes.push(`[BUG] GitHub push failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // --- Summary ---
    const totalDuration = Date.now() - startTime
    const totalTokens = phaseTimings.reduce((sum, p) => sum + p.tokens, 0)

    log('\n' + '='.repeat(60))
    log('PIPELINE COMPLETE')
    log('='.repeat(60))
    log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`)
    log(`Total tokens: ${totalTokens}`)
    log(`Phases: ${phaseTimings.filter(p => p.status === 'PASS').length}/${phaseTimings.length} passed`)
    log(`Validation: ${validationResult.allPassed ? 'ALL PASSED' : 'FAILED'}`)
    if (provisioningResult.githubHtmlUrl) {
      log(`GitHub: ${provisioningResult.githubHtmlUrl}`)
    }
    if (provisioningResult.supabaseUrl) {
      log(`Supabase: ${provisioningResult.supabaseUrl}`)
    }

  } catch (error) {
    logError('Pipeline failed', error)
    notes.push(`[BUG] Pipeline failed at top level: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    // Write learnings file
    writeLearnings(results)

    // Ask before cleanup
    log('\n--- Resources Created ---')
    if (sandboxId) log(`  Sandbox: ${sandboxId}`)
    if (supabaseProjectId) log(`  Supabase: ${supabaseProjectId}`)
    log('NOTE: Not auto-deleting resources — inspect them first, then delete manually.')
  }
}

// Run
main().catch(console.error)
