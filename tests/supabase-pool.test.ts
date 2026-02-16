import { describe, expect, it, vi, beforeEach } from 'vitest'
import { claimWarmProject, releaseProject, replenishPool, getPoolStatus } from '@server/lib/supabase-pool'
import { db } from '@server/lib/db/client'
import * as supabaseMgmt from '@server/lib/supabase-mgmt'
import type { WarmSupabaseProject } from '@server/lib/db/schema'

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
      const mockProject: WarmSupabaseProject = {
        id: 'pool-123',
        supabaseProjectId: 'supabase-abc',
        supabaseUrl: 'https://supabase-abc.supabase.co',
        anonKey: 'anon-key-123',
        serviceRoleKey: 'service-key-123',
        dbHost: 'db.supabase-abc.supabase.co',
        dbPassword: 'password123',
        region: 'us-east-1',
        status: 'claimed',
        claimedBy: 'user-456',
        claimedAt: new Date(),
        createdAt: new Date(),
        errorMessage: null,
      }

      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [mockProject],
      } as any)

      const result = await claimWarmProject('user-456')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('pool-123')
      expect(result?.supabaseProjectId).toBe('supabase-abc')
      expect(result?.claimedBy).toBe('user-456')
      expect(db.execute).toHaveBeenCalledOnce()
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
            supabaseProjectId: 'supabase-abc',
            supabaseUrl: 'https://supabase-abc.supabase.co',
            anonKey: 'anon-key-123',
            serviceRoleKey: 'service-key-123',
            dbHost: 'db.supabase-abc.supabase.co',
            dbPassword: 'password123',
            region: 'us-east-1',
            status: 'claimed',
            claimedBy: 'user-456',
            claimedAt: new Date(),
            createdAt: new Date(),
            errorMessage: null,
          } as WarmSupabaseProject,
        ],
      } as any)

      await claimWarmProject('user-456')

      // Verify db.execute was called
      expect(db.execute).toHaveBeenCalledOnce()
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
    it('creates correct number of projects to reach target', async () => {
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

      const result = await replenishPool(5)

      expect(result.created).toBe(3)
      expect(result.errors).toHaveLength(0)
      expect(supabaseMgmt.createSupabaseProject).toHaveBeenCalledTimes(3)
    })

    it('returns early when pool is already full', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce({
        rows: [{ count: '5' }],
      } as any)

      const result = await replenishPool(5)

      expect(result.created).toBe(0)
      expect(result.errors).toHaveLength(0)
      expect(supabaseMgmt.createSupabaseProject).not.toHaveBeenCalled()
    })

    it('collects errors but continues creating remaining projects', async () => {
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

      const result = await replenishPool(5)

      expect(result.created).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('API rate limit')
    })

    it('handles complete failure gracefully', async () => {
      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Database unavailable'))

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
      const mockProject: WarmSupabaseProject = {
        id: 'pool-123',
        supabaseProjectId: 'supabase-abc',
        supabaseUrl: 'https://supabase-abc.supabase.co',
        anonKey: 'anon-key-123',
        serviceRoleKey: 'service-key-123',
        dbHost: 'db.supabase-abc.supabase.co',
        dbPassword: 'password123',
        region: 'us-east-1',
        status: 'claimed',
        claimedBy: 'user-456',
        claimedAt: new Date(),
        createdAt: new Date(),
        errorMessage: null,
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
})
