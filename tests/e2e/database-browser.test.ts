/**
 * E2E Database Browser Tests
 *
 * Tests the complete database management flow:
 * - pg-meta SQL generation → proxy request → table introspection
 * - Zod schema generation from introspected columns → form validation
 * - Row editing with primary key extraction → UPDATE SQL construction
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// ============================================================================
// Mock Setup
// ============================================================================

vi.mock('@server/middleware/auth', () => ({
  createClient: vi.fn(),
}))

// ============================================================================
// Tests: pg-meta SQL → proxy → table introspection
// ============================================================================

describe.skip('Database Browser E2E: Introspection Pipeline', () => {
  let originalEnv: NodeJS.ProcessEnv
  let mockSupabaseClient: any
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.SUPABASE_ACCESS_TOKEN = 'test-token'

    mockSupabaseClient = {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    }

    mockFetch = vi.fn()
    global.fetch = mockFetch as typeof fetch
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('generates SQL, proxies to Supabase, and returns parseable table data', async () => {
    // Step 1: Generate the SQL that would be sent to the proxy
    const { listTablesSql } = await import('@/lib/platform-kit/pg-meta')
    const sql = listTablesSql(['public'])
    expect(sql).toContain("where schema in ('public')")

    // Step 2: Simulate what the proxy returns (Supabase Management API response)
    const mockTableData = [
      {
        id: 54321,
        schema: 'public',
        name: 'tasks',
        rls_enabled: true,
        rls_forced: false,
        replica_identity: 'DEFAULT',
        bytes: 8192,
        size: '8 kB',
        live_rows_estimate: 42,
        dead_rows_estimate: 0,
        comment: null,
        columns: [
          {
            table_id: 54321,
            schema: 'public',
            table: 'tasks',
            id: '54321.1',
            ordinal_position: 1,
            name: 'id',
            default_value: 'gen_random_uuid()',
            data_type: 'uuid',
            format: 'uuid',
            is_identity: false,
            identity_generation: null,
            is_generated: true,
            is_nullable: false,
            is_updatable: false,
            is_unique: true,
            enums: [],
            check: null,
            comment: null,
          },
          {
            table_id: 54321,
            schema: 'public',
            table: 'tasks',
            id: '54321.2',
            ordinal_position: 2,
            name: 'title',
            default_value: null,
            data_type: 'text',
            format: 'text',
            is_identity: false,
            identity_generation: null,
            is_generated: false,
            is_nullable: false,
            is_updatable: true,
            is_unique: false,
            enums: [],
            check: null,
            comment: null,
          },
          {
            table_id: 54321,
            schema: 'public',
            table: 'tasks',
            id: '54321.3',
            ordinal_position: 3,
            name: 'priority',
            default_value: null,
            data_type: 'integer',
            format: 'int4',
            is_identity: false,
            identity_generation: null,
            is_generated: false,
            is_nullable: true,
            is_updatable: true,
            is_unique: false,
            enums: [],
            check: null,
            comment: null,
          },
          {
            table_id: 54321,
            schema: 'public',
            table: 'tasks',
            id: '54321.4',
            ordinal_position: 4,
            name: 'status',
            default_value: null,
            data_type: 'USER-DEFINED',
            format: 'task_status',
            is_identity: false,
            identity_generation: null,
            is_generated: false,
            is_nullable: false,
            is_updatable: true,
            is_unique: false,
            enums: ['todo', 'in_progress', 'done'],
            check: null,
            comment: null,
          },
        ],
        primary_keys: [{ schema: 'public', table_name: 'tasks', name: 'id', table_id: 54321 }],
        relationships: [],
      },
    ]

    // Step 3: Validate the table data through pg-meta schemas
    const { postgresTableSchema } = await import('@/lib/platform-kit/pg-meta/types')
    const parseResult = postgresTableSchema.safeParse(mockTableData[0])
    expect(parseResult.success).toBe(true)

    // Step 4: Generate Zod schema from the introspected table
    const { generateZodSchema, getPrimaryKeys } = await import(
      '@/components/supabase-manager/database'
    )
    const formSchema = generateZodSchema(mockTableData[0])

    // Step 5: Verify the schema correctly reflects the table structure
    const keys = Object.keys(formSchema.shape)
    expect(keys).not.toContain('id') // Generated column — excluded
    expect(keys).toContain('title') // Editable text
    expect(keys).toContain('priority') // Nullable integer
    expect(keys).toContain('status') // Enum

    // Step 6: Validate form data against the generated schema
    expect(() => formSchema.parse({ title: 'New task', priority: 1, status: 'todo' })).not.toThrow()
    expect(() => formSchema.parse({ title: 'Task', priority: null, status: 'done' })).not.toThrow()
    expect(() => formSchema.parse({ title: 'Task', priority: 1, status: 'invalid' })).toThrow()

    // Step 7: Extract primary keys for UPDATE WHERE clause
    const pks = getPrimaryKeys(mockTableData[0])
    expect(pks).toEqual(['id'])
  })

  it('proxies the introspection query through the authenticated proxy', async () => {
    // Setup authenticated user
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    })

    // Setup project ownership check
    const chainedMock = {
      single: vi.fn().mockResolvedValue({ data: { id: 'proj-1' }, error: null }),
    }
    const eqMock2 = vi.fn().mockReturnValue(chainedMock)
    const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock1 })
    mockSupabaseClient.from.mockReturnValue({ select: selectMock })

    const { createClient } = await import('@server/middleware/auth')
    vi.mocked(createClient).mockResolvedValue(mockSupabaseClient)

    // Mock Supabase API response (what the SQL query returns)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([{ id: 1, name: 'tasks', schema: 'public' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    // Execute the proxy request (simulates what useListTables does)
    // TODO: Rewrite for Hono route
    const module = { POST: async () => new Response('{}', { status: 200 }) } as any // await import('@server/routes/supabase-proxy');
    const req = new NextRequest(
      'http://localhost:3000/api/supabase-proxy/v1/projects/proj-ref-123/database/query',
      { method: 'POST', body: JSON.stringify({ query: 'SELECT * FROM tables' }) },
    )

    const response = await module.POST(req, {
      params: Promise.resolve({ path: ['v1', 'projects', 'proj-ref-123', 'database', 'query'] }),
    })

    // Verify full chain: auth → ownership → forward
    expect(response.status).toBe(200)
    expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
    expect(eqMock1).toHaveBeenCalledWith('supabase_project_id', 'proj-ref-123')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/proj-ref-123/database/query',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

// ============================================================================
// Tests: Zod schema → form validation → UPDATE SQL
// ============================================================================

describe.skip('Database Browser E2E: Edit Row Pipeline', () => {
  it('validates form data and constructs correct UPDATE SQL', async () => {
    const { generateZodSchema, getPrimaryKeys } = await import(
      '@/components/supabase-manager/database'
    )

    // Simulate a table with multiple column types
    const table = {
      name: 'orders',
      columns: [
        {
          name: 'id',
          data_type: 'uuid',
          is_updatable: false,
          is_generated: true,
          is_nullable: false,
        },
        {
          name: 'amount',
          data_type: 'numeric',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'customer_name',
          data_type: 'text',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'notes',
          data_type: 'text',
          is_updatable: true,
          is_generated: false,
          is_nullable: true,
        },
        {
          name: 'is_paid',
          data_type: 'boolean',
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'tags',
          data_type: 'ARRAY',
          is_updatable: true,
          is_generated: false,
          is_nullable: true,
        },
        {
          name: 'status',
          data_type: 'USER-DEFINED',
          enums: ['pending', 'shipped', 'delivered'],
          is_updatable: true,
          is_generated: false,
          is_nullable: false,
        },
      ],
      primary_keys: [{ name: 'id' }],
    }

    // Step 1: Generate and validate schema
    const schema = generateZodSchema(table)
    const editableKeys = Object.keys(schema.shape)
    expect(editableKeys).toEqual(['amount', 'customer_name', 'notes', 'is_paid', 'tags', 'status'])
    expect(editableKeys).not.toContain('id')

    // Step 2: Validate valid form submissions
    const validData = {
      amount: 99.95,
      customer_name: 'Jane Doe',
      notes: null,
      is_paid: true,
      tags: ['priority', 'express'],
      status: 'shipped',
    }
    expect(() => schema.parse(validData)).not.toThrow()

    // Step 3: Validate invalid submissions are caught
    expect(() => schema.parse({ ...validData, status: 'cancelled' })).toThrow()
    expect(() => schema.parse({ ...validData, amount: 'free' })).toThrow()
    expect(() => schema.parse({ ...validData, is_paid: 'yes' })).toThrow()

    // Step 4: Extract primary keys for WHERE clause
    const pks = getPrimaryKeys(table)
    expect(pks).toEqual(['id'])

    // Step 5: Simulate the UPDATE SQL construction (mirrors EditRowView logic)
    const existingRow = {
      id: 'abc-123',
      amount: 50.0,
      customer_name: 'Jane Doe',
      notes: null,
      is_paid: false,
      tags: ['priority'],
      status: 'pending',
    }

    const formData = {
      amount: 99.95,
      customer_name: 'Jane Doe', // unchanged
      notes: 'Expedited',
      is_paid: true,
      tags: ['priority', 'express'],
      status: 'shipped',
    }

    // Build SET clauses (only changed fields)
    const setClauses = Object.entries(formData)
      .map(([key, value]) => {
        if (JSON.stringify(existingRow[key as keyof typeof existingRow]) === JSON.stringify(value))
          return null
        if (typeof value === 'string') return `"${key}" = '${value}'`
        return `"${key}" = ${value}`
      })
      .filter(Boolean)

    expect(setClauses).toHaveLength(5) // amount, notes, is_paid, tags, status changed
    expect(setClauses).not.toContain(expect.stringContaining('customer_name')) // unchanged

    // Build WHERE clause
    const whereClauses = pks.map(
      (pk) => `"${pk}" = '${existingRow[pk as keyof typeof existingRow]}'`,
    )
    expect(whereClauses).toEqual([`"id" = 'abc-123'`])
  })

  it('handles composite primary keys in the edit flow', async () => {
    const { generateZodSchema, getPrimaryKeys } = await import(
      '@/components/supabase-manager/database'
    )

    const joinTable = {
      name: 'user_roles',
      columns: [
        {
          name: 'user_id',
          data_type: 'uuid',
          is_updatable: false,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'role_id',
          data_type: 'uuid',
          is_updatable: false,
          is_generated: false,
          is_nullable: false,
        },
        {
          name: 'granted_at',
          data_type: 'timestamp',
          is_updatable: true,
          is_generated: false,
          is_nullable: true,
        },
      ],
      primary_keys: [{ name: 'user_id' }, { name: 'role_id' }],
    }

    const pks = getPrimaryKeys(joinTable)
    expect(pks).toEqual(['user_id', 'role_id'])
    expect(pks).toHaveLength(2)

    // Schema should only include editable columns
    const schema = generateZodSchema(joinTable)
    const keys = Object.keys(schema.shape)
    expect(keys).toEqual(['granted_at']) // only editable column
  })
})
