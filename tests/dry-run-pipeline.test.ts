/**
 * Dry-Run Pipeline Integration Test
 *
 * Exercises the full DETERMINISTIC pipeline for all 3 test prompts
 * from docs/test-prompts.md:
 *   1. Bookmarks Manager (simple CRUD)
 *   2. Team Task Board (multi-role, FKs)
 *   3. Personal Finance Tracker (aggregation, enums)
 *
 * For each:
 *   SchemaContract → contractToBlueprint() → derivePageFeatureSpec() → assembleListPage() / assembleDetailPage()
 *   → checkScaffold() → write to tmpdir → tsc --noEmit
 *
 * This catches template-level bugs BEFORE burning $0.50 on an E2E run.
 */

import { describe, it, expect } from 'vitest'
import { contractToBlueprint } from '@server/lib/app-blueprint'
import { assembleListPage, assembleDetailPage } from '@server/lib/agents/assembler'
import { derivePageFeatureSpec } from '@server/lib/agents/feature-schema'
import { checkScaffold } from '@server/lib/agents/validation'
import { contractToSQL } from '@server/lib/contract-to-sql'
import type { SchemaContract, DesignPreferences } from '@server/lib/schema-contract'
import type { PageConfig } from '@server/lib/agents/feature-schema'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { snakeToKebab, pluralize } from '@server/lib/naming-utils'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// ============================================================================
// Shared helpers
// ============================================================================

const defaultDesign: DesignPreferences = {
  style: 'modern',
  primaryColor: '#3b82f6',
  fontFamily: 'Inter',
}

/**
 * Hand-crafted PageConfig for testing the deterministic pipeline.
 * In production, inferPageConfig() generates these from the column classifier.
 * Here we test with explicit configs to exercise specific assembler paths.
 */
function runFullPipeline(
  appName: string,
  contract: SchemaContract,
  pageConfigs: PageConfig[],
) {
  // 1. Blueprint
  const blueprint = contractToBlueprint({
    appName,
    appDescription: `${appName} app`,
    contract,
    designPreferences: defaultDesign,
  })

  // 2. SQL migration
  const sql = contractToSQL(contract)

  // 3. For each entity, derive spec and assemble pages
  const assembledFiles: Array<{ path: string; content: string }> = []

  for (const config of pageConfigs) {
    const spec = derivePageFeatureSpec(config, contract)

    const listCode = assembleListPage(spec, contract)
    const detailCode = assembleDetailPage(spec, contract)

    // Use same naming logic as contractToPages() + orchestrator: snakeToKebab(pluralize())
    const entityRouteKebab = snakeToKebab(pluralize(config.entityName))

    assembledFiles.push({
      path: `src/routes/_authenticated/${entityRouteKebab}.tsx`,
      content: listCode,
    })
    assembledFiles.push({
      path: `src/routes/_authenticated/${entityRouteKebab}.$id.tsx`,
      content: detailCode,
    })
  }

  return { blueprint, sql, assembledFiles }
}

/**
 * Write all files to a temp directory and run tsc --noEmit.
 * Uses execFileSync (no shell) to avoid command injection.
 */
