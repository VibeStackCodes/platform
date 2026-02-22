import type { AppBlueprint } from '../app-blueprint'
import { z } from 'zod'

// ============================================================================
// Types
// ============================================================================

export interface DeterministicIssue {
  type:
    | 'missing_route_export'
    | 'contract_mismatch'
    | 'hardcoded_secret'
    | 'missing_error_boundary'
    | 'missing_loading_state'
    | 'stale_trpc_import'
    | 'missing_supabase_import'
    | 'missing_query_key'
    | 'missing_mutation_invalidation'
    | 'missing_single_modifier'
    | 'unused_import'
    | 'missing_form_validation'
    | 'console_log_statement'
    | 'hardcoded_localhost'
    | 'missing_key_prop'
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

    // 3. Missing error boundaries in route files (skip layout-only routes)
    if (file.path.startsWith('src/routes/') && file.path.endsWith('.tsx')) {
      const isLayoutRoute = file.path.includes('__root.tsx') ||
        (file.path.includes('_authenticated') && file.path.endsWith('route.tsx'))
      if (!isLayoutRoute && !file.content.includes('ErrorComponent') && !file.content.includes('errorComponent')) {
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

    const isRouteTsx = file.path.startsWith('src/routes/') && file.path.endsWith('.tsx')
    const isTsx = file.path.endsWith('.tsx')

    // 6. Stale tRPC imports — leftover from pre-PostgREST migration
    if (isRouteTsx) {
      const staleTrpcPatterns = [
        /@trpc\//,
        /from\s+['"]@\/lib\/trpc['"]/,
        /trpc\.\w+\.\w+\./,
      ]
      for (const pattern of staleTrpcPatterns) {
        if (pattern.test(file.content)) {
          issues.push({
            type: 'stale_trpc_import',
            file: file.path,
            message: `Stale tRPC import or usage detected — migrate to supabase-js + TanStack Query`,
            severity: 'critical',
          })
          break // One issue per file for this check
        }
      }
    }

    // 7. Missing supabase import — file uses supabase client but doesn't import it
    if (isTsx) {
      const usesSupabaseClient =
        file.content.includes('supabase.from(') || file.content.includes('supabase.rpc(')
      const hasSupabaseImport = /from\s+['"]@\/lib\/supabase['"]/.test(file.content)
      if (usesSupabaseClient && !hasSupabaseImport) {
        issues.push({
          type: 'missing_supabase_import',
          file: file.path,
          message: 'File uses supabase.from() or supabase.rpc() but does not import from @/lib/supabase',
          severity: 'warning',
        })
      }
    }

    // 8. Missing queryKey in useQuery calls
    if (isTsx && file.content.includes('useQuery({')) {
      const lines = file.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('useQuery({')) {
          // Look ahead up to 12 lines — LLMs often put many options before queryKey
          const windowLines = lines.slice(i, i + 12).join('\n')
          if (!windowLines.includes('queryKey:')) {
            issues.push({
              type: 'missing_query_key',
              file: file.path,
              message: `useQuery call at line ${i + 1} is missing a queryKey property — queries won't cache or invalidate correctly`,
              severity: 'warning',
            })
          }
        }
      }
    }

    // 9. Missing cache management in useMutation calls
    if (isTsx && file.content.includes('useMutation({')) {
      const hasCacheManagement =
        file.content.includes('invalidateQueries') ||
        file.content.includes('removeQueries') ||
        file.content.includes('resetQueries') ||
        file.content.includes('setQueryData')
      if (!hasCacheManagement) {
        issues.push({
          type: 'missing_mutation_invalidation',
          file: file.path,
          message: 'File uses useMutation but has no cache management — mutations won\'t refresh query data',
          severity: 'warning',
        })
      }
    }

    // 10. Missing .single() on detail page .eq('id', ...) calls
    const isDetailPage = isRouteTsx && (file.path.includes('.$id.tsx') || file.path.includes('$id'))
    if (isDetailPage && file.content.includes(".eq('id',")) {
      if (!file.content.includes('.single()')) {
        issues.push({
          type: 'missing_single_modifier',
          file: file.path,
          message: "Detail page uses .eq('id', ...) without .single() — query will return an array instead of a single record",
          severity: 'warning',
        })
      }
    }

    // 11. Unused named imports
    if (isTsx) {
      const importBlockRegex = /^import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/gm
      let match: RegExpExecArray | null
      while ((match = importBlockRegex.exec(file.content)) !== null) {
        const importLine = match[0]
        const importedSymbols = match[1]
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0)

        // Everything after this import line
        const importEndIndex = match.index + importLine.length
        const fileBody = file.content.slice(importEndIndex)

        for (const rawSymbol of importedSymbols) {
          // Strip leading "type " from inline type imports: import { type Foo } → "Foo"
          const withoutTypePrefix = rawSymbol.replace(/^type\s+/, '')
          // Handle "Foo as Bar" — the used name in the body is "Bar"
          const asMatch = /(\S+)\s+as\s+(\S+)/.exec(withoutTypePrefix)
          const symbolInBody = asMatch ? asMatch[2] : withoutTypePrefix
          const symbolToCheck = symbolInBody.trim()
          if (!symbolToCheck) continue

          const escapedSymbol = symbolToCheck.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const usageRegex = new RegExp(`\\b${escapedSymbol}\\b`)
          if (!usageRegex.test(fileBody)) {
            issues.push({
              type: 'unused_import',
              file: file.path,
              message: `Imported symbol "${symbolToCheck}" is never used in this file`,
              severity: 'warning',
            })
          }
        }
      }
    }

    // 12. Missing form validation — form with onSubmit but no validation checks
    if (isTsx && file.content.includes('<form') && file.content.includes('onSubmit')) {
      const hasValidation =
        file.content.includes('.trim()') ||
        file.content.includes('required') ||
        /if\s*\(!/.test(file.content)
      if (!hasValidation) {
        issues.push({
          type: 'missing_form_validation',
          file: file.path,
          message: 'Form with onSubmit has no validation checks (.trim(), required attribute, or if (!...) guards)',
          severity: 'warning',
        })
      }
    }

    // 13. console.log statements in production code
    if (isTsx && file.content.includes('console.log(')) {
      issues.push({
        type: 'console_log_statement',
        file: file.path,
        message: 'File contains console.log() — remove debug statements before production',
        severity: 'warning',
      })
    }

    // 14. Hardcoded localhost URLs — only flag actual http:// URLs, not bare IPs
    //     (bare IP addresses are valid domain data in networking/admin apps)
    if (isTsx) {
      const localhostPattern = /https?:\/\/localhost/
      const loopbackPattern = /https?:\/\/127\.0\.0\.1/
      if (localhostPattern.test(file.content) || loopbackPattern.test(file.content)) {
        issues.push({
          type: 'hardcoded_localhost',
          file: file.path,
          message: 'File contains hardcoded localhost URL — use environment variables instead',
          severity: 'warning',
        })
      }
    }

    // 15. Missing key prop in .map() returning JSX
    if (isTsx) {
      const lines = file.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('.map(')) {
          // Look in a window of the next 8 lines for an arrow returning JSX elements
          const windowLines = lines.slice(i, i + 8).join('\n')
          // Require arrow to point at a JSX tag (<Component or <div etc.), not just parenthesized expressions
          const hasArrowJsx = /=>\s*\(\s*<[a-zA-Z]/.test(windowLines) || /=>\s*<[a-zA-Z]/.test(windowLines) || /=>\s*\{[\s\S]*?return\s*\(\s*</.test(windowLines)
          if (hasArrowJsx && !windowLines.includes('key=')) {
            issues.push({
              type: 'missing_key_prop',
              file: file.path,
              message: `Array .map() at line ${i + 1} renders JSX without a key= prop — React list reconciliation will fail`,
              severity: 'warning',
            })
          }
        }
      }
    }
  }

  return issues
}

// ============================================================================
// LLM Review (gpt-5.1 — sufficient for code review, 28% cheaper than gpt-5.2)
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
): Promise<{ issues: LLMReviewIssue[]; tokensUsed: number }> {
  // Dynamic imports to avoid circular deps
  const { Agent } = await import('@mastra/core/agent')
  const { createAgentModelResolver } = await import('./provider')

  // Create a lightweight review agent
  const reviewAgent = new Agent({
    id: 'code-reviewer',
    name: 'code-reviewer',
    instructions: 'You are a code review expert. Review generated application code for functional, UX, security, and accessibility issues. Only report real, actionable issues.',
    model: createAgentModelResolver('review'),
    defaultOptions: { modelSettings: { temperature: 0.3 } },
  })

  // Build review prompt with relevant code files (not ALL files)
  const routeFiles = blueprint.fileTree
    .filter(f => f.path.startsWith('src/routes/') && f.path.endsWith('.tsx'))
    .slice(0, 10) // Limit to 10 files to control token usage

  const prompt = `Review the following generated application code for functional and UX issues.

## Generated Route Files
${routeFiles.map(f => `### ${f.path}\n\`\`\`tsx\n${f.content.slice(0, 3000)}\n\`\`\``).join('\n\n')}

## Review Criteria
1. **UX**: Forms have proper validation messages, success/error feedback, loading states
2. **Logic**: Component logic is correct (proper state management, event handling)
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
  sandboxId: string
}): Promise<CodeReviewResult> {
  // 1. Run deterministic checks first (fast, no LLM cost)
  const deterministicIssues = runDeterministicChecks(input.blueprint)

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

  // 2b. Also skip LLM if there are more than 3 warning-level issues — fix structural
  //     problems first before spending tokens on higher-level review.
  const warningCount = deterministicIssues.filter(i => i.severity === 'warning').length
  if (warningCount > 3) {
    return {
      passed: true, // no critical issues
      deterministicIssues,
      llmIssues: [],
      tokensUsed: 0,
    }
  }

  // 3. Run LLM review
  const { issues: llmIssues, tokensUsed } = await runLLMReview(input.blueprint)

  // 4. Determine pass/fail — only critical issues cause failure
  const hasCriticalLLM = llmIssues.some(i => i.severity === 'critical')

  return {
    passed: !hasCriticalLLM,
    deterministicIssues,
    llmIssues,
    tokensUsed,
  }
}
