import { buildRepairPrompt } from '@server/lib/agents/repair'
import type { ValidationGateResult } from '@server/lib/agents/validation'
import { describe, expect, it } from 'vitest'

describe('buildRepairPrompt', () => {
  it('includes failing file path and error text in prompt', () => {
    const errors: ValidationGateResult = {
      manifest: { passed: true, errors: [] },
      scaffold: { passed: true, errors: [] },
      typecheck: {
        passed: false,
        errors: ['src/routes/users.tsx:15:20 - TS2304: Cannot find name "User"'],
      },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: false,
    }

    const skeletons = [
      { path: 'src/routes/users.tsx', content: 'export const UsersPage = () => {}' },
    ]

    const prompt = buildRepairPrompt(errors, skeletons)

    expect(prompt).toBeTruthy()
    expect(prompt).toContain('src/routes/users.tsx')
    expect(prompt).toContain('Cannot find name "User"')
    expect(prompt).toContain('export const UsersPage = () => {}')
  })

  it('returns null for manifest errors (not repairable by LLM)', () => {
    const errors: ValidationGateResult = {
      manifest: { passed: false, errors: ['Missing file: src/main.tsx'] },
      scaffold: { passed: true, errors: [] },
      typecheck: { passed: true, errors: [] },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: false,
    }

    const skeletons = []

    const prompt = buildRepairPrompt(errors, skeletons)

    expect(prompt).toBeNull()
  })

  it('limits to first 5 errors with truncation note', () => {
    const manyErrors = Array.from({ length: 10 }, (_, i) =>
      `src/routes/file${i}.tsx:1:1 - TS2304: Cannot find name "Error${i}"`
    )

    const errors: ValidationGateResult = {
      manifest: { passed: true, errors: [] },
      scaffold: { passed: true, errors: [] },
      typecheck: { passed: false, errors: manyErrors },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: false,
    }

    const skeletons = manyErrors.slice(0, 5).map((_, i) => ({
      path: `src/routes/file${i}.tsx`,
      content: `export const File${i} = () => {}`,
    }))

    const prompt = buildRepairPrompt(errors, skeletons)

    expect(prompt).toBeTruthy()
    // Should include first 5 errors
    expect(prompt).toContain('Error0')
    expect(prompt).toContain('Error1')
    expect(prompt).toContain('Error2')
    expect(prompt).toContain('Error3')
    expect(prompt).toContain('Error4')
    // Should NOT include error 5+
    expect(prompt).not.toContain('Error5')
    // Should have truncation note
    expect(prompt).toContain('5 more errors')
  })

  it('returns null when all checks passed', () => {
    const errors: ValidationGateResult = {
      manifest: { passed: true, errors: [] },
      scaffold: { passed: true, errors: [] },
      typecheck: { passed: true, errors: [] },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: true,
    }

    const prompt = buildRepairPrompt(errors, [])

    expect(prompt).toBeNull()
  })

  it('collects errors from multiple categories with prefixes', () => {
    const errors: ValidationGateResult = {
      manifest: { passed: true, errors: [] },
      scaffold: { passed: false, errors: ['Missing required file: src/routes/__root.tsx'] },
      typecheck: { passed: false, errors: ['src/routes/users.tsx:10:5 - TS2741: Property missing'] },
      lint: { passed: false, errors: ['src/components/Button.tsx:3:15 - Unused variable "foo"'] },
      build: { passed: true, errors: [] },
      allPassed: false,
    }

    const skeletons = [
      { path: 'src/routes/__root.tsx', content: 'export const Root = () => {}' },
      { path: 'src/routes/users.tsx', content: 'export const Users = () => {}' },
      { path: 'src/components/Button.tsx', content: 'export const Button = () => {}' },
    ]

    const prompt = buildRepairPrompt(errors, skeletons)

    expect(prompt).toBeTruthy()
    expect(prompt).toContain('[SCAFFOLD]')
    expect(prompt).toContain('[TYPECHECK]')
    expect(prompt).toContain('[LINT]')
    expect(prompt).toContain('src/routes/__root.tsx')
    expect(prompt).toContain('src/routes/users.tsx')
    expect(prompt).toContain('src/components/Button.tsx')
  })

  it('extracts file paths from error messages and includes only relevant skeletons', () => {
    const errors: ValidationGateResult = {
      manifest: { passed: true, errors: [] },
      scaffold: { passed: true, errors: [] },
      typecheck: {
        passed: false,
        errors: [
          'src/routes/users.tsx:15:20 - TS2304: Cannot find name "User"',
          'src/lib/types.ts:5:10 - TS2322: Type mismatch',
        ],
      },
      lint: { passed: true, errors: [] },
      build: { passed: true, errors: [] },
      allPassed: false,
    }

    const skeletons = [
      { path: 'src/routes/users.tsx', content: 'export const UsersPage = () => {}' },
      { path: 'src/lib/types.ts', content: 'export type User = { id: string }' },
      { path: 'src/routes/other.tsx', content: 'export const Other = () => {}' }, // Not in errors
    ]

    const prompt = buildRepairPrompt(errors, skeletons)

    expect(prompt).toBeTruthy()
    // Should include skeletons for files with errors
    expect(prompt).toContain('src/routes/users.tsx')
    expect(prompt).toContain('export const UsersPage = () => {}')
    expect(prompt).toContain('src/lib/types.ts')
    expect(prompt).toContain('export type User = { id: string }')
    // Should NOT include skeleton for file without errors
    expect(prompt).not.toContain('src/routes/other.tsx')
    expect(prompt).not.toContain('export const Other = () => {}')
  })
})
