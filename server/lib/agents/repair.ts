import type { ValidationGateResult } from './validation'

const MAX_ERRORS_IN_PROMPT = 5

/**
 * Build a structured repair prompt from validation errors.
 *
 * @param validation - Validation gate result with errors from all checks
 * @param skeletons - Array of file skeletons (path and content)
 * @returns Structured repair prompt or null if errors are not repairable
 */
export function buildRepairPrompt(
  validation: ValidationGateResult,
  skeletons: Array<{ path: string; content: string }>,
): string | null {
  // Manifest errors are not repairable — indicates pipeline bug, not LLM fixable
  if (!validation.manifest.passed) {
    return null
  }

  // All checks passed — no errors to repair
  if (validation.allPassed) {
    return null
  }

  // Collect all errors with category prefixes
  const allErrors: string[] = []

  if (!validation.scaffold.passed) {
    for (const error of validation.scaffold.errors) {
      allErrors.push(`[SCAFFOLD] ${error}`)
    }
  }

  if (!validation.typecheck.passed) {
    for (const error of validation.typecheck.errors) {
      allErrors.push(`[TYPECHECK] ${error}`)
    }
  }

  if (!validation.lint.passed) {
    for (const error of validation.lint.errors) {
      allErrors.push(`[LINT] ${error}`)
    }
  }

  if (!validation.build.passed) {
    for (const error of validation.build.errors) {
      allErrors.push(`[BUILD] ${error}`)
    }
  }

  // No errors to repair
  if (allErrors.length === 0) {
    return null
  }

  // Limit to first 5 errors
  const displayErrors = allErrors.slice(0, MAX_ERRORS_IN_PROMPT)
  const hasMoreErrors = allErrors.length > MAX_ERRORS_IN_PROMPT
  const truncatedCount = allErrors.length - MAX_ERRORS_IN_PROMPT

  // Extract file paths from error messages
  const errorFilePaths = new Set<string>()
  const filePathRegex = /(?:src|server)\/[^\s:(]+/g

  for (const error of displayErrors) {
    const matches = error.match(filePathRegex)
    if (matches) {
      for (const match of matches) {
        errorFilePaths.add(match)
      }
    }
  }

  // Build error list section
  let prompt = '## Validation Errors\n\n'

  for (const error of displayErrors) {
    prompt += `- ${error}\n`
  }

  if (hasMoreErrors) {
    prompt += `\n... and ${truncatedCount} more errors (showing first ${MAX_ERRORS_IN_PROMPT})\n`
  }

  // Build rules section
  prompt += '\n## Repair Rules\n\n'
  prompt += '- Only modify files that have errors\n'
  prompt += '- Preserve the skeleton structure provided below\n'
  prompt += '- Use ESM imports (import/export syntax)\n'
  prompt += '- Do not use placeholders or TODO comments\n'

  // Build relevant file skeletons section
  const relevantSkeletons = skeletons.filter((skeleton) => errorFilePaths.has(skeleton.path))

  if (relevantSkeletons.length > 0) {
    prompt += '\n## Relevant File Skeletons\n\n'

    for (const skeleton of relevantSkeletons) {
      prompt += `### ${skeleton.path}\n\n`
      prompt += '```typescript\n'
      prompt += skeleton.content
      prompt += '\n```\n\n'
    }
  }

  return prompt
}
