import { describe, it, expect, vi } from 'vitest'
import type { PageGeneratorInput } from '@server/page-generator'

describe('page-generator callbacks', () => {
  it('PageGeneratorInput accepts onPageStart and onPageComplete callbacks', () => {
    const input: PageGeneratorInput = {
      spec: { archetype: 'static', sitemap: [], visualDna: {} as any, auth: { required: false }, publicRoutes: [] },
      onPageStart: vi.fn(),
      onPageComplete: vi.fn(),
    }
    expect(input.onPageStart).toBeDefined()
    expect(input.onPageComplete).toBeDefined()
  })
})
