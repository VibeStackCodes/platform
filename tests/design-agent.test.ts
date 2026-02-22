/**
 * Design Agent tests
 *
 * Tests that runDesignAgent returns ThemeTokens with:
 * 1. colors (8 hex fields)
 * 2. fonts (display, body, googleFontsUrl)
 * 3. style (6 enum fields + borderRadius)
 * 4. Default values for fields the Design Agent no longer manages
 *
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
            colors: {
              background: '#faf9f6',
              foreground: '#1a1a2e',
              primary: '#2b6cb0',
              primaryForeground: '#ffffff',
              secondary: '#e8e4df',
              accent: '#d4a373',
              muted: '#f0ece6',
              border: '#d1ccc4',
            },
            fonts: {
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
          },
          totalUsage: { totalTokens: 350 },
        })
      }
    },
  }
})

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { runDesignAgent } from '@server/lib/agents/design-agent'
import { DEFAULT_TEXT_SLOTS } from '@server/lib/themed-code-engine'

describe('runDesignAgent', () => {
  it('returns tokens and tokensUsed', async () => {
    const result = await runDesignAgent('RecipePress', 'Build a recipe website for sharing and discovering recipes')

    expect(result).toHaveProperty('tokens')
    expect(result).toHaveProperty('tokensUsed')
    expect(result.tokensUsed).toBe(350)
  })

  it('tokens.colors has all 8 required hex fields', async () => {
    const { tokens } = await runDesignAgent('TestApp', 'Build an app')

    const hexRegex = /^#[0-9a-fA-F]{6}$/
    expect(tokens.colors.background).toMatch(hexRegex)
    expect(tokens.colors.foreground).toMatch(hexRegex)
    expect(tokens.colors.primary).toMatch(hexRegex)
    expect(tokens.colors.primaryForeground).toMatch(hexRegex)
    expect(tokens.colors.secondary).toMatch(hexRegex)
    expect(tokens.colors.accent).toMatch(hexRegex)
    expect(tokens.colors.muted).toMatch(hexRegex)
    expect(tokens.colors.border).toMatch(hexRegex)
  })

  it('tokens.fonts has display, body, and valid googleFontsUrl', async () => {
    const { tokens } = await runDesignAgent('TestApp', 'Build an app')

    expect(tokens.fonts.display).toBe('Playfair Display')
    expect(tokens.fonts.body).toBe('Source Sans 3')
    expect(tokens.fonts.googleFontsUrl).toContain('fonts.googleapis.com')
    expect(tokens.fonts.googleFontsUrl).toContain('Playfair+Display')
    expect(tokens.fonts.googleFontsUrl).toContain('Source+Sans+3')
  })

  it('tokens.style has all 6 enum fields with valid values', async () => {
    const { tokens } = await runDesignAgent('TestApp', 'Build an app')

    expect(['flat', 'bordered', 'elevated', 'glass']).toContain(tokens.style.cardStyle)
    expect(['top-bar', 'sidebar', 'editorial', 'minimal', 'centered']).toContain(tokens.style.navStyle)
    expect(['fullbleed', 'split', 'centered', 'editorial', 'none']).toContain(tokens.style.heroLayout)
    expect(['compact', 'normal', 'airy']).toContain(tokens.style.spacing)
    expect(['none', 'subtle', 'expressive']).toContain(tokens.style.motion)
    expect(['photography-heavy', 'illustration', 'minimal', 'icon-focused']).toContain(tokens.style.imagery)
    expect(tokens.style.borderRadius).toBe('0.5rem')
  })

  it('authPosture is always public', async () => {
    const { tokens } = await runDesignAgent('TestApp', 'Build an app')
    expect(tokens.authPosture).toBe('public')
  })

  it('textSlots defaults to DEFAULT_TEXT_SLOTS', async () => {
    const { tokens } = await runDesignAgent('TestApp', 'Build an app')
    expect(tokens.textSlots).toEqual(DEFAULT_TEXT_SLOTS)
  })

  it('heroImages is empty array', async () => {
    const { tokens } = await runDesignAgent('TestApp', 'Build an app')
    expect(tokens.heroImages).toEqual([])
  })

  it('name is empty string', async () => {
    const { tokens } = await runDesignAgent('TestApp', 'Build an app')
    expect(tokens.name).toBe('')
  })
})
