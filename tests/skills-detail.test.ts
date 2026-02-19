import { describe, it, expect } from 'vitest'
import { resolveThemeSkillPath } from '@server/lib/skills/catalog-loader'

describe('capability skill catalog detail', () => {
  it('resolves SKILL.md path for each core capability', async () => {
    const authPath = await resolveThemeSkillPath('auth')
    const blogPath = await resolveThemeSkillPath('blog')
    const recipesPath = await resolveThemeSkillPath('recipes')
    expect(authPath).toMatch(/server\/lib\/capabilities\/catalog\/auth\/SKILL\.md$/)
    expect(blogPath).toMatch(/server\/lib\/capabilities\/catalog\/blog\/SKILL\.md$/)
    expect(recipesPath).toMatch(/server\/lib\/capabilities\/catalog\/recipes\/SKILL\.md$/)
  })

  it('returns null for unknown skill names', async () => {
    const missing = await resolveThemeSkillPath('nonexistent-skill')
    expect(missing).toBeNull()
  })
})
