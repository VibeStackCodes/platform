// tests/pipeline-dag.test.ts
import { describe, it, expect } from 'vitest';
import { runDAG, type Stage } from '@/lib/pipeline-dag';

describe('runDAG', () => {
  it('runs stages in dependency order', async () => {
    const order: string[] = [];
    const stages: Stage<{ order: string[] }>[] = [
      { name: 'a', deps: [], run: async (ctx) => { ctx.order.push('a'); } },
      { name: 'b', deps: ['a'], run: async (ctx) => { ctx.order.push('b'); } },
      { name: 'c', deps: ['b'], run: async (ctx) => { ctx.order.push('c'); } },
    ];
    await runDAG(stages, { order });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('runs independent stages in parallel', async () => {
    const timestamps: Record<string, number> = {};
    const stages: Stage<{ ts: Record<string, number> }>[] = [
      {
        name: 'a',
        deps: [],
        run: async (ctx) => {
          ctx.ts['a_start'] = Date.now();
          await new Promise(r => setTimeout(r, 50));
          ctx.ts['a_end'] = Date.now();
        },
      },
      {
        name: 'b',
        deps: [],
        run: async (ctx) => {
          ctx.ts['b_start'] = Date.now();
          await new Promise(r => setTimeout(r, 50));
          ctx.ts['b_end'] = Date.now();
        },
      },
      {
        name: 'c',
        deps: ['a', 'b'],
        run: async (ctx) => { ctx.ts['c'] = Date.now(); },
      },
    ];
    await runDAG(stages, { ts: timestamps });
    // a and b should start within 10ms of each other (parallel)
    expect(Math.abs(timestamps['a_start'] - timestamps['b_start'])).toBeLessThan(20);
    // c should start after both a and b end
    expect(timestamps['c']).toBeGreaterThanOrEqual(timestamps['a_end']);
    expect(timestamps['c']).toBeGreaterThanOrEqual(timestamps['b_end']);
  });

  it('propagates errors from a stage', async () => {
    const stages: Stage<object>[] = [
      { name: 'a', deps: [], run: async () => { throw new Error('boom'); } },
      { name: 'b', deps: ['a'], run: async () => {} },
    ];
    await expect(runDAG(stages, {})).rejects.toThrow('boom');
  });
});