function typeCheckFiles(
  testName: string,
  blueprint: ReturnType<typeof contractToBlueprint>,
  assembledFiles: Array<{ path: string; content: string }>,
) {
  const tmpDir = join('/tmp', `vibestack-dryrun-${testName}-${Date.now()}`)

  try {
    // Write blueprint files
    for (const file of blueprint.fileTree) {
      const filePath = join(tmpDir, file.path)
      mkdirSync(join(filePath, '..'), { recursive: true })
      writeFileSync(filePath, file.content)
    }

    // Overwrite skeleton SLOT files with assembled code
    for (const file of assembledFiles) {
      const filePath = join(tmpDir, file.path)
      mkdirSync(join(filePath, '..'), { recursive: true })
      writeFileSync(filePath, file.content)
    }

    // Write a tsconfig.json for the generated app
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        jsx: 'react-jsx',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        baseUrl: '.',
        paths: {
          '@/*': ['./src/*'],
        },
        types: ['vite/client'],
      },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['node_modules'],
    }
    writeFileSync(join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

    // Symlink node_modules from the worktree for type resolution
    const worktreeRoot = join(import.meta.dirname, '..')
    try {
      execFileSync('ln', ['-sf', join(worktreeRoot, 'node_modules'), join(tmpDir, 'node_modules')])
    } catch {
      // fallback: ignore if symlink exists
    }

    // Run tsc --noEmit using execFileSync (no shell injection risk)
    let tscOutput = ''
    try {
      tscOutput = execFileSync(
        'npx',
        ['tsc', '--noEmit', '--pretty', 'false'],
        { encoding: 'utf-8', timeout: 30000, cwd: tmpDir },
      )
    } catch (error: any) {
      // tsc returns exit code 1 on type errors; output is in error.stdout
      tscOutput = (error.stdout ?? '') + (error.stderr ?? '')
    }

    // Filter out route-tree-dependent errors that resolve after `tsc-router generate`.
    // These are expected without routeTree.gen.ts:
    //   - TS2345: createFileRoute() arg type (route not registered)
    //   - TS2322 on Link: 'to' prop type (route not registered)
    //   - TS2741 on Link: missing 'search' (route not registered)
    const errors = tscOutput.split('\n').filter((line) => {
      if (!line.includes('error TS')) return false
      // Skip route-tree errors (only appear without routeTree.gen.ts).
      // These are all TS2322/TS2345 that resolve once `tsc-router generate` runs:
      //   - createFileRoute() arg: "not assignable to parameter of type 'undefined'"
      //   - Link to prop: 'Type "/foo" is not assignable to type "." | ".."'
      //   - Link missing search prop
      if (line.includes("is not assignable to parameter of type 'undefined'")) return false
      if (line.includes("Property 'search' is missing")) return false
      if (/is not assignable to type '"\."/.test(line)) return false
      if (/Type '"\/[^"]*"' is not assignable/.test(line)) return false
      return true
    })

    const passed = errors.length === 0
    return { tmpDir, tscOutput: errors.join('\n').trim(), passed }
  } catch (error) {
    return {
      tmpDir,
      tscOutput: error instanceof Error ? error.message : String(error),
      passed: false,
    }
  }
}

// ============================================================================
// Test 1: Bookmarks Manager (simple CRUD, text array, boolean)
// ============================================================================

const bookmarkContract: SchemaContract = {
  tables: [
    {
      name: 'bookmark',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'url', type: 'text', nullable: false },
        { name: 'title', type: 'text' },
        { name: 'description', type: 'text' },
        { name: 'is_starred', type: 'boolean', nullable: false, default: 'false' },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'tag',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false, unique: true },
      ],
    },
    {
      name: 'bookmark_tag',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'bookmark_id', type: 'uuid', nullable: false, references: { table: 'bookmark', column: 'id' } },
        { name: 'tag_id', type: 'uuid', nullable: false, references: { table: 'tag', column: 'id' } },
      ],
    },
  ],
}

const bookmarkPageConfigs: PageConfig[] = [
  {
    entityName: 'bookmark',
    listColumns: ['title', 'url', 'is_starred', 'created_at'],
    headerField: 'title',
    enumFields: [],
    detailSections: [
      { title: 'Details', fields: ['url', 'description', 'is_starred'] },
      { title: 'Metadata', fields: ['created_at'] },
    ],
  },
  {
    entityName: 'tag',
    listColumns: ['name'],
    headerField: 'name',
    enumFields: [],
    detailSections: [
      { title: 'Details', fields: ['name'] },
    ],
  },
  {
    entityName: 'bookmark_tag',
    listColumns: ['bookmark_id', 'tag_id'],
    headerField: 'bookmark_id',
    enumFields: [],
    detailSections: [
      { title: 'Links', fields: ['bookmark_id', 'tag_id'] },
    ],
  },
]

// ============================================================================
// Test 2: Team Task Board (multi-role, FKs, enums)
// ============================================================================

