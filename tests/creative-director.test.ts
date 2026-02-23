import { describe, it, expect } from 'vitest'
import { CreativeSpecSchema } from '@server/lib/agents/schemas'
import { AESTHETIC_DIRECTIONS, LAYOUT_STRATEGIES } from '@server/lib/design-system'

describe('CreativeSpecSchema with DesignSystem fields', () => {
  it('requires aestheticDirection in valid enum', () => {
    const minSpec = {
      sitemap: [],
      nav: {
        style: 'sticky-blur',
        logo: 'TestApp',
        links: [],
        cta: null,
        mobileStyle: 'sheet',
      },
      footer: {
        style: 'minimal',
        columns: [],
        showNewsletter: false,
        socialLinks: [],
        copyright: '© 2026',
      },
      designSystem: {
        aestheticDirection: 'dark-cinematic',
        layoutStrategy: 'full-bleed',
        signatureDetail: 'Parallax hero with gradient shift on mouse movement',
        colorPalette: {
          primary: '#1a1a2e',
          secondary: '#16213e',
          accent: '#e94560',
          background: '#0f0f0f',
          text: '#f5f5f5',
        },
        typography: {
          display: 'DM Serif Display',
          body: 'Outfit',
        },
        imageManifest: {},
      },
    }

    const result = CreativeSpecSchema.parse(minSpec)
    expect(result.designSystem.aestheticDirection).toBe('dark-cinematic')
  })

  it('rejects unknown aesthetic direction', () => {
    const bad = {
      sitemap: [],
      nav: { style: 'sticky-blur', logo: 'X', links: [], cta: null, mobileStyle: 'sheet' },
      footer: { style: 'minimal', columns: [], showNewsletter: false, socialLinks: [], copyright: '©' },
      designSystem: {
        aestheticDirection: 'clean-and-modern',
        layoutStrategy: 'full-bleed',
        signatureDetail: 'test',
        colorPalette: { primary: '#000', secondary: '#111', accent: '#f00', background: '#fff', text: '#000' },
        typography: { display: 'Syne', body: 'Outfit' },
        imageManifest: {},
      },
    }
    expect(() => CreativeSpecSchema.parse(bad)).toThrow()
  })
})

// Sanity check: AESTHETIC_DIRECTIONS and LAYOUT_STRATEGIES are exported arrays
describe('design-system exports', () => {
  it('AESTHETIC_DIRECTIONS contains dark-cinematic', () => {
    expect(AESTHETIC_DIRECTIONS).toContain('dark-cinematic')
  })

  it('LAYOUT_STRATEGIES contains full-bleed', () => {
    expect(LAYOUT_STRATEGIES).toContain('full-bleed')
  })
})
