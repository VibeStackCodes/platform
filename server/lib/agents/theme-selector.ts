import { createTool } from '@mastra/core/tools'
import { getThemeMetadata } from './theme-metadata'
import { ThemeSelectorInputSchema, ThemeSelectorOutputSchema } from './schemas'

/**
 * Website-intent signals: words that indicate the user wants a public-facing site,
 * not an internal management/staff app.
 */
const WEBSITE_SIGNALS = [
  'website',
  'landing page',
  'public-facing',
  'public facing',
  'homepage',
  'home page',
  'marketing site',
  'blog',
  'portfolio',
  'showcase',
]

/**
 * Admin/management-intent signals: words that indicate an internal or staff-only app.
 */
const ADMIN_SIGNALS = [
  'management system',
  'management app',
  'admin',
  'dashboard',
  'staff',
  'internal',
  'back office',
  'backoffice',
  'crm',
  'erp',
  'inventory',
  'operations',
]

function detectIntent(
  userPrompt: string,
  appDescription?: string,
): 'website' | 'admin' {
  const text = [userPrompt, appDescription ?? ''].join(' ').toLowerCase()

  const adminScore = ADMIN_SIGNALS.filter(s => text.includes(s)).length
  const websiteScore = WEBSITE_SIGNALS.filter(s => text.includes(s)).length

  // Website is the default — most user-facing apps (recipe, todo, shop, etc.) should get
  // public-facing themes. Only route to admin when explicit staff/management signals present.
  return adminScore > websiteScore ? 'admin' : 'website'
}

/**
 * Deterministically select a theme based on prompt intent.
 *
 * This tool is called by the Design Agent LLM to structure its theme choice.
 * The execute() function performs keyword-based classification so the tool
 * works without an extra LLM round-trip. The agent's system prompt instructs
 * it to call this tool and relay the result.
 */
export function createThemeSelectorTool() {
  return createTool({
    id: 'select-theme',
    description:
      'Intelligently select the best theme for the user app based on prompt intent. ' +
      'Considers whether the app is website-focused, admin-focused, or hybrid. ' +
      'Returns the selected theme with reasoning and whether to merge base schemas.',
    inputSchema: ThemeSelectorInputSchema,
    outputSchema: ThemeSelectorOutputSchema,
    execute: async ({ userPrompt, appDescription }) => {
      const intent = detectIntent(userPrompt, appDescription)
      const catalog = getThemeMetadata()

      if (intent === 'website') {
        // Find the first website theme that is suitable for the prompt keywords
        const websiteThemes = catalog.filter(t => t.designType === 'website')

        // Prefer canape for food/restaurant prompts
        const lowerPrompt = [userPrompt, appDescription ?? ''].join(' ').toLowerCase()
        const isFoodRelated =
          lowerPrompt.includes('restaurant') ||
          lowerPrompt.includes('cafe') ||
          lowerPrompt.includes('bakery') ||
          lowerPrompt.includes('menu') ||
          lowerPrompt.includes('food')

        const selected =
          isFoodRelated
            ? (websiteThemes.find(t => t.name === 'canape') ?? websiteThemes[0])
            : websiteThemes[0]

        return {
          themeName: selected?.name ?? 'canape',
          reasoning: `Website-focused prompt detected. Selected '${selected?.name ?? 'canape'}' (${selected?.description ?? ''}) as a public-facing template suitable for this use case.`,
          shouldMergeTables: true,
        }
      }

      // Admin / management intent
      const adminTheme = catalog.find(t => t.designType === 'admin') ?? catalog[0]
      return {
        themeName: adminTheme?.name ?? 'dashboard',
        reasoning: `Management/staff app detected. Selected '${adminTheme?.name ?? 'dashboard'}' (${adminTheme?.description ?? ''}) — an admin template. Website base tables will NOT be merged.`,
        shouldMergeTables: false,
      }
    },
  })
}
