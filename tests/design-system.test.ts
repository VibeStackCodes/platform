import { describe, it, expect } from 'vitest'
import {
  DesignSystemSchema,
  type DesignSystem,
  AESTHETIC_DIRECTIONS,
  LAYOUT_STRATEGIES,
} from '@server/lib/design-system'

describe('DesignSystemSchema', () => {
  const validDesignSystem: DesignSystem = {
    name: 'canape',
    colors: {
      primary: '#1a1a2e',
      secondary: '#16213e',
      accent: '#e94560',
      background: '#0f0f0f',
      text: '#f5f5f5',
      primaryForeground: '#ffffff',
      foreground: '#f5f5f5',
      muted: '#2a2a3e',
      border: '#333355',
    },
    fonts: {
      display: 'DM Serif Display',
      body: 'Outfit',
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Outfit:wght@300;400;500;600;700&display=swap',
    },
    style: {
      borderRadius: '0.5rem',
      cardStyle: 'bordered',
      navStyle: 'top-bar',
      heroLayout: 'fullbleed',
      spacing: 'normal',
      motion: 'subtle',
      imagery: 'photography-heavy',
    },
    aestheticDirection: 'dark-cinematic',
    layoutStrategy: 'full-bleed',
    signatureDetail: 'Parallax scroll on hero section with gradient that shifts on mouse movement',
    authPosture: 'public',
    heroImages: [{ url: 'https://img.vibestack.codes/s/restaurant-interior-moody-warm-lighting/1600/900', alt: 'Restaurant interior', photographer: 'Unsplash' }],
    heroQuery: 'restaurant interior moody warm lighting',
    textSlots: {
      hero_headline: 'Welcome',
      hero_subtext: 'Fine dining reimagined',
      about_paragraph: 'Our story.',
      cta_label: 'Reserve a table',
      empty_state: 'No items yet.',
      footer_tagline: 'Built with care.',
    },
    imageManifest: {
      '/': {
        hero: { query: 'restaurant interior moody warm lighting candlelit', width: 1600, height: 900, alt: 'Candlelit restaurant interior with warm ambient lighting', role: 'hero', loading: 'eager' },
        testimonial1: { query: 'professional headshot woman natural light confident', width: 200, height: 200, alt: 'Sarah, a regular guest', role: 'testimonial', loading: 'lazy', crop: 'faces' },
      },
    },
  }

  it('parses a valid DesignSystem', () => {
    const result = DesignSystemSchema.parse(validDesignSystem)
    expect(result.aestheticDirection).toBe('dark-cinematic')
    expect(result.layoutStrategy).toBe('full-bleed')
    expect(result.signatureDetail).toBeTruthy()
    expect(result.imageManifest['/']).toBeDefined()
  })

  it('rejects missing aestheticDirection', () => {
    const { aestheticDirection, ...missing } = validDesignSystem
    expect(() => DesignSystemSchema.parse(missing)).toThrow()
  })

  it('rejects invalid aesthetic direction', () => {
    expect(() =>
      DesignSystemSchema.parse({ ...validDesignSystem, aestheticDirection: 'clean-and-modern' })
    ).toThrow()
  })

  it('exports all aesthetic direction and layout strategy enums', () => {
    expect(AESTHETIC_DIRECTIONS.length).toBeGreaterThanOrEqual(15)
    expect(LAYOUT_STRATEGIES.length).toBeGreaterThanOrEqual(9)
  })

  it('validates image manifest entries', () => {
    const badManifest = {
      '/': {
        hero: { query: 'x', width: 1600, height: 900, alt: 'test', role: 'hero', loading: 'eager' },
      },
    }
    const result = DesignSystemSchema.parse({ ...validDesignSystem, imageManifest: badManifest })
    expect(result.imageManifest['/']).toBeDefined()
  })

  it('preserves backward-compat fields from ThemeTokens', () => {
    const result = DesignSystemSchema.parse(validDesignSystem)
    expect(result.style.cardStyle).toBe('bordered')
    expect(result.style.motion).toBe('subtle')
    expect(result.heroImages).toHaveLength(1)
    expect(result.textSlots.hero_headline).toBe('Welcome')
  })
})
