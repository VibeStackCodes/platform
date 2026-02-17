// @vitest-environment node
/**
 * Integration tests for structured output with real OpenAI API.
 *
 * Tests that constrained decoding (Output.object) with PageConfigSchema
 * reliably produces valid configs, and that derivePageFeatureSpec deterministically
 * builds the full spec from config + contract.
 *
 * Requires: OPENAI_API_KEY in .env.local
 * Run:      INTEGRATION=true bun run test tests/structured-output-integration.test.ts
 * Budget:   < $0.50 total (all calls use gpt-5-nano at $0.05/$0.40/M)
 */

import { config } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import {
  PageConfigSchema,
  CustomProcedureSchema,
  derivePageFeatureSpec,
  validatePageConfig,
  validateFeatureSpec,
} from '@server/lib/agents/feature-schema'
import type { SchemaContract } from '@server/lib/schema-contract'

// Load real env vars (setup.ts overwrites OPENAI_API_KEY with 'test-api-key')
const realEnv = config({ path: '.env.local' })
const REAL_API_KEY = realEnv.parsed?.OPENAI_API_KEY

// Skip unless INTEGRATION=true and real key available
const SHOULD_RUN = process.env.INTEGRATION === 'true' && !!REAL_API_KEY

// Cost tracking
let totalCostUSD = 0
const NANO_PRICING = { input: 0.05 / 1_000_000, output: 0.40 / 1_000_000 }

function trackCost(usage: { inputTokens?: number; outputTokens?: number }) {
  const cost =
    (usage.inputTokens ?? 0) * NANO_PRICING.input +
    (usage.outputTokens ?? 0) * NANO_PRICING.output
  totalCostUSD += cost
  return cost
}

// ============================================================================
// Test fixtures
// ============================================================================

const TASK_CONTRACT: SchemaContract = {
  tables: [
    {
      name: 'task',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'title', type: 'text', nullable: false },
        { name: 'description', type: 'text', nullable: true },
        { name: 'status', type: 'text', nullable: false },
        { name: 'priority', type: 'text', nullable: false },
        { name: 'due_date', type: 'timestamptz', nullable: true },
        { name: 'is_completed', type: 'boolean', nullable: false },
        {
          name: 'user_id',
          type: 'uuid',
          nullable: false,
          references: { table: 'profiles', column: 'id' },
        },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
    },
  ],
  enums: [],
}

const BLOG_CONTRACT: SchemaContract = {
  tables: [
    {
      name: 'blog_post',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'title', type: 'text', nullable: false },
        { name: 'content', type: 'text', nullable: true },
        { name: 'author', type: 'text', nullable: false },
        { name: 'status', type: 'text', nullable: false },
        { name: 'published_at', type: 'timestamptz', nullable: true },
        { name: 'view_count', type: 'integer', nullable: false },
        { name: 'created_at', type: 'timestamptz', nullable: false },
        { name: 'updated_at', type: 'timestamptz', nullable: false },
      ],
    },
  ],
  enums: [],
}

function buildConfigPrompt(table: SchemaContract['tables'][0]): string {
  const columns = table.columns
    .map((c) => {
      const mods: string[] = [c.type]
      if (c.primaryKey) mods.push('PK')
      if (c.nullable === false) mods.push('NOT NULL')
      if (c.references) mods.push(`FK → ${c.references.table}.${c.references.column}`)
      return `  - ${c.name}: ${mods.join(', ')}`
    })
    .join('\n')

  return `Analyze the "${table.name}" entity and decide how to present it.

Table columns:
${columns}

Decide:
1. listColumns: Pick 3-6 most important columns to show in the data table (column names only)
2. headerField: Which column is the page title on the detail view (e.g. "title", "name")
3. enumFields: Which text columns have known enum values? List each with its options array
4. detailSections: Group ALL visible columns into 1-3 named sections (e.g. "Details", "Dates")

Valid column names: ${table.columns.map((c) => c.name).join(', ')}`
}

