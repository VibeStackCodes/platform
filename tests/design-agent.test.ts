/**
 * Creative Director design token tests
 *
 * Tests that runArchitect returns a fully-populated DesignSystem with:
 * 1. colors (9 hex fields) — now from Creative Director's colorPalette
 * 2. fonts (display, body, googleFontsUrl) — from Creative Director's typography
 * 3. style (7 enum fields + borderRadius) — from Creative Director's style tokens
 * 4. aestheticDirection, layoutStrategy, signatureDetail — from Creative Director
 *
 * The Creative Director is the single design authority — no separate Design Agent.
 * The Mastra Agent.generate() call is mocked — no real LLM calls.
 */

import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock: @mastra/core/agent
// ---------------------------------------------------------------------------
vi.mock('@mastra/core/agent', () => {
  return {
    Agent: class MockAgent {
      generate() {
        return Promise.resolve({
          object: {
            sitemap: [
              {
                route: '/',
                fileName: 'routes/index.tsx',
                componentName: 'Homepage',
                purpose: 'Landing page',
                brief: {
                  sections: ['Hero', 'Features'],
                  copyDirection: 'Professional',
                  keyInteractions: 'Browse recipes',
                  lucideIcons: ['ChefHat', 'Star'],
                  shadcnComponents: ['Button', 'Card'],
                },
              },
            ],
            nav: {
              style: 'sticky-blur',
              logo: 'RecipePress',
              links: [{ label: 'Home', href: '/' }],
              cta: null,
              mobileStyle: 'sheet',
            },
            designSystem: {
              aestheticDirection: 'warm-neutral',
              layoutStrategy: 'full-bleed',
              signatureDetail: 'Subtle scroll-triggered reveal animations',
              colorPalette: {
                primary: '#2b6cb0',
                secondary: '#e8e4df',
                accent: '#d4a373',
                background: '#faf9f6',
                text: '#1a1a2e',
                primaryForeground: '#ffffff',
                foreground: '#1a1a2e',
                muted: '#f0ece6',
                border: '#d1ccc4',
              },
              typography: {
                display: 'Playfair Display',
                body: 'Source Sans 3',
              },
              style: {
                borderRadius: '0.5rem',
                cardStyle: 'elevated',
                navStyle: 'top-bar',
                heroLayout: 'split',
                spacing: 'normal',
                motion: 'subtle',
                imagery: 'photography-heavy',
              },
              imageManifest: {},
            },
            footer: {
              style: 'minimal',
              columns: [],
              showNewsletter: false,
              socialLinks: [],
              copyright: '© 2026 RecipePress',
            },
          },
          usage: { inputTokens: 200, outputTokens: 150 },
        })
      }
    },
  }
})

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { runArchitect } from '@server/lib/agents/orchestrator'
import { DEFAULT_TEXT_SLOTS } from '@server/lib/themed-code-engine'

describe('runArchitect (Creative Director — single design authority)', () => {
  it('returns spec, tokens, and tokensUsed', async () => {
    const result = await runArchitect({ appName: 'RecipePress', prd: 'Build a recipe website' })

    expect(result).toHaveProperty('spec')
    expect(result).toHaveProperty('tokens')
    expect(result).toHaveProperty('tokensUsed')
    expect(result.tokensUsed).toBe(350)
  })

  it('tokens.colors has all 9 required hex fields', async () => {
    const { tokens } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })

    const hexRegex = /^#[0-9a-fA-F]{6}$/
    expect(tokens.colors.background).toMatch(hexRegex)
    expect(tokens.colors.foreground).toMatch(hexRegex)
    expect(tokens.colors.primary).toMatch(hexRegex)
    expect(tokens.colors.primaryForeground).toMatch(hexRegex)
    expect(tokens.colors.secondary).toMatch(hexRegex)
    expect(tokens.colors.accent).toMatch(hexRegex)
    expect(tokens.colors.muted).toMatch(hexRegex)
    expect(tokens.colors.border).toMatch(hexRegex)
    expect(tokens.colors.text).toMatch(hexRegex)
  })

  it('tokens.fonts has display, body, and valid googleFontsUrl', async () => {
    const { tokens } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })

    expect(tokens.fonts.display).toBe('Playfair Display')
    expect(tokens.fonts.body).toBe('Source Sans 3')
    expect(tokens.fonts.googleFontsUrl).toContain('fonts.googleapis.com')
    expect(tokens.fonts.googleFontsUrl).toContain('Playfair+Display')
    expect(tokens.fonts.googleFontsUrl).toContain('Source+Sans+3')
  })

  it('tokens.style has all 7 style fields with valid values', async () => {
    const { tokens } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })

    expect(['flat', 'bordered', 'elevated', 'glass']).toContain(tokens.style.cardStyle)
    expect(['top-bar', 'sidebar', 'editorial', 'minimal', 'centered']).toContain(tokens.style.navStyle)
    expect(['fullbleed', 'split', 'centered', 'editorial', 'none']).toContain(tokens.style.heroLayout)
    expect(['compact', 'normal', 'airy']).toContain(tokens.style.spacing)
    expect(['none', 'subtle', 'expressive']).toContain(tokens.style.motion)
    expect(['photography-heavy', 'illustration', 'minimal', 'icon-focused']).toContain(tokens.style.imagery)
    expect(tokens.style.borderRadius).toBe('0.5rem')
  })

  it('tokens.aestheticDirection and layoutStrategy come from Creative Director', async () => {
    const { tokens } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })

    expect(tokens.aestheticDirection).toBe('warm-neutral')
    expect(tokens.layoutStrategy).toBe('full-bleed')
    expect(tokens.signatureDetail).toBe('Subtle scroll-triggered reveal animations')
  })

  it('authPosture is always public', async () => {
    const { tokens } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })
    expect(tokens.authPosture).toBe('public')
  })

  it('textSlots defaults to DEFAULT_TEXT_SLOTS', async () => {
    const { tokens } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })
    expect(tokens.textSlots).toEqual(DEFAULT_TEXT_SLOTS)
  })

  it('heroImages is empty array', async () => {
    const { tokens } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })
    expect(tokens.heroImages).toEqual([])
  })

  it('name is empty string', async () => {
    const { tokens } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })
    expect(tokens.name).toBe('')
  })

  it('spec has sitemap, nav, designSystem, and footer', async () => {
    const { spec } = await runArchitect({ appName: 'TestApp', prd: 'Build an app' })

    expect(spec.sitemap).toHaveLength(1)
    expect(spec.nav).toBeDefined()
    expect(spec.designSystem).toBeDefined()
    expect(spec.footer).toBeDefined()
  })
})
