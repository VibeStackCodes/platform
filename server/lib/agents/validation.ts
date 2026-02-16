import type { Sandbox } from '@daytonaio/sdk'

/**
 * Validation Gate
 *
 * Post-generation validation that runs after code generation completes.
 * Checks: manifest (all blueprint files exist), scaffold detection (no placeholder
 * strings per AB-02 from app.build paper), TypeScript, lint, build.
 *
 * Returns structured errors for the repair agent to fix.
 */

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  passed: boolean
  errors: string[]
}

export interface ValidationGateResult {
  manifest: ValidationResult
  scaffold: ValidationResult
  typecheck: ValidationResult
  lint: ValidationResult
  build: ValidationResult
  vercelChecks?: Array<{ name: string; passed: boolean; message: string; severity: 'error' | 'warning' }>
  allPassed: boolean
}

export interface Blueprint {
  fileTree: Array<{ path: string }>
}

export interface FileContent {
  path: string
  content: string
}

// ============================================================================
// Manifest Validation
// ============================================================================

/**
 * Check that all files in the blueprint's fileTree exist in the sandbox.
 *
 * @param blueprint - Blueprint with fileTree array
 * @param listFiles - Function to list files in sandbox (for testing/mocking)
 * @returns Validation result with missing files as errors
 */