// ============================================================================
// Tests
// ============================================================================

describe.skipIf(!SHOULD_RUN)('Structured output integration (real OpenAI API)', () => {
  let openai: ReturnType<typeof createOpenAI>

  beforeAll(() => {
    openai = createOpenAI({ apiKey: REAL_API_KEY })
  })

  afterAll(() => {
    console.log(`\n  [structured-output] Total API cost: $${totalCostUSD.toFixed(4)}`)
  })

  describe('PageConfigSchema — constrained decoding', () => {
    it('produces valid config for task entity', async () => {
      const prompt = buildConfigPrompt(TASK_CONTRACT.tables[0])

      const result = await generateText({
        model: openai('gpt-5-nano'),
        output: Output.object({ schema: PageConfigSchema }),
        prompt,
      })

      const cost = trackCost(result.usage)
      console.log(`  [task config] cost=$${cost.toFixed(4)} tokens=${result.usage.totalTokens}`)

      expect(result.experimental_output).not.toBeNull()

      const parsed = PageConfigSchema.safeParse(result.experimental_output)
      expect(parsed.success).toBe(true)
      if (!parsed.success) return

      const cfg = parsed.data
      expect(cfg.entityName).toBe('task')
      expect(cfg.listColumns.length).toBeGreaterThanOrEqual(2)
      expect(cfg.headerField).toBe('title')
      expect(cfg.detailSections.length).toBeGreaterThanOrEqual(1)
      // All column references must exist in contract
      const validation = validatePageConfig(cfg, TASK_CONTRACT)
      expect(validation.valid).toBe(true)
      if (!validation.valid) console.error('Validation errors:', validation.errors)
    }, 90_000)

    it('produces valid config for blog_post entity', async () => {
      const prompt = buildConfigPrompt(BLOG_CONTRACT.tables[0])

      const result = await generateText({
        model: openai('gpt-5-nano'),
        output: Output.object({ schema: PageConfigSchema }),
        prompt,
      })

      trackCost(result.usage)

      const parsed = PageConfigSchema.safeParse(result.experimental_output)
      expect(parsed.success).toBe(true)
      if (!parsed.success) return

      expect(parsed.data.entityName).toBe('blog_post')
      expect(parsed.data.listColumns.length).toBeGreaterThanOrEqual(2)

      const validation = validatePageConfig(parsed.data, BLOG_CONTRACT)
      expect(validation.valid).toBe(true)
    }, 90_000)

    it('identifies enum fields with options', async () => {
      const prompt = buildConfigPrompt(TASK_CONTRACT.tables[0])

      const result = await generateText({
        model: openai('gpt-5-nano'),
        output: Output.object({ schema: PageConfigSchema }),
        prompt,
      })

      trackCost(result.usage)

      const parsed = PageConfigSchema.safeParse(result.experimental_output)
      expect(parsed.success).toBe(true)
      if (!parsed.success) return

      // status and/or priority should be identified as enum fields
      const enumFieldNames = parsed.data.enumFields.map((e) => e.field)
      const hasStatusOrPriority =
        enumFieldNames.includes('status') || enumFieldNames.includes('priority')
      expect(hasStatusOrPriority).toBe(true)

      // Each enum field should have options
      for (const ef of parsed.data.enumFields) {
        expect(ef.options.length).toBeGreaterThan(0)
      }
    }, 90_000)
  })

  describe('Deterministic derivation — PageConfig → PageFeatureSpec', () => {
    it('derives full spec with correct formats from config', async () => {
      const prompt = buildConfigPrompt(TASK_CONTRACT.tables[0])

      const result = await generateText({
        model: openai('gpt-5-nano'),
        output: Output.object({ schema: PageConfigSchema }),
        prompt,
      })

      trackCost(result.usage)

      const parsed = PageConfigSchema.safeParse(result.experimental_output)
      expect(parsed.success).toBe(true)
      if (!parsed.success) return

      // Derive full spec deterministically
      const spec = derivePageFeatureSpec(parsed.data, TASK_CONTRACT)

      // Check deterministic derivations
      expect(spec.entityName).toBe('task')
      expect(spec.listPage.sortDefault).toBe('created_at')
      expect(spec.listPage.sortDirection).toBe('desc')

      // Auto-managed columns excluded from forms
      const createFieldNames = spec.listPage.createFormFields.map((f) => f.field)
      expect(createFieldNames).not.toContain('id')
      expect(createFieldNames).not.toContain('created_at')
      expect(createFieldNames).not.toContain('updated_at')
      expect(createFieldNames).not.toContain('user_id')

      // Enum fields get badge format in columns
      const enumFieldNames = parsed.data.enumFields.map((e) => e.field)
      for (const col of spec.listPage.columns) {
        if (enumFieldNames.includes(col.field)) {
          expect(col.format).toBe('badge')
        }
      }

      // Boolean columns get boolean format
      const completedCol = spec.listPage.columns.find((c) => c.field === 'is_completed')
      if (completedCol) {
        expect(completedCol.format).toBe('boolean')
      }

      // Timestamp columns get date format
      const dateCol = spec.listPage.columns.find((c) => c.field === 'due_date')
      if (dateCol) {
        expect(dateCol.format).toBe('date')
      }

      // Full spec validates against contract
      const validation = validateFeatureSpec(spec, TASK_CONTRACT)
      expect(validation.valid).toBe(true)
    }, 90_000)
  })

  describe('CustomProcedureSchema — constrained decoding', () => {
    it('produces valid procedures for task entity', async () => {
      const prompt = `Analyze the "task" entity and design custom tRPC procedures. Include search, filtering, and any business logic.

Think step-by-step:
1. What queries would a user need beyond basic CRUD?
2. What filters make sense for this entity's columns?
3. What aggregations or computed values would be useful?

Describe each procedure with: name, purpose, query/mutation, input parameters, and the Drizzle ORM implementation.`

      const result = await generateText({
        model: openai('gpt-5-nano'),
        output: Output.object({ schema: CustomProcedureSchema }),
        prompt,
      })

      const cost = trackCost(result.usage)
      console.log(`  [procedures] cost=$${cost.toFixed(4)} tokens=${result.usage.totalTokens}`)

      const parsed = CustomProcedureSchema.safeParse(result.experimental_output)
      expect(parsed.success).toBe(true)
      if (!parsed.success) return

      expect(parsed.data.procedures.length).toBeGreaterThanOrEqual(1)

      for (const proc of parsed.data.procedures) {
        expect(proc.name.length).toBeGreaterThan(0)
        expect(proc.description.length).toBeGreaterThan(0)
        expect(['query', 'mutation']).toContain(proc.type)
        expect(['public', 'protected']).toContain(proc.access)
        expect(proc.implementation.length).toBeGreaterThan(0)
        expect(Array.isArray(proc.inputFields)).toBe(true)
      }
    }, 90_000)
  })

  describe('Coercion resilience', () => {
    it('handles terse input via z.preprocess coercion', async () => {
      const prompt = `Entity: task
listColumns: title, status, created_at
headerField: title
enumFields: status has todo/in_progress/done
detailSections: one section "Info" with title and status
emptyStateMessage: No tasks yet`

      const result = await generateText({
        model: openai('gpt-5-nano'),
        output: Output.object({ schema: PageConfigSchema }),
        prompt: `Convert this into PageConfig JSON:\n\n${prompt}`,
      })

      trackCost(result.usage)

      const parsed = PageConfigSchema.safeParse(result.experimental_output)
      expect(parsed.success).toBe(true)
      if (!parsed.success) return

      expect(parsed.data.entityName).toBe('task')
      expect(parsed.data.listColumns.length).toBeGreaterThanOrEqual(1)
      // enumFields coercion: should handle edge cases without crashing
      expect(Array.isArray(parsed.data.enumFields)).toBe(true)
    }, 90_000)
  })
})
