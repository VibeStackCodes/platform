import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkCredits } from '@/lib/credits';

describe('Credit System', () => {
  it('checkCredits returns user credits', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                credits_remaining: 1500,
                credits_monthly: 2000,
                credits_reset_at: '2026-03-15T00:00:00Z',
                plan: 'pro',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    const credits = await checkCredits(mockSupabase, 'user-123');
    expect(credits).not.toBeNull();
    expect(credits!.credits_remaining).toBe(1500);
    expect(credits!.plan).toBe('pro');
  });

  it('checkCredits returns null on error', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'not found' },
            }),
          }),
        }),
      }),
    } as any;

    const credits = await checkCredits(mockSupabase, 'user-999');
    expect(credits).toBeNull();
  });

  it('credit math: 1 credit = 1000 tokens', () => {
    const tokensUsed = 5432;
    const creditsUsed = Math.ceil(tokensUsed / 1000);
    expect(creditsUsed).toBe(6); // Rounds up
  });

  it('credit math: exact boundary', () => {
    expect(Math.ceil(1000 / 1000)).toBe(1);
    expect(Math.ceil(1001 / 1000)).toBe(2);
    expect(Math.ceil(999 / 1000)).toBe(1);
    expect(Math.ceil(0 / 1000)).toBe(0);
  });
});