const taskBoardContract: SchemaContract = {
  tables: [
    {
      name: 'project',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
        { name: 'description', type: 'text' },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'task',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'title', type: 'text', nullable: false },
        { name: 'status', type: 'text', nullable: false, default: "'todo'" },
        { name: 'priority', type: 'text', nullable: false, default: "'medium'" },
        { name: 'project_id', type: 'uuid', nullable: false, references: { table: 'project', column: 'id' } },
        { name: 'assignee_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'project_member',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'project_id', type: 'uuid', nullable: false, references: { table: 'project', column: 'id' } },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'role', type: 'text', nullable: false, default: "'member'" },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'activity_log',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'project_id', type: 'uuid', nullable: false, references: { table: 'project', column: 'id' } },
        { name: 'task_id', type: 'uuid', references: { table: 'task', column: 'id' } },
        { name: 'user_id', type: 'uuid', references: { table: 'auth.users', column: 'id' } },
        { name: 'action', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
}

const taskBoardPageConfigs: PageConfig[] = [
  {
    entityName: 'project',
    listColumns: ['name', 'description', 'created_at'],
    headerField: 'name',
    enumFields: [],
    detailSections: [
      { title: 'Details', fields: ['name', 'description'] },
      { title: 'Metadata', fields: ['created_at'] },
    ],
  },
  {
    entityName: 'task',
    listColumns: ['title', 'status', 'priority', 'project_id', 'created_at'],
    headerField: 'title',
    enumFields: [
      { field: 'status', options: ['todo', 'in-progress', 'done'] },
      { field: 'priority', options: ['low', 'medium', 'high'] },
    ],
    detailSections: [
      { title: 'Task Info', fields: ['title', 'status', 'priority'] },
      { title: 'Assignment', fields: ['project_id'] },
      { title: 'Metadata', fields: ['created_at'] },
    ],
  },
  {
    entityName: 'project_member',
    listColumns: ['project_id', 'role', 'created_at'],
    headerField: 'role',
    enumFields: [
      { field: 'role', options: ['admin', 'member'] },
    ],
    detailSections: [
      { title: 'Membership', fields: ['project_id', 'role'] },
    ],
  },
  {
    entityName: 'activity_log',
    listColumns: ['action', 'project_id', 'task_id', 'created_at'],
    headerField: 'action',
    enumFields: [],
    detailSections: [
      { title: 'Activity', fields: ['action', 'project_id', 'task_id'] },
      { title: 'Metadata', fields: ['created_at'] },
    ],
  },
]

// ============================================================================
// Test 3: Personal Finance Tracker (numeric aggregation, enums)
// ============================================================================

const financeContract: SchemaContract = {
  tables: [
    {
      name: 'transaction',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'amount', type: 'numeric', nullable: false },
        { name: 'type', type: 'text', nullable: false },
        { name: 'category', type: 'text', nullable: false },
        { name: 'description', type: 'text' },
        { name: 'date', type: 'timestamptz', nullable: false, default: 'now()' },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
    {
      name: 'budget',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', nullable: false, references: { table: 'auth.users', column: 'id' } },
        { name: 'category', type: 'text', nullable: false },
        { name: 'monthly_limit', type: 'numeric', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false, default: 'now()' },
      ],
    },
  ],
}

const financePageConfigs: PageConfig[] = [
  {
    entityName: 'transaction',
    listColumns: ['description', 'amount', 'type', 'category', 'date'],
    headerField: 'description',
    enumFields: [
      { field: 'type', options: ['income', 'expense'] },
      { field: 'category', options: ['Food', 'Transport', 'Entertainment', 'Bills', 'Shopping', 'Income', 'Other'] },
    ],
    detailSections: [
      { title: 'Transaction Details', fields: ['amount', 'type', 'category', 'description'] },
      { title: 'Metadata', fields: ['date', 'created_at'] },
    ],
  },
  {
    entityName: 'budget',
    listColumns: ['category', 'monthly_limit'],
    headerField: 'category',
    enumFields: [
      { field: 'category', options: ['Food', 'Transport', 'Entertainment', 'Bills', 'Shopping', 'Income', 'Other'] },
    ],
    detailSections: [
      { title: 'Budget Details', fields: ['category', 'monthly_limit'] },
    ],
  },
]

// ============================================================================
// Tests
// ============================================================================

describe('Dry-Run Pipeline Integration', () => {
  describe('Test 1: Bookmarks Manager', () => {
    const result = runFullPipeline('BookmarkNest', bookmarkContract, bookmarkPageConfigs)

    it('blueprint generates expected files', () => {
      const paths = result.blueprint.fileTree.map((f) => f.path)
      expect(paths).toContain('src/lib/supabase.ts')
      expect(paths).toContain('src/main.tsx')
      expect(paths).toContain('.env')
      expect(paths).toContain('supabase/migrations/0001_initial.sql')
      // No server/ files
      expect(paths.some((p) => p.startsWith('server/'))).toBe(false)
    })

    it('SQL migration is valid', () => {
      expect(result.sql).toContain('CREATE TABLE IF NOT EXISTS "bookmark"')
      expect(result.sql).toContain('CREATE TABLE IF NOT EXISTS "tag"')
      expect(result.sql).toContain('CREATE TABLE IF NOT EXISTS "bookmark_tag"')
      // FK references auth.users (schema-qualified, each part quoted)
      expect(result.sql).toContain('REFERENCES "auth"."users"("id")')
    })

    it('assembles all entity pages', () => {
      expect(result.assembledFiles).toHaveLength(6) // 3 entities × 2 pages
    })

    it('list pages have no SLOT markers', () => {
      for (const file of result.assembledFiles) {
        expect(file.content).not.toContain('SLOT')
      }
    })

    it('assembled file paths match blueprint SLOT paths', () => {
      // Guard against double-pluralization: orchestrator must write to the same
      // path that contractToPages() put the SLOT file at.
      const blueprintSlotPaths = new Set(
        result.blueprint.fileTree.filter((f) => f.isLLMSlot).map((f) => f.path),
      )
      for (const assembled of result.assembledFiles) {
        expect(blueprintSlotPaths.has(assembled.path)).toBe(true)
      }
    })

    it('bookmark_tag list page has FK hooks for bookmark and tag', () => {
      const btList = result.assembledFiles.find((f) => f.path.includes('bookmark-tags.tsx'))
      expect(btList).toBeDefined()
      expect(btList!.content).toContain('bookmarkOptions = useQuery(')
      expect(btList!.content).toContain('tagOptions = useQuery(')
      // References hoisted hooks, not inline IIFE
      expect(btList!.content).not.toContain('{(() => {')
    })

    it('passes scaffold validation', () => {
      const allFiles = [
        ...result.blueprint.fileTree.map((f) => ({ path: f.path, content: f.content })),
        ...result.assembledFiles,
      ]
      const scaffoldResult = checkScaffold(allFiles)
      if (!scaffoldResult.passed) {
        console.error('Scaffold errors:', scaffoldResult.errors)
      }
      expect(scaffoldResult.passed).toBe(true)
    })

    it('generated code passes tsc --noEmit', { timeout: 15000 }, () => {
      const tsc = typeCheckFiles('bookmarks', result.blueprint, result.assembledFiles)
      if (!tsc.passed) {
        console.error('TSC errors for bookmarks:\n', tsc.tscOutput)
      }
      // Clean up
      try { rmSync(tsc.tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
      expect(tsc.passed).toBe(true)
    })
  })

  describe('Test 2: Team Task Board', () => {
    const result = runFullPipeline('TaskBoard', taskBoardContract, taskBoardPageConfigs)

    it('assembles 8 pages (4 entities × 2)', () => {
      expect(result.assembledFiles).toHaveLength(8)
    })

    it('task list page uses FK hook for project (not auth.users)', () => {
      const taskList = result.assembledFiles.find((f) => f.path.includes('tasks.tsx') && !f.path.includes('$id'))
      expect(taskList).toBeDefined()
      expect(taskList!.content).toContain('projectOptions = useQuery(')
      // auth.users FK (assignee_id) should be skipped
      expect(taskList!.content).not.toContain('authUsersOptions')
    })

    it('task list page has enum select for status and priority', () => {
      const taskList = result.assembledFiles.find((f) => f.path.includes('tasks.tsx') && !f.path.includes('$id'))
      expect(taskList).toBeDefined()
      expect(taskList!.content).toContain('<option value="todo">')
      expect(taskList!.content).toContain('<option value="low">')
    })

    it('activity_log pages have FK hooks for project and task', () => {
      const logList = result.assembledFiles.find((f) => f.path.includes('activity-logs.tsx') && !f.path.includes('$id'))
      expect(logList).toBeDefined()
      expect(logList!.content).toContain('projectOptions = useQuery(')
      expect(logList!.content).toContain('taskOptions = useQuery(')
    })

    it('no tRPC references', () => {
      for (const file of result.assembledFiles) {
        expect(file.content).not.toContain('trpc')
        expect(file.content).not.toContain('tRPC')
      }
    })

    it('assembled file paths match blueprint SLOT paths', () => {
      const blueprintSlotPaths = new Set(
        result.blueprint.fileTree.filter((f) => f.isLLMSlot).map((f) => f.path),
      )
      for (const assembled of result.assembledFiles) {
        expect(blueprintSlotPaths.has(assembled.path)).toBe(true)
      }
    })

    it('passes scaffold validation', () => {
      const allFiles = [
        ...result.blueprint.fileTree.map((f) => ({ path: f.path, content: f.content })),
        ...result.assembledFiles,
      ]
      const scaffoldResult = checkScaffold(allFiles)
      if (!scaffoldResult.passed) {
        console.error('Scaffold errors:', scaffoldResult.errors)
      }
      expect(scaffoldResult.passed).toBe(true)
    })

    it('generated code passes tsc --noEmit', { timeout: 15000 }, () => {
      const tsc = typeCheckFiles('taskboard', result.blueprint, result.assembledFiles)
      if (!tsc.passed) {
        console.error('TSC errors for taskboard:\n', tsc.tscOutput)
      }
      try { rmSync(tsc.tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
      expect(tsc.passed).toBe(true)
    })
  })

  describe('Test 3: Personal Finance Tracker', () => {
    const result = runFullPipeline('FinanceTracker', financeContract, financePageConfigs)

    it('assembles 4 pages (2 entities × 2)', () => {
      expect(result.assembledFiles).toHaveLength(4)
    })

    it('transaction list has enum selects for type and category', () => {
      const txList = result.assembledFiles.find((f) => f.path.includes('transactions.tsx') && !f.path.includes('$id'))
      expect(txList).toBeDefined()
      expect(txList!.content).toContain('<option value="income">')
      expect(txList!.content).toContain('<option value="Food">')
    })

    it('uses currency format for amount column', () => {
      const txList = result.assembledFiles.find((f) => f.path.includes('transactions.tsx') && !f.path.includes('$id'))
      expect(txList).toBeDefined()
      // amount column should use currency cell renderer
      expect(txList!.content).toContain('.toFixed(2)')
    })

    it('no server files in blueprint', () => {
      const paths = result.blueprint.fileTree.map((f) => f.path)
      expect(paths.some((p) => p.startsWith('server/'))).toBe(false)
    })

    it('assembled file paths match blueprint SLOT paths', () => {
      const blueprintSlotPaths = new Set(
        result.blueprint.fileTree.filter((f) => f.isLLMSlot).map((f) => f.path),
      )
      for (const assembled of result.assembledFiles) {
        expect(blueprintSlotPaths.has(assembled.path)).toBe(true)
      }
    })

    it('passes scaffold validation', () => {
      const allFiles = [
        ...result.blueprint.fileTree.map((f) => ({ path: f.path, content: f.content })),
        ...result.assembledFiles,
      ]
      const scaffoldResult = checkScaffold(allFiles)
      if (!scaffoldResult.passed) {
        console.error('Scaffold errors:', scaffoldResult.errors)
      }
      expect(scaffoldResult.passed).toBe(true)
    })

    it('generated code passes tsc --noEmit', { timeout: 15000 }, () => {
      const tsc = typeCheckFiles('finance', result.blueprint, result.assembledFiles)
      if (!tsc.passed) {
        console.error('TSC errors for finance:\n', tsc.tscOutput)
      }
      try { rmSync(tsc.tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
      expect(tsc.passed).toBe(true)
    })
  })
})