export async function checkManifest(
  blueprint: Blueprint,
  listFiles: () => Promise<{ files: string[]; count: number }>,
): Promise<ValidationResult> {
  const errors: string[] = []

  try {
    const { files: existingFiles } = await listFiles()
    const existingSet = new Set(existingFiles)

    for (const { path } of blueprint.fileTree) {
      if (!existingSet.has(path)) {
        errors.push(`Missing file: ${path}`)
      }
    }

    return {
      passed: errors.length === 0,
      errors,
    }
  } catch (error) {
    return {
      passed: false,
      errors: [`Failed to list files: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

// ============================================================================
// Scaffold Detection
// ============================================================================

/**
 * Detect placeholder/scaffold strings that should have been replaced.
 *
 * Checks for:
 * - "Building your app" (warmup scaffold leftover)
 * - "your_supabase_project" (unconfigured Supabase)
 * - "__PLACEHOLDER__" (template markers)
 * - "TODO:" / "FIXME:" (incomplete code)
 * - "placeholder" (generic)
 * - "localhost:\d+" (hardcoded dev URLs)
 * - require() in .ts/.tsx files (must use ESM import)
 *
 * Skips:
 * - .env files (they have intentional placeholders that get replaced by infra)
 * - Lock files (package-lock.json, bun.lockb, yarn.lock, pnpm-lock.yaml)
 * - Documentation files (README.md, CHANGELOG.md, LICENSE)
 * - Non-source files (only checks .ts, .tsx, .css, .html)
 *
 * @param files - Array of file paths and contents
 * @returns Validation result with scaffold detections as errors
 */
export function checkScaffold(files: FileContent[]): ValidationResult {
  const errors: string[] = []

  // Source file extensions to check
  const sourceExtensions = ['.ts', '.tsx', '.css', '.html']

  // Files to skip entirely (lock files, docs, etc.)
  const skipPatterns = [
    /package-lock\.json$/,
    /bun\.lockb$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /README\.md$/i,
    /CHANGELOG\.md$/i,
    /LICENSE$/i,
  ]

  // Patterns to detect (order matters for error messages)
  const scaffoldPatterns = [
    { pattern: /Building your app/i, description: 'warmup scaffold leftover' },
    { pattern: /your_supabase_project/i, description: 'unconfigured Supabase URL' },
    { pattern: /__PLACEHOLDER__/i, description: 'template marker' },
    { pattern: /TODO:/i, description: 'incomplete code' },
    { pattern: /FIXME:/i, description: 'incomplete code' },
    { pattern: /\bplaceholder\b/i, description: 'generic placeholder' },
    { pattern: /localhost:\d+/i, description: 'hardcoded dev URL' },
  ]

  // ESM require() pattern (only for .ts/.tsx files)
  const requirePattern = /\brequire\s*\(/

  for (const file of files) {
    // Skip .env files
    if (file.path.endsWith('.env') || file.path.includes('.env.')) {
      continue
    }

    // Skip lock files and docs
    if (skipPatterns.some((pattern) => pattern.test(file.path))) {
      continue
    }

    // Only check source files
    const isSourceFile = sourceExtensions.some((ext) => file.path.endsWith(ext))
    if (!isSourceFile) {
      continue
    }

    // Check for scaffold patterns
    for (const { pattern, description } of scaffoldPatterns) {
      const match = file.path.match(pattern) || file.content.match(pattern)
      if (match) {
        errors.push(`${file.path}: Detected ${description}: "${match[0]}"`)
      }
    }

    // Check for require() in TypeScript files
    if ((file.path.endsWith('.ts') || file.path.endsWith('.tsx')) && requirePattern.test(file.content)) {
      errors.push(`${file.path}: Detected require() in ESM file (use import instead)`)
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  }
}

// ============================================================================
// Full Validation Gate
// ============================================================================

/**
 * Run all validation checks in sequence:
 * 1. Manifest: all blueprint files exist
 * 2. Scaffold: no placeholder strings
 * 3. TypeCheck: tsc --noEmit passes
 * 4. Lint: biome check --write passes
 * 5. Build: bun run build passes
 *
 * @param blueprint - Blueprint with fileTree
 * @param sandbox - Daytona sandbox instance
 * @returns Structured validation results
 */
export async function runValidationGate(
  blueprint: Blueprint,
  sandbox: Sandbox,
): Promise<ValidationGateResult> {
  const results: Omit<ValidationGateResult, 'allPassed'> = {
    manifest: { passed: false, errors: [] },
    scaffold: { passed: false, errors: [] },
    typecheck: { passed: false, errors: [] },
    lint: { passed: false, errors: [] },
    build: { passed: false, errors: [] },
  }

  // 1. Manifest check
  try {
    const listFiles = async () => {
      const result = await sandbox.process.executeCommand(
        `find /workspace -type f ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/.git/*" | sed 's|^/workspace/||' | sort`,
        '/workspace',
        undefined,
        30,
      )

      if (result.exitCode !== 0) {
        return { files: [], count: 0 }
      }

      const files = result.result
        .split('\n')
        .filter((f) => f.trim() !== '')

      return { files, count: files.length }
    }

    results.manifest = await checkManifest(blueprint, listFiles)
  } catch (error) {
    results.manifest = {
      passed: false,
      errors: [`Manifest check failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  // 2. Scaffold check
  try {
    // Read all source files
    const sourceFiles: FileContent[] = []
    for (const { path } of blueprint.fileTree) {
      const result = await sandbox.process.executeCommand(
        `cat /workspace/${path}`,
        '/workspace',
        undefined,
        10,
      )
      if (result.exitCode === 0) {
        sourceFiles.push({ path, content: result.result })
      }
    }

    results.scaffold = checkScaffold(sourceFiles)
  } catch (error) {
    results.scaffold = {
      passed: false,
      errors: [`Scaffold check failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  // 3. TypeScript check
  try {
    const result = await sandbox.process.executeCommand(
      'bunx tsc --noEmit',
      '/workspace',
      undefined,
      60,
    )
    results.typecheck = {
      passed: result.exitCode === 0,
      errors: result.exitCode === 0 ? [] : [result.result],
    }
  } catch (error) {
    results.typecheck = {
      passed: false,
      errors: [`TypeCheck failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  // 4. Lint check
  try {
    const result = await sandbox.process.executeCommand(
      'bunx biome check --write .',
      '/workspace',
      undefined,
      60,
    )
    results.lint = {
      passed: result.exitCode === 0,
      errors: result.exitCode === 0 ? [] : [result.result],
    }
  } catch (error) {
    results.lint = {
      passed: false,
      errors: [`Lint failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  // 5. Build check
  try {
    const result = await sandbox.process.executeCommand(
      'bun run build',
      '/workspace',
      undefined,
      120,
    )
    results.build = {
      passed: result.exitCode === 0,
      errors: result.exitCode === 0 ? [] : [result.result],
    }
  } catch (error) {
    results.build = {
      passed: false,
      errors: [`Build failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  // 6. Vercel build validation (runs only if build passed)
  let vercelChecks: Array<{ name: string; passed: boolean; message: string; severity: 'error' | 'warning' }> | undefined
  let vercelPassed = true

  if (results.build.passed) {
    try {
      const { validateVercelBuild } = await import('./build-validator')
      const vercelResult = await validateVercelBuild(sandbox)
      vercelChecks = vercelResult.checks
      vercelPassed = vercelResult.allPassed
    } catch (error) {
      vercelChecks = [
        {
          name: 'vercel_validation',
          passed: false,
          message: `Vercel validation failed: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
        },
      ]
      vercelPassed = false
    }
  }

  // Determine overall pass/fail
  const allPassed =
    results.manifest.passed &&
    results.scaffold.passed &&
    results.typecheck.passed &&
    results.lint.passed &&
    results.build.passed &&
    vercelPassed

  return {
    ...results,
    vercelChecks,
    allPassed,
  }
}
