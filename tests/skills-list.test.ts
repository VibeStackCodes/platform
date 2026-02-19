import { describe, it, expect } from 'vitest'
import { buildSkillCatalogPrompt, loadThemeCatalog } from '@server/lib/skills/catalog-loader'

describe('capability skill catalog list', () => {
  it('loads capability skills from capabilities catalog folders', async () => {
    const entries = await loadThemeCatalog()
    const names = entries.map((entry) => entry.name)
    expect(names).toContain('auth')
    expect(names).toContain('public-website')
    expect(names).toContain('blog')
    expect(names).toContain('recipes')
    expect(names).toContain('portfolio')
  })

  it('builds catalog prompt from capability SKILL.md descriptions', async () => {
    const prompt = await buildSkillCatalogPrompt()
    expect(prompt).toContain('AVAILABLE CAPABILITIES')
    expect(prompt).toContain('- recipes:')
    expect(prompt).toContain('- blog:')
  })
})
