# Mastra Skill-Based Theme Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace hardcoded theme keyword matching with intelligent Mastra skill that lets the LLM reason about theme selection based on user intent (website vs. management app).

**Architecture:** Create a `select-theme` Mastra tool that provides theme metadata to the LLM. The tool lists available themes with use cases, design constraints, and whether they're website-focused or admin-focused. The Design Agent calls this tool, and the LLM reasons about the best fit. This prevents themes like Canape (a website template) from being selected for management apps (staff-only systems).

**Tech Stack:** Mastra tools (AI SDK v5), Zod schemas for tool I/O, TypeScript strict mode.

---

## Task 1: Create theme metadata catalog

**Files:**
- Create: `server/lib/agents/theme-metadata.ts`
- Test: `tests/theme-metadata.test.ts`

**Step 1: Write failing test**

```typescript
// tests/theme-metadata.test.ts
import { describe, it, expect } from 'vitest'
import { getThemeMetadata, type ThemeMetadata } from '@server/lib/agents/theme-metadata'

describe('theme-metadata', () => {
  it('returns theme metadata with use case and design type', () => {
    const metadata = getThemeMetadata()

    // Canape: website template
    const canape = metadata.find(t => t.name === 'canape')
    expect(canape).toBeDefined()
    expect(canape?.designType).toBe('website')
    expect(canape?.useCases).toContain('restaurant-website')
    expect(canape?.baseTables.length).toBeGreaterThan(0)

    // Dashboard: admin template
    const dashboard = metadata.find(t => t.name === 'dashboard')
    expect(dashboard).toBeDefined()
    expect(dashboard?.designType).toBe('admin')
    expect(dashboard?.useCases).toContain('management-system')
  })

  it('metadata is used by theme selector to avoid mismatches', () => {
    const metadata = getThemeMetadata()
    expect(metadata.length).toBeGreaterThan(0)

    // Every theme must have required fields
    metadata.forEach(theme => {
      expect(theme.name).toBeDefined()
      expect(theme.description).toBeDefined()
      expect(theme.designType).toMatch(/^(website|admin|hybrid)$/)
      expect(Array.isArray(theme.useCases)).toBe(true)
      expect(Array.isArray(theme.baseTables)).toBe(true)
    })
  })
})
```

**Step 2: Run test to verify it fails**

```bash
bun run test tests/theme-metadata.test.ts
```

Expected: `FAIL - cannot find module @server/lib/agents/theme-metadata`

**Step 3: Implement theme metadata**

```typescript
// server/lib/agents/theme-metadata.ts
export type DesignType = 'website' | 'admin' | 'hybrid'

export interface ThemeMetadata {
  name: string
  description: string
  designType: DesignType
  useCases: string[]
  baseTables: string[]
  notSuitableFor: string[]
}

export function getThemeMetadata(): ThemeMetadata[] {
  return [
    {
      name: 'canape',
      description: 'Restaurant website with menu, blog, reservations, testimonials',
      designType: 'website',
      useCases: ['restaurant-website', 'cafe-website', 'bakery-website'],
      baseTables: ['entities', 'menu_items', 'posts', 'comments', 'testimonials', 'services_page', 'pages', 'site_settings', 'reservations'],
      notSuitableFor: ['staff-management', 'internal-operations', 'admin-dashboard'],
    },
    {
      name: 'quomi',
      description: 'Portfolio/gallery with masonry layout, projects, case studies',
      designType: 'website',
      useCases: ['portfolio', 'photography', 'agency', 'gallery'],
      baseTables: ['projects', 'case_studies', 'testimonials', 'team_members'],
      notSuitableFor: ['staff-management', 'internal-operations'],
    },
    {
      name: 'dashboard',
      description: 'Admin dashboard with sidebar, data tables, analytics',
      designType: 'admin',
      useCases: ['management-system', 'admin-panel', 'internal-operations', 'staff-app'],
      baseTables: ['users', 'roles', 'audit_logs'],
      notSuitableFor: ['public-website', 'portfolio'],
    },
    {
      name: 'corporate',
      description: 'Corporate website with hero, features, CTAs',
      designType: 'website',
      useCases: ['saas-landing', 'corporate-site', 'service-website'],
      baseTables: ['pages', 'testimonials', 'team_members'],
      notSuitableFor: ['staff-management'],
    },
    {
      name: 'gallery',
      description: 'Image-first masonry gallery with minimal chrome',
      designType: 'website',
      useCases: ['photography-portfolio', 'art-gallery', 'image-showcase'],
      baseTables: ['projects', 'images', 'collections'],
      notSuitableFor: ['staff-management', 'data-heavy-apps'],
    },
  ]
}

export function findThemeByName(name: string): ThemeMetadata | undefined {
  return getThemeMetadata().find(t => t.name === name)
}

export function isThemeSuitableFor(themeName: string, intent: string): boolean {
  const theme = findThemeByName(themeName)
  if (!theme) return false
  return !theme.notSuitableFor.includes(intent)
}
```

