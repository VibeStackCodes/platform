import { describe, it, expect } from 'vitest'
import { generateImagesBlock } from '@server/lib/page-assembler'
import type { PageImageManifest } from '@server/lib/design-system'

describe('generateImagesBlock', () => {
  it('generates IMAGES const from manifest', () => {
    const manifest: PageImageManifest = {
      hero: {
        query: 'restaurant interior moody warm lighting candlelit',
        width: 1600, height: 900,
        alt: 'Candlelit restaurant interior',
        role: 'hero', loading: 'eager',
      },
      testimonial1: {
        query: 'professional headshot woman natural light',
        width: 200, height: 200,
        alt: 'Sarah, a regular guest',
        role: 'testimonial', loading: 'lazy',
        crop: 'faces',
      },
    }

    const block = generateImagesBlock(manifest)
    expect(block).toContain('const IMAGES = {')
    expect(block).toContain('img.vibestack.codes/s/')
    expect(block).toContain('restaurant%20interior%20moody%20warm%20lighting%20candlelit')
    expect(block).toContain('?crop=faces')
    expect(block).toContain("alt: 'Candlelit restaurant interior'")
  })

  it('returns empty string for empty manifest', () => {
    expect(generateImagesBlock({})).toBe('')
  })
})
