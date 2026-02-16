import type { Sandbox } from '@daytonaio/sdk'

/**
 * Vercel Build Validator
 *
 * Validates that the build output is Vercel-compatible.
 * Runs AFTER tsc + build pass, checking Vercel-specific requirements:
 * - dist/ directory exists with index.html
 * - Bundle size is reasonable (< 50MB warning threshold)
 * - vercel.json exists for SPA routing
 * - No process.env in client code (should use import.meta.env.VITE_*)
 * - No large individual files (> 5MB)
 */

// ============================================================================
// Types
// ============================================================================

export interface VercelBuildCheck {
  name: string
  passed: boolean
  message: string
  severity: 'error' | 'warning'
}

export interface VercelBuildResult {
  allPassed: boolean
  checks: VercelBuildCheck[]
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate that the build output is Vercel-compatible.
 * Runs AFTER tsc + build pass, checking Vercel-specific requirements.
 */
export async function validateVercelBuild(sandbox: Sandbox): Promise<VercelBuildResult> {
  const checks: VercelBuildCheck[] = []

  // 1. Check that dist/ directory exists (Vite output)
  try {
    const distCheck = await sandbox.process.executeCommand(
      'test -d /workspace/dist && echo "EXISTS" || echo "MISSING"',
      '/workspace',
      undefined,
      10,
    )
    const exists = distCheck.result.trim() === 'EXISTS'
    checks.push({
      name: 'dist_directory',
      passed: exists,
      message: exists ? 'dist/ directory exists' : 'dist/ directory missing — build may not have completed',
      severity: 'error',
    })
  } catch {
    checks.push({
      name: 'dist_directory',
      passed: false,
      message: 'Failed to check dist/ directory',
      severity: 'error',
    })
  }

  // 2. Check that index.html exists in dist/
  try {
    const indexCheck = await sandbox.process.executeCommand(
      'test -f /workspace/dist/index.html && echo "EXISTS" || echo "MISSING"',
      '/workspace',
      undefined,
      10,
    )
    const exists = indexCheck.result.trim() === 'EXISTS'
    checks.push({
      name: 'index_html',
      passed: exists,
      message: exists ? 'dist/index.html exists' : 'dist/index.html missing — SPA entry point not found',
      severity: 'error',
    })
  } catch {
    checks.push({
      name: 'index_html',
      passed: false,
      message: 'Failed to check dist/index.html',
      severity: 'error',
    })
  }

  // 3. Check total bundle size (Vercel has a 250MB limit for serverless, but SPA is typically < 10MB)
  try {
    const sizeCheck = await sandbox.process.executeCommand(
      'du -sb /workspace/dist 2>/dev/null | cut -f1',
      '/workspace',
      undefined,
      10,
    )
    const sizeBytes = Number.parseInt(sizeCheck.result.trim(), 10)
    const sizeMB = sizeBytes / (1024 * 1024)
    const isReasonable = !Number.isNaN(sizeMB) && sizeMB < 50 // 50MB warning threshold
    checks.push({
      name: 'bundle_size',
      passed: isReasonable,
      message: isReasonable
        ? `Bundle size: ${sizeMB.toFixed(1)}MB`
        : `Bundle size ${sizeMB.toFixed(1)}MB exceeds 50MB threshold — consider code splitting`,
      severity: 'warning',
    })
  } catch {
    checks.push({
      name: 'bundle_size',
      passed: true, // Non-critical if we can't check
      message: 'Could not determine bundle size',
      severity: 'warning',
    })
  }

  // 4. Check vercel.json exists (for proper routing config)
  try {
    const vercelCheck = await sandbox.process.executeCommand(
      'test -f /workspace/vercel.json && echo "EXISTS" || echo "MISSING"',
      '/workspace',
      undefined,
      10,
    )
    const exists = vercelCheck.result.trim() === 'EXISTS'
    checks.push({
      name: 'vercel_config',
      passed: exists,
      message: exists ? 'vercel.json exists' : 'vercel.json missing — SPA routing may not work on Vercel',
      severity: 'warning',
    })
  } catch {
    checks.push({
      name: 'vercel_config',
      passed: true,
      message: 'Could not check for vercel.json',
      severity: 'warning',
    })
  }

  // 5. Check for environment variable references that won't be set in Vercel
  // Look for process.env references in client code (should use import.meta.env.VITE_*)
  try {
    const envCheck = await sandbox.process.executeCommand(
      'grep -r "process\\.env\\." /workspace/src/ --include="*.ts" --include="*.tsx" -l 2>/dev/null | head -5',
      '/workspace',
      undefined,
      10,
    )
    const files = envCheck.result.trim()
    const hasProcessEnv = files.length > 0
    checks.push({
      name: 'env_vars',
      passed: !hasProcessEnv,
      message: hasProcessEnv
        ? `Client code uses process.env instead of import.meta.env: ${files.split('\n').join(', ')}`
        : 'No process.env references in client code',
      severity: 'warning',
    })
  } catch {
    checks.push({
      name: 'env_vars',
      passed: true,
      message: 'Could not check for environment variable patterns',
      severity: 'warning',
    })
  }

  // 6. Check for large individual files (Vercel has 50MB per-file limit)
  try {
    const largeFiles = await sandbox.process.executeCommand(
      'find /workspace/dist -type f -size +5M -exec ls -lh {} + 2>/dev/null | head -5',
      '/workspace',
      undefined,
      10,
    )
    const hasLargeFiles = largeFiles.result.trim().length > 0
    checks.push({
      name: 'large_files',
      passed: !hasLargeFiles,
      message: hasLargeFiles
        ? `Large files (>5MB) in dist/: ${largeFiles.result.trim()}`
        : 'No large files in dist/',
      severity: 'warning',
    })
  } catch {
    checks.push({
      name: 'large_files',
      passed: true,
      message: 'Could not check for large files',
      severity: 'warning',
    })
  }

  return {
    allPassed: checks.filter((c) => c.severity === 'error').every((c) => c.passed),
    checks,
  }
}
