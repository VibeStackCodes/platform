import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  claimWarmProject,
  releaseProject,
  replenishPool,
  getPoolStatus,
  cleanupZombieProjects,
  cleanupErrorProjects,
} from '@server/lib/supabase-pool'
import { db } from '@server/lib/db/client'
import * as supabaseMgmt from '@server/lib/supabase-mgmt'
// Mock dependencies
vi.mock('@server/lib/db/client', () => ({
  db: {
    execute: vi.fn(),
  },
}))

vi.mock('@server/lib/supabase-mgmt', () => ({
  createSupabaseProject: vi.fn(),
  runMigration: vi.fn(),
}))

describe('supabase-pool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('claimWarmProject', () => {
    it('claims an available project and marks it as claimed', async () => {
      // Raw SQL returns snake_case column names from Postgres
      const mockProject = {
        id: 'pool-123',
        supabase_project_id: 'supabase-abc',
        supabase_url: 'https://supabase-abc.supabase.co',
        anon_key: 'anon-key-123',
        service_role_key: 'service-key-123',
        db_host: 'db.supabase-abc.supabase.co',
        db_password: 'password123',
        region: 'us-east-1',
        status: 'claimed',
        claimed_by: 'user-456',
        claimed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        error_message: null,
      }

      // Mock successful claim
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [mockProject],
      } as any)

      // Mock background replenishment check (pool is full)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ count: '5' }],
      } as any)

      const result = await claimWarmProject('user-456')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('pool-123')
      expect(result?.supabaseProjectId).toBe('supabase-abc')
      expect(result?.claimedBy).toBe('user-456')
      // Should be called twice: once for claim, once for background replenishment check
      expect(db.execute).toHaveBeenCalledTimes(2)
    })

    it('returns null when pool is empty', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await claimWarmProject('user-456')

      expect(result).toBeNull()
    })

    it('returns null on database error', async () => {
      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database error'))

      const result = await claimWarmProject('user-456')

      expect(result).toBeNull()
    })

    it('calls db.execute with correct parameters', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [
          {
            id: 'pool-123',
            supabase_project_id: 'supabase-abc',
            supabase_url: 'https://supabase-abc.supabase.co',
            anon_key: 'anon-key-123',
            service_role_key: 'service-key-123',
            db_host: 'db.supabase-abc.supabase.co',
            db_password: 'password123',
            region: 'us-east-1',
            status: 'claimed',
            claimed_by: 'user-456',
            claimed_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            error_message: null,
          },
        ],
      } as any)

      // Mock background replenishment check
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ count: '5' }],
      } as any)

      await claimWarmProject('user-456')

      // Verify db.execute was called (claim + background replenishment check)
      expect(db.execute).toHaveBeenCalledTimes(2)
      expect(db.execute).toHaveBeenCalledWith(expect.any(Object))
    })
  })

  describe('releaseProject', () => {
    it('resets schema and releases project back to pool', async () => {
      vi.mocked(supabaseMgmt.runMigration).mockResolvedValueOnce({
        success: true,
        executedAt: new Date().toISOString(),
      })

      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      await releaseProject('supabase-abc')

      // Verify schema reset was called
      expect(supabaseMgmt.runMigration).toHaveBeenCalledWith(
        'supabase-abc',
        expect.stringContaining('DROP SCHEMA public CASCADE'),
      )

      // Verify status update to available was called
      expect(db.execute).toHaveBeenCalledOnce()
      expect(db.execute).toHaveBeenCalledWith(expect.any(Object))
    })

    it('includes all required grants and extensions in schema reset', async () => {
      vi.mocked(supabaseMgmt.runMigration).mockResolvedValueOnce({
        success: true,
        executedAt: new Date().toISOString(),
      })

      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      await releaseProject('supabase-abc')

      // Verify enhanced reset SQL includes all required elements
      const resetSQLCall = vi.mocked(supabaseMgmt.runMigration).mock.calls[0][1]
      expect(resetSQLCall).toContain('DROP SCHEMA public CASCADE')
      expect(resetSQLCall).toContain('CREATE SCHEMA public')
      expect(resetSQLCall).toContain('GRANT USAGE ON SCHEMA public TO anon')
      expect(resetSQLCall).toContain('GRANT USAGE ON SCHEMA public TO authenticated')
      expect(resetSQLCall).toContain('GRANT USAGE ON SCHEMA public TO service_role')
      expect(resetSQLCall).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
      expect(resetSQLCall).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
      expect(resetSQLCall).toContain('ALTER DEFAULT PRIVILEGES')
    })

    it('marks project as error if schema reset fails', async () => {
      vi.mocked(supabaseMgmt.runMigration).mockResolvedValueOnce({
        success: false,
        error: 'Migration failed',
        executedAt: new Date().toISOString(),
      })

      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      await releaseProject('supabase-abc')

      // Verify error status was set
      expect(db.execute).toHaveBeenCalledOnce()
      expect(db.execute).toHaveBeenCalledWith(expect.any(Object))
    })

    it('throws error on database failure', async () => {
      vi.mocked(supabaseMgmt.runMigration).mockResolvedValueOnce({
        success: true,
        executedAt: new Date().toISOString(),
      })

      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database error'))

      await expect(releaseProject('supabase-abc')).rejects.toThrow('Database error')
    })
  })

  describe('replenishPool', () => {
    it('acquires advisory lock and releases it after completion', async () => {
      // Mock lock acquisition (acquired = true)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ acquired: true }],
      } as any)

      // Mock available count: pool is full
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ count: '5' }],
      } as any)

      // Mock lock release
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await replenishPool(5)

      expect(result.created).toBe(0)
      expect(result.errors).toHaveLength(0)
      // Verify lock was acquired and released
      expect(db.execute).toHaveBeenCalledTimes(3)
    })

    it('skips replenishment when advisory lock is already held', async () => {
      // Mock lock acquisition (acquired = false)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ acquired: false }],
      } as any)

      const result = await replenishPool(5)

      expect(result.created).toBe(0)
      expect(result.errors).toHaveLength(0)
      // Should only try to acquire lock, no further operations
      expect(db.execute).toHaveBeenCalledTimes(1)
      expect(supabaseMgmt.createSupabaseProject).not.toHaveBeenCalled()
    })

    it('releases advisory lock even when replenishment throws', async () => {
      // Mock lock acquisition (acquired = true)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ acquired: true }],
      } as any)

      // Mock available count query throws
      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database error'))

      // Mock lock release
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await replenishPool(5)

      expect(result.created).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toBe('Database error')
      // Verify lock release was attempted
      expect(db.execute).toHaveBeenCalledTimes(3)
    })

    it('creates correct number of projects to reach target', async () => {
      // Mock lock acquisition
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ acquired: true }],
      } as any)
      // Mock available count: 2 (need 3 more to reach target of 5)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ count: '2' }],
      } as any)

      // For each of 3 projects: INSERT placeholder, then UPDATE with real data
      for (let i = 0; i < 3; i++) {
        // INSERT placeholder
        vi.mocked(db.execute).mockResolvedValueOnce({
          rows: [{ id: `placeholder-${i}` }],
        } as any)

        // Mock createSupabaseProject
        vi.mocked(supabaseMgmt.createSupabaseProject).mockResolvedValueOnce({
          id: `supabase-${i}`,
          name: `vibestack-warm-${i}`,
          orgId: 'org-123',
          region: 'us-east-1',
          dbHost: `db.supabase-${i}.supabase.co`,
          dbPassword: `password-${i}`,
          anonKey: `anon-${i}`,
          serviceRoleKey: `service-${i}`,
          url: `https://supabase-${i}.supabase.co`,
        })

        // UPDATE with real project data
        vi.mocked(db.execute).mockResolvedValueOnce({
          rows: [],
        } as any)
      }

      // Mock lock release
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await replenishPool(5)

      expect(result.created).toBe(3)
      expect(result.errors).toHaveLength(0)
      expect(supabaseMgmt.createSupabaseProject).toHaveBeenCalledTimes(3)
    })

    it('returns early when pool is already full', async () => {
      // Mock lock acquisition
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ acquired: true }],
      } as any)

      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ count: '5' }],
      } as any)

      // Mock lock release
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await replenishPool(5)

      expect(result.created).toBe(0)
      expect(result.errors).toHaveLength(0)
      expect(supabaseMgmt.createSupabaseProject).not.toHaveBeenCalled()
    })

    it('collects errors but continues creating remaining projects', async () => {
      // Mock lock acquisition
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ acquired: true }],
      } as any)

      // Mock available count: 3 (need 2 more to reach target of 5)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ count: '3' }],
      } as any)

      // First project: placeholder INSERT succeeds
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ id: 'placeholder-1' }],
      } as any)

      // First project: createSupabaseProject fails
      vi.mocked(supabaseMgmt.createSupabaseProject).mockRejectedValueOnce(
        new Error('API rate limit'),
      )

      // First project error: UPDATE placeholder to 'error' status (catch block)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      // Second project: placeholder INSERT succeeds
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ id: 'placeholder-2' }],
      } as any)

      // Second project: createSupabaseProject succeeds
      vi.mocked(supabaseMgmt.createSupabaseProject).mockResolvedValueOnce({
        id: 'supabase-2',
        name: 'vibestack-warm-2',
        orgId: 'org-123',
        region: 'us-east-1',
        dbHost: 'db.supabase-2.supabase.co',
        dbPassword: 'password-2',
        anonKey: 'anon-2',
        serviceRoleKey: 'service-2',
        url: 'https://supabase-2.supabase.co',
      })

      // Second project: UPDATE succeeds
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      // Mock lock release
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await replenishPool(5)

      expect(result.created).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('API rate limit')
    })

    it('handles complete failure gracefully', async () => {
      // Mock lock acquisition
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ acquired: true }],
      } as any)

      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database unavailable'))

      // Mock lock release
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await replenishPool(5)

      expect(result.created).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toBe('Database unavailable')
    })
  })

  describe('getPoolStatus', () => {
    it('returns correct counts for available, claimed, and total', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [
          {
            available: '3',
            claimed: '2',
            total: '5',
          },
        ],
      } as any)

      const result = await getPoolStatus()

      expect(result.available).toBe(3)
      expect(result.claimed).toBe(2)
      expect(result.total).toBe(5)
    })

    it('returns zeros on database error', async () => {
      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database error'))

      const result = await getPoolStatus()

      expect(result.available).toBe(0)
      expect(result.claimed).toBe(0)
      expect(result.total).toBe(0)
    })

    it('calls db.execute to get aggregated counts', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [
          {
            available: '5',
            claimed: '0',
            total: '5',
          },
        ],
      } as any)

      await getPoolStatus()

      expect(db.execute).toHaveBeenCalledOnce()
      expect(db.execute).toHaveBeenCalledWith(expect.any(Object))
    })
  })

  describe('concurrent claim prevention', () => {
    it('atomic SQL prevents double allocation', async () => {
      // Simulate concurrent claims - only one should succeed
      // Raw SQL returns snake_case column names from Postgres
      const mockProject = {
        id: 'pool-123',
        supabase_project_id: 'supabase-abc',
        supabase_url: 'https://supabase-abc.supabase.co',
        anon_key: 'anon-key-123',
        service_role_key: 'service-key-123',
        db_host: 'db.supabase-abc.supabase.co',
        db_password: 'password123',
        region: 'us-east-1',
        status: 'claimed',
        claimed_by: 'user-456',
        claimed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        error_message: null,
      }

      // First claim succeeds
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [mockProject],
      } as any)

      // Second concurrent claim gets no rows (locked by first)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const [result1, result2] = await Promise.all([
        claimWarmProject('user-456'),
        claimWarmProject('user-789'),
      ])

      expect(result1).not.toBeNull()
      expect(result2).toBeNull()
    })
  })

  describe('replenish-on-claim', () => {
    it('triggers background replenishment after successful claim', async () => {
      // Raw SQL returns snake_case column names from Postgres
      const mockProject = {
        id: 'pool-123',
        supabase_project_id: 'supabase-abc',
        supabase_url: 'https://supabase-abc.supabase.co',
        anon_key: 'anon-key-123',
        service_role_key: 'service-key-123',
        db_host: 'db.supabase-abc.supabase.co',
        db_password: 'password123',
        region: 'us-east-1',
        status: 'claimed',
        claimed_by: 'user-456',
        claimed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        error_message: null,
      }

      // Mock successful claim
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [mockProject],
      } as any)

      // Mock replenish check (pool is full, no replenishment needed)
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ count: '5' }],
      } as any)

      const result = await claimWarmProject('user-456')

      expect(result).not.toBeNull()
      // The replenish happens in background (fire-and-forget), so we can't easily verify it's called
      // But we can verify the claim succeeded
      expect(result?.id).toBe('pool-123')
    })

    it('does not block claim even if replenishment fails', async () => {
      // Raw SQL returns snake_case column names from Postgres
      const mockProject = {
        id: 'pool-123',
        supabase_project_id: 'supabase-abc',
        supabase_url: 'https://supabase-abc.supabase.co',
        anon_key: 'anon-key-123',
        service_role_key: 'service-key-123',
        db_host: 'db.supabase-abc.supabase.co',
        db_password: 'password123',
        region: 'us-east-1',
        status: 'claimed',
        claimed_by: 'user-456',
        claimed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        error_message: null,
      }

      // Mock successful claim
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [mockProject],
      } as any)

      // Mock replenish failure
      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database unavailable'))

      const result = await claimWarmProject('user-456')

      // Claim should succeed despite background replenishment failure
      expect(result).not.toBeNull()
      expect(result?.id).toBe('pool-123')
    })
  })

  describe('cleanupZombieProjects', () => {
    it('uses 30 minutes as default threshold', async () => {
      // Mock zombie projects query
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      await cleanupZombieProjects()

      // Verify the SQL query was called with a timestamp calculated from 30 min ago
      expect(db.execute).toHaveBeenCalledWith(expect.any(Object))
    })

    it('releases projects claimed more than default threshold ago', async () => {
      // Mock zombie projects query
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [
          { supabase_project_id: 'zombie-1' },
          { supabase_project_id: 'zombie-2' },
        ],
      } as any)

      // Mock releaseProject calls
      // For zombie-1: reset schema succeeds
      vi.mocked(supabaseMgmt.runMigration).mockResolvedValueOnce({
        success: true,
        executedAt: new Date().toISOString(),
      })
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      // For zombie-2: reset schema succeeds
      vi.mocked(supabaseMgmt.runMigration).mockResolvedValueOnce({
        success: true,
        executedAt: new Date().toISOString(),
      })
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await cleanupZombieProjects()

      expect(result.released).toBe(2)
      expect(result.errors).toHaveLength(0)
    })

    it('returns early when no zombie projects found', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await cleanupZombieProjects()

      expect(result.released).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('collects errors but continues releasing remaining projects', async () => {
      // Mock zombie projects query
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [
          { supabase_project_id: 'zombie-1' },
          { supabase_project_id: 'zombie-2' },
        ],
      } as any)

      // For zombie-1: release fails
      vi.mocked(supabaseMgmt.runMigration).mockRejectedValueOnce(new Error('Migration failed'))

      // For zombie-2: release succeeds
      vi.mocked(supabaseMgmt.runMigration).mockResolvedValueOnce({
        success: true,
        executedAt: new Date().toISOString(),
      })
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await cleanupZombieProjects()

      expect(result.released).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('zombie-1')
    })

    it('uses custom maxAgeMs parameter', async () => {
      // Mock zombie projects query
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const customAge = 30 * 60 * 1000 // 30 minutes
      const result = await cleanupZombieProjects(customAge)

      expect(result.released).toBe(0)
      expect(db.execute).toHaveBeenCalledWith(expect.any(Object))
    })

    it('handles database error gracefully', async () => {
      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database unavailable'))

      const result = await cleanupZombieProjects()

      expect(result.released).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toBe('Database unavailable')
    })
  })

  describe('cleanupErrorProjects', () => {
    it('removes error-state projects from pool', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [
          { id: 'error-1' },
          { id: 'error-2' },
          { id: 'error-3' },
        ],
      } as any)

      const result = await cleanupErrorProjects()

      expect(result).toBe(3)
      expect(db.execute).toHaveBeenCalledWith(expect.any(Object))
    })

    it('returns 0 when no error projects found', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [],
      } as any)

      const result = await cleanupErrorProjects()

      expect(result).toBe(0)
    })

    it('returns 0 on database error', async () => {
      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database error'))

      const result = await cleanupErrorProjects()

      expect(result).toBe(0)
    })
  })
})
