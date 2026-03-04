/**
 * Tests for server/lib/db/queries.ts
 *
 * Drizzle's fluent builder is mocked via vi.mock factory that inlines the db
 * object. Per-test the mock methods are configured to return desired rows.
 * drizzle-orm operators (eq, and, desc, asc) are stubbed to plain objects so
 * we can assert they were called without pulling in the real pg driver.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── drizzle-orm operator stubs ────────────────────────────────────────────────
// Queries use eq / and / desc / asc. We stub them to transparent objects so
// the builder chains still work without a real database connection.
vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ _op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  desc: (col: unknown) => ({ _op: 'desc', col }),
  asc: (col: unknown) => ({ _op: 'asc', col }),
}))

// ── Inline db mock ────────────────────────────────────────────────────────────
// The vi.mock factory is hoisted to the top of the compiled file, so it cannot
// reference variables declared in the test module. We inline the mock object
// directly and export a reference via a getter that tests can reach via `import`.
vi.mock('@server/lib/db/client', () => {
  // Track the latest "pending" result so tests can change it between calls
  let _selectResult: unknown[] = []
  let _insertResult: unknown[] = []
  let _updateResult: unknown[] = []

  // oxlint-ignore no-thenable -- Drizzle chains are thenable by design
  const buildSelectChain = (rows: unknown[]) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  })

  // oxlint-ignore no-thenable -- Drizzle chains are thenable by design
  const buildUpdateChain = (rows: unknown[]) => ({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  })

  const db = {
    // select / insert / update are replaced per-test by calling db._setNext*
    select: vi.fn(() => buildSelectChain(_selectResult)),
    insert: vi.fn(),
    update: vi.fn(() => buildUpdateChain(_updateResult)),
    query: {
      projects: {
        findFirst: vi.fn(),
      },
    },
    // Helpers tests call to configure what the next query returns
    _setSelectResult: (rows: unknown[]) => {
      _selectResult = rows
      db.select.mockImplementation(() => buildSelectChain(rows))
    },
    _setUpdateResult: (rows: unknown[]) => {
      _updateResult = rows
      db.update.mockImplementation(() => buildUpdateChain(rows))
    },
    _setInsertResult: (rows: unknown[], onConflict?: unknown[]) => {
      _insertResult = rows
      const conflictRows = onConflict ?? rows
      // oxlint-ignore no-thenable -- Drizzle chains are thenable by design
      const onConflictBuilder = {
        returning: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(conflictRows).then(resolve),
      }
      // oxlint-ignore no-thenable -- Drizzle chains are thenable by design
      const insertBuilder = {
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockReturnValue(onConflictBuilder),
        returning: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
      }
      db.insert.mockReturnValue(insertBuilder)
      return insertBuilder
    },
  }

  return { db }
})

// ── Schema stub ───────────────────────────────────────────────────────────────
// queries.ts uses column references like `projects.userId`, `profiles.id`.
// We provide token objects so Drizzle's column reference syntax resolves.
vi.mock('@server/lib/db/schema', () => {
  const col = (name: string) => ({ _col: name })
  return {
    projects: new Proxy({ $inferInsert: {} }, { get: (_t, prop) => col(String(prop)) }),
    profiles: new Proxy({}, { get: (_t, prop) => col(String(prop)) }),
  }
})

// Import module under test and the mocked db (using dynamic import after mocks)
const { db } = await import('@server/lib/db/client')
const dbMock = db as typeof db & {
  _setSelectResult: (rows: unknown[]) => void
  _setUpdateResult: (rows: unknown[]) => void
  _setInsertResult: (
    rows: unknown[],
    onConflict?: unknown[],
  ) => {
    values: ReturnType<typeof vi.fn>
    onConflictDoNothing: ReturnType<typeof vi.fn>
  }
}

const {
  getUserProjects,
  getProject,
  updateProject,
  createProject,
  getUserCredits,
  getProfileForCheckout,
  getProfileByStripeId,
} = await import('@server/lib/db/queries')

describe('db-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-attach the helpers after clearAllMocks resets the mock implementations
    dbMock._setSelectResult([])
    dbMock._setUpdateResult([])
  })

  // ── getUserProjects ──────────────────────────────────────────────────────
  describe('getUserProjects', () => {
    it('calls select ordered by createdAt desc and returns rows', async () => {
      const fakeProjects = [
        { id: 'p1', name: 'Project 1', userId: 'u1', createdAt: new Date('2025-01-02') },
        { id: 'p2', name: 'Project 2', userId: 'u1', createdAt: new Date('2025-01-01') },
      ]
      dbMock._setSelectResult(fakeProjects)

      const result = await getUserProjects('u1')

      expect(db.select).toHaveBeenCalledOnce()
      expect(result).toEqual(fakeProjects)
    })
  })

  // ── getProject ───────────────────────────────────────────────────────────
  describe('getProject', () => {
    it('returns the project when id + userId match', async () => {
      const fakeProject = { id: 'p1', userId: 'u1', name: 'My App' }
      dbMock._setSelectResult([fakeProject])

      const result = await getProject('p1', 'u1')

      expect(result).toEqual(fakeProject)
    })

    it('returns null when no rows match', async () => {
      dbMock._setSelectResult([])

      const result = await getProject('p-missing', 'u1')

      expect(result).toBeNull()
    })
  })

  // ── updateProject ────────────────────────────────────────────────────────
  describe('updateProject', () => {
    it('sets updatedAt to current time when updating with userId', async () => {
      const updatedProject = { id: 'p1', name: 'Renamed', userId: 'u1' }
      dbMock._setUpdateResult([updatedProject])

      const beforeCall = new Date()
      const result = await updateProject('p1', { name: 'Renamed' }, 'u1')
      const afterCall = new Date()

      expect(db.update).toHaveBeenCalledOnce()
      // The chain builder captures .set() args — retrieve via the chain mock
      const chain = db.update.mock.results[0].value
      const setArgs = chain.set.mock.calls[0][0]
      expect(setArgs.updatedAt).toBeInstanceOf(Date)
      expect(setArgs.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime())
      expect(setArgs.updatedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime())
      expect(setArgs.name).toBe('Renamed')
      expect(chain.where).toHaveBeenCalledOnce()
      expect(result).toEqual(updatedProject)
    })

    it('updates without userId (no owner scope)', async () => {
      const updatedProject = { id: 'p2', status: 'complete' }
      dbMock._setUpdateResult([updatedProject])

      const result = await updateProject('p2', { status: 'complete' })

      expect(db.update).toHaveBeenCalledOnce()
      expect(result).toEqual(updatedProject)
    })

    it('returns null when no rows are returned', async () => {
      dbMock._setUpdateResult([])

      const result = await updateProject('p-missing', { name: 'X' }, 'u1')

      expect(result).toBeNull()
    })
  })

  // ── createProject ────────────────────────────────────────────────────────
  describe('createProject', () => {
    it('returns the inserted project row', async () => {
      const newProject = {
        id: 'p-new',
        userId: 'u1',
        name: 'Brand New App',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      // createProject uses insert().values().returning().then() — no onConflict
      const returningResult = {
        returning: vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve([newProject]).then(resolve),
      }
      const insertBuilder = {
        values: vi.fn().mockReturnValue(returningResult),
      }
      db.insert.mockReturnValue(insertBuilder)

      const result = await createProject({ userId: 'u1', name: 'Brand New App' } as any)

      expect(db.insert).toHaveBeenCalledOnce()
      expect(insertBuilder.values).toHaveBeenCalledOnce()
      expect(result).toEqual(newProject)
    })
  })

  // ── getUserCredits ───────────────────────────────────────────────────────
  describe('getUserCredits', () => {
    it('returns credit fields for the user', async () => {
      const fakeCredits = {
        creditsRemaining: 150,
        creditsMonthly: 200,
        creditsResetAt: new Date('2025-02-01'),
        plan: 'pro',
      }
      dbMock._setSelectResult([fakeCredits])

      const result = await getUserCredits('u1')

      expect(result).toEqual(fakeCredits)
    })

    it('returns null when no profile found', async () => {
      dbMock._setSelectResult([])

      const result = await getUserCredits('u-nobody')

      expect(result).toBeNull()
    })
  })

  // ── getProfileForCheckout ────────────────────────────────────────────────
  describe('getProfileForCheckout', () => {
    it('returns email and stripeCustomerId', async () => {
      const fakeProfile = { email: 'user@example.com', stripeCustomerId: 'cus_abc123' }
      dbMock._setSelectResult([fakeProfile])

      const result = await getProfileForCheckout('u1')

      expect(result).toEqual(fakeProfile)
    })

    it('returns null when profile not found', async () => {
      dbMock._setSelectResult([])

      const result = await getProfileForCheckout('u-missing')

      expect(result).toBeNull()
    })
  })

  // ── getProfileByStripeId ─────────────────────────────────────────────────
  describe('getProfileByStripeId', () => {
    it('returns profile when stripe customer ID matches', async () => {
      const fakeProfile = { id: 'u1', creditsMonthly: 200 }
      dbMock._setSelectResult([fakeProfile])

      const result = await getProfileByStripeId('cus_abc123')

      expect(result).toEqual(fakeProfile)
    })

    it('returns null when no profile matches stripe customer ID', async () => {
      dbMock._setSelectResult([])

      const result = await getProfileByStripeId('cus_nonexistent')

      expect(result).toBeNull()
    })
  })
})
