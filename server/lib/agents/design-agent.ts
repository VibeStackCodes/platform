import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import type { SchemaContract } from '../schema-contract'
import { type ThemeTokens, DEFAULT_TEXT_SLOTS } from '../themed-code-engine'
import { buildSkillCatalogPrompt, resolveThemeSkillPath } from '../skills/catalog-loader'
import { fetchHeroImages } from '../unsplash'
import { createAgentModelResolver } from './provider'
import { getThemeBaseSchema, isThemeSpecificSchema } from '../theme-schemas'
import { createThemeSelectorTool } from './theme-selector'
import { ThemeSelectorOutputSchema } from './schemas'

const textSlotsSchema = z.object({
  hero_headline: z.string().min(5).describe('One bold sentence that captures the app\'s purpose'),
  hero_subtext: z.string().min(5).describe('10-15 word supporting line below the headline'),
  about_paragraph: z.string().min(20).describe('2-3 sentence description of the app for the About page'),
  cta_label: z.string().min(2).max(30).describe('Call-to-action button text, 2-4 words'),
  empty_state: z.string().min(5).describe('Message shown when a list has no items yet'),
  footer_tagline: z.string().min(3).describe('Short footer text, under 10 words'),
})

const selectionSchema = z.object({
  theme: z.string().describe('Theme skill name, must start with theme-'),
  heroImageQuery: z.string().min(3).describe('Unsplash query optimized for this app context'),
  textSlots: textSlotsSchema,
})

const themeSelectorTool = createThemeSelectorTool()

const designAgent = new Agent({
  id: 'design-agent',
  name: 'Design Agent',
  model: createAgentModelResolver('orchestrator'),
  tools: { selectTheme: themeSelectorTool },
  instructions: `You are a design selector for VibeStack. Your job is to pick the BEST MATCHING theme from a catalog and fill text slots for the generated app.

THEME SELECTION RULES:
1. Call the selectTheme tool with the user's prompt and description to determine the appropriate theme type.
2. The tool will help you evaluate which theme best fits the intended use case (website vs admin vs hybrid).
3. Website themes (canape, quomi, gallery) are for public-facing apps — never use them for staff or management apps.
4. Admin themes (dashboard, corporate) are for staff/management apps — never use them for public websites.
5. Only merge the theme's base tables if the tool indicates shouldMergeTables is true.
6. After calling selectTheme, still pick the EXACT theme skill name from the skill catalog (starts with "theme-").
7. Never invent theme names that are not in the catalog list.

CATALOG SELECTION RULES:
1. Read the "Use when app mentions:" hint in each theme description — these are keyword triggers.
2. Match the app's DOMAIN first (luxury → premium themes, food → restaurant themes, blog → editorial themes).
3. Match the app's MOOD second (dark & moody, light & clean, colorful & playful).
4. Prefer themes whose description mentions the same domain keywords as the user prompt.
5. NEVER pick a blog/editorial theme for a product catalog, e-commerce, or management app.
6. NEVER pick a dark background theme unless the user explicitly wants dark mode or the domain calls for it (photography, nightlife, etc.).
7. For product catalogs, shops, or luxury apps: prefer themes with light backgrounds, elevated card styles, and premium typography.

TEXT SLOT RULES:
1. Write the hero_headline as a compelling, app-specific tagline — NOT generic.
2. Write the hero_subtext as a natural continuation of the headline.
3. Write the about_paragraph describing THIS specific app, not a template.
4. Pick a cta_label that fits the app domain: "Browse menu" for food, "View portfolio" for creative, "Get started" for SaaS.
5. Write the empty_state as an encouraging prompt to add the first item.
6. Write the footer_tagline as a short, memorable sign-off.
7. NEVER use placeholder text like "Lorem ipsum" or "Your app description here".

For the Unsplash hero image query: make it specific to the app's domain, not generic. Example: "luxury swiss watch on dark marble" not "watches".`,
  defaultOptions: { modelSettings: { temperature: 0.2 } },
})

function readBullet(markdown: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = markdown.match(new RegExp(`- \\*\\*${escaped}\\*\\*:\\s*(.+)`, 'i'))
  return match?.[1]?.trim() ?? null
}