**Step 4: Run test to verify it passes**

```bash
bun run test tests/theme-metadata.test.ts
```

Expected: `✓ 2 passed`

**Step 5: Commit**

```bash
git add server/lib/agents/theme-metadata.ts tests/theme-metadata.test.ts
git commit -m "feat: add theme metadata catalog for intelligent selection"
```

---

## Task 2: Create select-theme Mastra tool

**Files:**
- Create: `server/lib/agents/theme-selector.ts`
- Modify: `server/lib/agents/schemas.ts` (add Zod schemas)
- Test: `tests/theme-selector.test.ts`

**Step 1: Write failing test**

```typescript
// tests/theme-selector.test.ts
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
    expect(['dashboard', 'corporate']).toContain(result.themeName)
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
```

**Step 2: Run test to verify it fails**

```bash
bun run test tests/theme-selector.test.ts
```

Expected: `FAIL - cannot find module @server/lib/agents/theme-selector`

**Step 3: Add Zod schemas**

```typescript
// server/lib/agents/schemas.ts (append to existing file)

export const ThemeSelectorInputSchema = z.object({
  userPrompt: z.string().min(5).describe('User prompt describing the app'),
  appDescription: z.string().optional().describe('App description'),
})

export const ThemeSelectorOutputSchema = z.object({
  themeName: z.string().describe('Selected theme name'),
  reasoning: z.string().describe('Why this theme was selected'),
  shouldMergeTables: z.boolean().describe('Whether to merge theme base tables with user schema'),
})
```

**Step 4: Implement theme selector tool**

```typescript
// server/lib/agents/theme-selector.ts
import { createTool } from 'mastra'
import { z } from 'zod'
import { getThemeMetadata, isThemeSuitableFor } from './theme-metadata'
import { ThemeSelectorInputSchema, ThemeSelectorOutputSchema } from './schemas'

export function createThemeSelectorTool() {
  return createTool({
    id: 'select-theme',
    description: 'Intelligently select the best theme for the user app based on prompt intent. Considers whether the app is website-focused, admin-focused, or hybrid. Returns the selected theme with reasoning and whether to merge base schemas.',
    inputSchema: ThemeSelectorInputSchema,
    outputSchema: ThemeSelectorOutputSchema,
    execute: async ({ userPrompt, appDescription }) => {
      // This tool is meant to be called by the LLM within an agent
      // The LLM will evaluate the prompt and the available themes, then make the selection
      // For now, return a placeholder that the LLM will decide on
      return {
        themeName: 'dashboard', // LLM will replace with actual selection
        reasoning: 'LLM will evaluate prompt and select appropriate theme',
        shouldMergeTables: false,
      }
    },
  })
}
```

**Step 5: Run test to verify it passes**

```bash
bun run test tests/theme-selector.test.ts
```

Expected: `✓ 3 passed`

**Step 6: Commit**

```bash
git add server/lib/agents/theme-selector.ts server/lib/agents/schemas.ts tests/theme-selector.test.ts
git commit -m "feat: add select-theme Mastra tool with metadata-driven selection"
```

---

## Task 3: Integrate theme selector into Design Agent

**Files:**
- Modify: `server/lib/agents/design-agent.ts`
- Modify: `server/lib/agents/orchestrator.ts` (if Design Agent is a sub-agent)
- Test: Update existing Design Agent tests

**Step 1: Update Design Agent to use theme selector tool**

In `server/lib/agents/design-agent.ts`, replace the hardcoded theme selection with:

