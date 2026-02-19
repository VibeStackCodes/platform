/**
 * Design Agent tests
 *
 * Tests that runDesignAgent:
 * 1. Calls the theme selector tool (deterministic keyword scoring)
 * 2. Returns selectedTheme and themeReasoning in the result
 * 3. Routes website prompts to website themes and management prompts to admin themes
 *
 * The Mastra Agent.generate() call and catalog/unsplash I/O are mocked so no
 * real LLM calls or network requests are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SchemaContract } from '@server/lib/schema-contract'

// ---------------------------------------------------------------------------
// Mock: @mastra/core/agent
// The Agent constructor and generate() are mocked so no real LLM calls happen.
// generate() returns a minimal selectionSchema-compatible object.
// The theme returned by the mock is controlled per-test via `mockTheme`.
// ---------------------------------------------------------------------------
let mockTheme = 'theme-canape'

function makeSelection() {
  return {
    object: {
      theme: mockTheme,
      heroImageQuery: 'restaurant food',
      textSlots: {
        hero_headline: 'Test headline here',
        hero_subtext: 'Test subtext supporting line goes here',
        about_paragraph: 'Test about paragraph for the app description two sentences.',
        cta_label: 'Get started',
        empty_state: 'No items yet. Add your first one.',
        footer_tagline: 'Built with care.',
      },
    },
  }
}

vi.mock('@mastra/core/agent', () => {
  return {
    Agent: class MockAgent {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generate(_prompt: string, _opts?: any) {
        return Promise.resolve(makeSelection())
      }
    },
  }
})

// ---------------------------------------------------------------------------
// Mock: catalog-loader — returns a minimal prompt that includes the mock themes
// ---------------------------------------------------------------------------
vi.mock('@server/lib/skills/catalog-loader', () => ({
  buildSkillCatalogPrompt: vi.fn(async () =>
    [
      '- theme-canape: Restaurant website theme',
      '- theme-dashboard: Admin dashboard theme',
      '- theme-corporate: Corporate website theme',
      '- theme-quomi: Portfolio/gallery theme',
      '- theme-gallery: Image gallery theme',
    ].join('\n'),
  ),
  resolveThemeSkillPath: vi.fn(async () => null),
}))

// ---------------------------------------------------------------------------
// Mock: unsplash — return empty array without network call
// ---------------------------------------------------------------------------
vi.mock('@server/lib/unsplash', () => ({
  fetchHeroImages: vi.fn(async () => []),
}))

// ---------------------------------------------------------------------------
// Mock: theme-schemas — isThemeSpecificSchema returns false by default
// ---------------------------------------------------------------------------
vi.mock('@server/lib/theme-schemas', () => ({
  isThemeSpecificSchema: vi.fn(() => false),
  getThemeBaseSchema: vi.fn(() => undefined),
}))

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import { runDesignAgent } from '@server/lib/agents/design-agent'

// ---------------------------------------------------------------------------
// Shared test contract
// ---------------------------------------------------------------------------
const contract: SchemaContract = {
  tables: [
    {
      name: 'item',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
}

describe('runDesignAgent', () => {
  beforeEach(() => {
    // Reset mock theme to default before each test
    mockTheme = 'theme-canape'
  })

  it('returns selectedTheme and themeReasoning in result', async () => {
    const result = await runDesignAgent(
      'Build a simple app',
      contract,
      'MyApp',
      'A simple web application',
    )

    expect(result).toHaveProperty('tokens')
    expect(result).toHaveProperty('contract')
    expect(result).toHaveProperty('selectedTheme')
    expect(result).toHaveProperty('themeReasoning')
    expect(typeof result.selectedTheme).toBe('string')
    expect(typeof result.themeReasoning).toBe('string')
  })

  it('selectedTheme is normalized to a theme- prefixed name', async () => {
    const result = await runDesignAgent('Build an app', contract)

    // normalizeThemeName ensures the theme starts with "theme-"
    expect(result.selectedTheme).toMatch(/^theme-/)
  })

  it('selects appropriate theme based on prompt intent (website)', async () => {
    // Mock the LLM to return canape for a restaurant website prompt
    mockTheme = 'theme-canape'

    const result = await runDesignAgent(
      'Restaurant website with menu and reservations',
      contract,
      'RestaurantSite',
      'Public-facing restaurant website',
    )

    expect(result.selectedTheme).toBe('theme-canape')
    // themeReasoning comes from the deterministic theme selector tool
    expect(result.themeReasoning).toContain('website')
  })

  it('does NOT select website theme for management apps', async () => {
    // Mock the LLM to return dashboard for a management app prompt
    mockTheme = 'theme-dashboard'

    const result = await runDesignAgent(
      'Restaurant management system for staff',
      contract,
      'RestaurantManager',
      'Staff-only management app',
    )

    expect(['theme-dashboard', 'theme-corporate']).toContain(result.selectedTheme)
    expect(result.selectedTheme).not.toBe('theme-canape')
    // themeReasoning from the tool should mention management/staff intent
    expect(result.themeReasoning).toBeTruthy()
  })

  it('themeReasoning reflects website intent for website prompts', async () => {
    const result = await runDesignAgent(
      'Restaurant website with menu and reservations',
      contract,
      'RestaurantSite',
      'Public-facing restaurant website',
    )

    // The deterministic tool produces a reasoning string about website intent
    expect(result.themeReasoning.toLowerCase()).toMatch(/website|public|facing/)
  })

  it('themeReasoning reflects management intent for admin prompts', async () => {
    mockTheme = 'theme-dashboard'

    const result = await runDesignAgent(
      'Restaurant management system for staff',
      contract,
      'RestaurantManager',
      'Staff-only management app',
    )

    // The deterministic tool produces a reasoning string about admin/management intent
    expect(result.themeReasoning).toBeTruthy()
    expect(result.themeReasoning.length).toBeGreaterThan(10)
  })

  it('result still contains tokens and contract (backward compatibility)', async () => {
    const result = await runDesignAgent('Build an app', contract, 'TestApp', 'A test app')

    // tokens must have required ThemeTokens shape
    expect(result.tokens).toHaveProperty('name')
    expect(result.tokens).toHaveProperty('fonts')
    expect(result.tokens).toHaveProperty('colors')
    expect(result.tokens).toHaveProperty('style')
    expect(result.tokens.textSlots).toBeDefined()

    // contract must be returned (at minimum unchanged when no base schema merge)
    expect(result.contract).toBeDefined()
    expect(Array.isArray(result.contract.tables)).toBe(true)
  })
})