function parseThemeTokens(name: string, markdown: string): ThemeTokens {
  const displayLine = readBullet(markdown, 'display') ?? 'Inter, sans-serif'
  const bodyLine = readBullet(markdown, 'body') ?? 'Inter, sans-serif'

  const display = displayLine.split(',')[0]?.trim() || 'Inter'
  const body = bodyLine.split(',')[0]?.trim() || 'Inter'

  const googleFontsUrl = readBullet(markdown, 'google-fonts-url')
    ?? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(display).replace(/%20/g, '+')}:wght@400;500;700&display=swap`

  const authPosture = (markdown.match(/^auth-posture:\s*(public|private|hybrid)$/m)?.[1] ?? 'hybrid') as ThemeTokens['authPosture']

  const cardStyle = (readBullet(markdown, 'card-style') ?? 'elevated') as ThemeTokens['style']['cardStyle']
  const navStyle = (readBullet(markdown, 'nav-style') ?? 'top-bar') as ThemeTokens['style']['navStyle']
  const heroLayout = (readBullet(markdown, 'hero-layout') ?? 'split') as ThemeTokens['style']['heroLayout']
  const spacing = (readBullet(markdown, 'spacing') ?? 'normal') as ThemeTokens['style']['spacing']
  const motion = (readBullet(markdown, 'motion') ?? 'subtle') as ThemeTokens['style']['motion']
  const imagery = (readBullet(markdown, 'imagery') ?? 'minimal') as ThemeTokens['style']['imagery']

  const heroQuery = readBullet(markdown, 'hero-query') ?? 'abstract modern design'

  return {
    name,
    fonts: {
      display,
      body,
      googleFontsUrl,
    },
    colors: {
      background: readBullet(markdown, 'background') ?? '#ffffff',
      foreground: readBullet(markdown, 'foreground') ?? '#111111',
      primary: readBullet(markdown, 'primary') ?? '#2b6cb0',
      primaryForeground: readBullet(markdown, 'primary-foreground') ?? '#ffffff',
      secondary: readBullet(markdown, 'secondary') ?? '#e5e7eb',
      accent: readBullet(markdown, 'accent') ?? '#f59e0b',
      muted: readBullet(markdown, 'muted') ?? '#f3f4f6',
      border: readBullet(markdown, 'border') ?? '#d1d5db',
    },
    style: {
      borderRadius: readBullet(markdown, 'border-radius') ?? '0.5rem',
      cardStyle,
      navStyle,
      heroLayout,
      spacing,
      motion,
      imagery,
    },
    authPosture,
    heroImages: [],
    heroQuery,
    textSlots: { ...DEFAULT_TEXT_SLOTS },
  }
}

function normalizeThemeName(raw: string, catalogPrompt: string): string {
  const trimmed = raw.trim()
  const candidate = trimmed.startsWith('theme-') ? trimmed : `theme-${trimmed}`
  if (catalogPrompt.includes(`- ${candidate}:`)) return candidate

  const firstTheme = catalogPrompt.match(/- (theme-[a-z0-9-]+):/i)?.[1]
  return firstTheme ?? 'theme-stratton'
}

export async function runDesignAgent(
  userPrompt: string,
  contract: SchemaContract,
  appName?: string,
  appDescription?: string,
): Promise<{
  tokens: ThemeTokens
  contract: SchemaContract
  selectedTheme: string
  themeReasoning: string
}> {
  // Step 1: Use the theme selector tool to determine website vs admin intent.
  // This is called directly (deterministic keyword scoring) — no extra LLM round-trip.
  if (!themeSelectorTool.execute) {
    throw new Error('Theme selector tool is missing execute function')
  }
  const selectorRaw = await themeSelectorTool.execute(
    { userPrompt, appDescription },
    {},
  )
  // execute() returns TSchemaOut | ValidationError — guard against validation failure
  if ('error' in selectorRaw && selectorRaw.error === true) {
    throw new Error(`Theme selector validation error: ${selectorRaw.message}`)
  }
  const selectorResult = ThemeSelectorOutputSchema.parse(selectorRaw)
  const { themeName: selectorThemeName, reasoning: themeReasoning } = selectorResult

  const catalogPrompt = await buildSkillCatalogPrompt()
  const entityNames = contract.tables.map((table) => table.name).join(', ')

  const prompt = `Select one best-fit theme for this app and fill all text slots.

App name: ${appName ?? 'My App'}
App description: ${appDescription ?? userPrompt}

User prompt:
${userPrompt}

Schema entities:
${entityNames}

Theme selector recommendation: "${selectorThemeName}" — ${themeReasoning}

${catalogPrompt}`

  const result = await designAgent.generate(prompt, {
    structuredOutput: { schema: selectionSchema },
    maxSteps: 1,
  })

  const selection = selectionSchema.parse(result.object ?? result)
  const themeName = normalizeThemeName(selection.theme, catalogPrompt)

  // Resolve SKILL.md from category folder structure
  let markdown: string
  const skillPath = await resolveThemeSkillPath(themeName)
  if (skillPath) {
    markdown = await readFile(skillPath, 'utf8')
  } else {
    // Fallback to first available theme
    const fallbackPath = await resolveThemeSkillPath('theme-stratton')
    markdown = fallbackPath
      ? await readFile(fallbackPath, 'utf8')
      : ''
  }

  const tokens = parseThemeTokens(themeName, markdown)
  tokens.heroImages = await fetchHeroImages(selection.heroImageQuery, 3)
  tokens.textSlots = selection.textSlots

  // If theme has a base schema (theme-specific like Canape), merge it with user contract
  let finalContract = contract
  if (isThemeSpecificSchema(themeName)) {
    const baseSchema = getThemeBaseSchema(themeName)
    if (baseSchema) {
      // Merge: keep base schema tables, add any extra user-requested tables
      const baseTableNames = new Set(baseSchema.tables.map((t) => t.name))
      const extraUserTables = contract.tables.filter((t) => !baseTableNames.has(t.name))
      finalContract = {
        ...baseSchema,
        tables: [...baseSchema.tables, ...extraUserTables],
      }
    }
  }

  return {
    tokens,
    contract: finalContract,
    selectedTheme: themeName,
    themeReasoning,
  }
}
