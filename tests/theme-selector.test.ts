import { describe, it, expect } from 'vitest'
import { createThemeSelectorTool } from '@server/lib/agents/theme-selector'

describe('theme-selector tool', () => {
  it('returns tool definition with inputSchema and outputSchema', () => {
    const tool = createThemeSelectorTool()

    expect(tool.id).toBe('select-theme')
    expect(tool.inputSchema).toBeDefined()
    expect(tool.outputSchema).toBeDefined()
  })

  it('executes theme selection based on prompt', async () => {
    const tool = createThemeSelectorTool()

    const result = await tool.execute({
      userPrompt: 'Restaurant management system for staff to manage orders and reservations',
      appDescription: 'Internal app for restaurant staff',
    })

    expect(result.themeName).toBeTruthy()
    expect(result.reasoning).toBeTruthy()
    expect(result.themeName).toBe('dashboard')
    expect(result.shouldMergeTables).toBe(false)
  })

  it('selects website theme for website prompts', async () => {
    const tool = createThemeSelectorTool()

    const result = await tool.execute({
      userPrompt: 'Restaurant website with menu and reservations',
      appDescription: 'Public-facing restaurant website',
    })

    expect(result.themeName).toBe('canape')
    expect(result.shouldMergeTables).toBe(true)
  })

  it('avoids selecting website theme for admin prompts', async () => {
    const tool = createThemeSelectorTool()

    const result = await tool.execute({
      userPrompt: 'Restaurant management system',
      appDescription: 'Staff-only management app',
    })

    expect(['dashboard', 'corporate']).toContain(result.themeName)
    expect(result.themeName).not.toBe('canape')
  })
})
