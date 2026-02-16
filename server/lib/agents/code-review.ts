import type { SchemaContract } from '../schema-contract'
import type { AppBlueprint } from '../app-blueprint'
import { z } from 'zod'

// ============================================================================
// Types
// ============================================================================

export interface DeterministicIssue {
  type: 'missing_route_export' | 'contract_mismatch' | 'hardcoded_secret' | 'missing_error_boundary' | 'missing_loading_state'
  file: string
  message: string
  severity: 'critical' | 'warning'
}

export interface LLMReviewIssue {
  severity: 'critical' | 'warning' | 'info'
  category: 'ux' | 'logic' | 'security' | 'accessibility' | 'performance'
  file: string
  description: string
  suggestion: string
}

export interface CodeReviewResult {
  passed: boolean  // true if no critical issues
  deterministicIssues: DeterministicIssue[]
  llmIssues: LLMReviewIssue[]
  tokensUsed: number
}

// ============================================================================
// Deterministic Checks
// ============================================================================

export function runDeterministicChecks(
  blueprint: AppBlueprint,
  contract: SchemaContract,
): DeterministicIssue[] {
  const issues: DeterministicIssue[] = []

  for (const file of blueprint.fileTree) {
    // 1. Route files must export Route constant (TanStack Router requirement)
    if (file.path.startsWith('src/routes/') && file.path.endsWith('.tsx')) {
      // Check for the export (not in a comment) - use regex to match actual export statement
      const hasRouteExport = /^\s*export\s+const\s+Route\s*=/m.test(file.content)
      if (!hasRouteExport) {
        issues.push({
          type: 'missing_route_export',
          file: file.path,
          message: 'Route file missing `export const Route` — TanStack Router will fail to load this route',
          severity: 'critical',
        })
      }
    }

    // 2. Hardcoded secrets — regex for API keys, tokens, passwords
    const secretPatterns = [
      /sk[-_]live[-_][a-zA-Z0-9]{20,}/,  // Stripe live key
      /sk[-_]test[-_][a-zA-Z0-9]{20,}/,  // Stripe test key
      /supabase.*(?:key|token|secret)\s*[:=]\s*['"][a-zA-Z0-9.+/=]{30,}['"]/i,
      /(?:password|secret|token|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    ]
    for (const pattern of secretPatterns) {
      if (pattern.test(file.content)) {
        issues.push({
          type: 'hardcoded_secret',
          file: file.path,
          message: `Possible hardcoded secret detected: ${pattern.source.slice(0, 40)}...`,
          severity: 'critical',
        })
      }
    }

    // 3. Missing error boundaries in route files
    if (file.path.startsWith('src/routes/') && file.path.endsWith('.tsx')) {
      if (!file.content.includes('ErrorComponent') && !file.content.includes('errorComponent')) {
        issues.push({
          type: 'missing_error_boundary',
          file: file.path,
          message: 'Route file has no error boundary — unhandled errors will crash the app',
          severity: 'warning',
        })
      }
    }

    // 4. Missing loading states
    if (file.path.startsWith('src/routes/') && file.path.endsWith('.tsx')) {
      if (file.content.includes('useQuery') && !file.content.includes('isLoading') && !file.content.includes('isPending')) {
        issues.push({
          type: 'missing_loading_state',
          file: file.path,
          message: 'Component uses useQuery but has no loading state handling',
          severity: 'warning',
        })
      }
    }
  }

  // 5. Contract compliance: every non-junction table should have list + detail pages
  for (const table of contract.tables) {
    if (table.name.startsWith('_')) continue
    const entityKebab = table.name.replace(/_/g, '-')
    // Check for list page
    const hasListPage = blueprint.fileTree.some(f =>
      f.path.includes(entityKebab) && f.path.includes('routes')
    )
    if (!hasListPage) {
      issues.push({
        type: 'contract_mismatch',
        file: 'src/routes/',
        message: `No route page found for entity "${table.name}" — contract specifies this table but no UI exists`,
        severity: 'warning',
      })
    }
  }

  return issues
}

// ============================================================================
// LLM Review (gpt-5.2)
// ============================================================================

// Zod schema for structured output
const LLMReviewSchema = z.object({
  issues: z.array(z.object({
    severity: z.enum(['critical', 'warning', 'info']),
    category: z.enum(['ux', 'logic', 'security', 'accessibility', 'performance']),
    file: z.string(),
    description: z.string(),
    suggestion: z.string(),
  })),
  summary: z.string(),
})

export async function runLLMReview(
  blueprint: AppBlueprint,
  contract: SchemaContract,
): Promise<{ issues: LLMReviewIssue[]; tokensUsed: number }> {
  // Dynamic imports to avoid circular deps
  const { Agent } = await import('@mastra/core/agent')
  const { createHeliconeProvider } = await import('./provider')

  // Create a lightweight review agent
  const reviewAgent = new Agent({
    id: 'code-reviewer',
    name: 'code-reviewer',
    instructions: 'You are a code review expert. Review generated application code for functional, UX, security, and accessibility issues. Only report real, actionable issues.',
    model: createHeliconeProvider({
      userId: 'system',
      projectId: 'review',
      sessionId: `review:${Date.now()}`,
      agentName: 'code-reviewer',
    })('gpt-5.2'),
  })

  // Build review prompt with relevant code files (not ALL files)
  const routeFiles = blueprint.fileTree
    .filter(f => f.path.startsWith('src/routes/') && f.path.endsWith('.tsx'))
    .slice(0, 10) // Limit to 10 files to control token usage

  const prompt = `Review the following generated application code for functional and UX issues.

## Contract (source of truth)
Tables: ${contract.tables.map(t => t.name).join(', ')}
${contract.tables.map(t => `### ${t.name}\nColumns: ${t.columns.map(c => `${c.name} (${c.type}${c.nullable === false ? ', NOT NULL' : ''})`).join(', ')}`).join('\n\n')}

## Generated Route Files
${routeFiles.map(f => `### ${f.path}\n\`\`\`tsx\n${f.content.slice(0, 3000)}\n\`\`\``).join('\n\n')}

## Review Criteria
1. **UX**: Forms have proper validation messages, success/error feedback, loading states
2. **Logic**: CRUD operations match contract (correct fields, types, relationships)
3. **Security**: No client-side secret exposure, proper auth checks
4. **Accessibility**: Form labels, ARIA attributes, keyboard navigation
5. **Performance**: No unnecessary re-renders, proper query caching

Only report REAL issues. Do not report style preferences or minor improvements.`

  const result = await reviewAgent.generate(prompt, {
    structuredOutput: { schema: LLMReviewSchema },
    maxSteps: 1,
  })

  const tokensUsed = result.totalUsage?.totalTokens ?? 0
  const parsed = LLMReviewSchema.safeParse(result.object ?? result)

  if (!parsed.success) {
    console.error('[code-review] LLM review parse failed:', parsed.error.format())
    return { issues: [], tokensUsed }
  }

  return { issues: parsed.data.issues, tokensUsed }
}

// ============================================================================
// Main Review Function
// ============================================================================

export async function runCodeReview(input: {
  blueprint: AppBlueprint
  contract: SchemaContract
  sandboxId: string
}): Promise<CodeReviewResult> {
  // 1. Run deterministic checks first (fast, no LLM cost)
  const deterministicIssues = runDeterministicChecks(input.blueprint, input.contract)

  // 2. If there are critical deterministic issues, skip LLM review (save cost)
  const hasCriticalDeterministic = deterministicIssues.some(i => i.severity === 'critical')
  if (hasCriticalDeterministic) {
    return {
      passed: false,
      deterministicIssues,
      llmIssues: [],
      tokensUsed: 0,
    }
  }

  // 3. Run LLM review
  const { issues: llmIssues, tokensUsed } = await runLLMReview(input.blueprint, input.contract)

  // 4. Determine pass/fail — only critical issues cause failure
  const hasCriticalLLM = llmIssues.some(i => i.severity === 'critical')

  return {
    passed: !hasCriticalLLM,
    deterministicIssues,
    llmIssues,
    tokensUsed,
  }
}