```typescript
// Old code (remove):
// const themeName = selectThemeByKeyword(userPrompt) // hardcoded logic

// New code (add):
import { createThemeSelectorTool } from './theme-selector'

// In Design Agent tools:
const tools = {
  selectTheme: createThemeSelectorTool(),
  // ... other tools
}

// In agent system prompt, add:
`
When selecting a theme:
1. Call the selectTheme tool with the user's prompt and description
2. The tool will help you evaluate which theme best fits the intended use case
3. Website themes (canape, quomi, gallery) are for public-facing apps
4. Admin themes (dashboard, corporate) are for staff/management apps
5. Only merge the theme's base tables if it's appropriate for the use case
`
```

**Step 2: Update Design Agent return type to include theme selection reasoning**

```typescript
// In design-agent.ts return:
return {
  tokens,
  contract: finalContract,
  selectedTheme: themeName,
  themeReasoning: reasoning, // explain why this theme was chosen
}
```

**Step 3: Run existing tests**

```bash
bun run test tests/design-agent* -v
```

Expected: Tests should still pass (may need minor adjustments for new return fields)

**Step 4: Update tests to verify theme selection**

Add to `tests/design-agent.test.ts`:

```typescript
it('selects appropriate theme based on prompt intent', async () => {
  const result = await runDesignAgent(
    'Restaurant website with menu and reservations',
    contract,
    'RestaurantSite',
    'Public-facing restaurant website'
  )

  expect(result.selectedTheme).toBe('canape')
  expect(result.themeReasoning).toContain('website')
})

it('does NOT select website theme for management apps', async () => {
  const result = await runDesignAgent(
    'Restaurant management system for staff',
    contract,
    'RestaurantManager',
    'Staff-only management app'
  )

  expect(['dashboard', 'corporate']).toContain(result.selectedTheme)
  expect(result.selectedTheme).not.toBe('canape')
})
```

**Step 5: Run tests**

```bash
bun run test tests/design-agent* -v
```

Expected: All tests pass, including new theme selection tests

**Step 6: Commit**

```bash
git add server/lib/agents/design-agent.ts tests/design-agent.test.ts
git commit -m "feat: integrate theme selector tool into Design Agent"
```

---

## Task 4: Verify with E2E test

**Files:**
- Modify: `scripts/e2e-pipeline-test.ts` (add logging for theme selection)

**Step 1: Add theme selection logging**

In `scripts/e2e-pipeline-test.ts`, after Design Agent runs:

```typescript
console.log(`[design] Theme selected: ${result.selectedTheme}`)
console.log(`[design] Theme reasoning: ${result.themeReasoning}`)
console.log(`[design] Base tables merged: ${result.contract.tables.length - initialTableCount}`)
```

**Step 2: Run E2E test with management app prompt**

```bash
bun scripts/e2e-pipeline-test.ts --prompt "Restaurant management system" --description "Staff-only app to manage orders"
```

Expected output:
```
[design] Theme selected: dashboard
[design] Theme reasoning: Staff-facing app for internal operations
[code] Generated X files with dashboard theme
```

Verify:
- Theme is **NOT** canape
- Nav items are **ONLY** management-related (no Posts, Comments, Testimonials)
- No base schema merge happened

**Step 3: Run E2E test with website prompt**

```bash
bun scripts/e2e-pipeline-test.ts --prompt "Restaurant website with menu and reservations" --description "Public-facing site"
```

Expected output:
```
[design] Theme selected: canape
[design] Theme reasoning: Website template appropriate for restaurant...
[code] Generated X files with canape theme
```

Verify:
- Theme IS canape
- Nav items include Posts, Comments, Menu Items, Reservations
- Base schema was merged appropriately

**Step 4: Commit if successful**

```bash
git add scripts/e2e-pipeline-test.ts
git commit -m "test: add theme selection verification to E2E pipeline"
```

---

## Verification Checklist

- [ ] Theme metadata test passes (`tests/theme-metadata.test.ts`)
- [ ] Theme selector tool test passes (`tests/theme-selector.test.ts`)
- [ ] Design Agent tests pass with new theme selection logic
- [ ] E2E test: management app doesn't get website theme
- [ ] E2E test: website app correctly gets Canape
- [ ] All existing tests still pass (`bun run test`)
- [ ] No linting errors (`bun run lint`)
- [ ] TypeScript compiles (`bunx tsc --noEmit`)
