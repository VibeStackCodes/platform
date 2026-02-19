// server/lib/skills/catalog-loader.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'glob'

export interface ThemeCatalogEntry {
  name: string
  description: string
  category: string
  heroQuery: string
  slotNames: string[]
  /** Relative path from catalog root to the SKILL.md dir (e.g. "blog-editorial/theme-inkwell") */
  catalogDir: string
}

/**
 * Parse a single SKILL.md file into a ThemeCatalogEntry.
 * Returns null if the file doesn't match theme format.
 */
function parseSkillMd(content: string, relativeDir: string): ThemeCatalogEntry | null {
  const fmMatch = content.match(/^---\n([\s\S]+?)\n---/)
  if (!fmMatch) return null

  const frontmatter = fmMatch[1]
  const name = frontmatter.match(/name:\s*(.+)/)?.[1]?.trim()
  if (!name || !name.startsWith('theme-')) return null

  const description = frontmatter.match(/description:\s*>([\s\S]+?)(?=\w+:|$)/)?.[1]?.trim()?.replace(/\n\s+/g, ' ') ?? ''
  const category = frontmatter.match(/category:\s*(.+)/)?.[1]?.trim() ?? 'general'

  // Parse hero-query bullet
  const heroQueryMatch = content.match(/- \*\*hero-query\*\*:\s*(.+)/i)
  const heroQuery = heroQueryMatch?.[1]?.trim() ?? 'abstract modern design'

  // Parse ## Slots section — extract slot names
  const slotNames: string[] = []
  const slotsSection = content.match(/## Slots\n([\s\S]+?)(?=\n##|\n$|$)/)
  if (slotsSection) {
    const slotLines = slotsSection[1].matchAll(/- \*\*(\w+)\*\*/g)
    for (const match of slotLines) {
      slotNames.push(match[1])
    }
  }

  return { name, description, category, heroQuery, slotNames, catalogDir: relativeDir }
}

/**
 * Load all theme catalog entries from SKILL.md files.
 */
export async function loadThemeCatalog(): Promise<ThemeCatalogEntry[]> {
  const catalogPath = path.join(process.cwd(), 'server/lib/skills/catalog')
  const skillFiles = await glob('**/SKILL.md', { cwd: catalogPath })
  const entries: ThemeCatalogEntry[] = []

  for (const file of skillFiles) {
    const fullPath = path.join(catalogPath, file)
    const content = await fs.readFile(fullPath, 'utf-8')
    const relativeDir = path.dirname(file)
    const entry = parseSkillMd(content, relativeDir)
    if (entry) entries.push(entry)
  }

  return entries
}

/**
 * Build the theme catalog prompt for the design agent LLM.
 * With 12 curated themes, this is ~500 tokens vs ~10K with 227 themes.
 */
export async function buildSkillCatalogPrompt(): Promise<string> {
  const entries = await loadThemeCatalog()

  let prompt = 'AVAILABLE THEMES:\n'
  prompt += 'Select the best-matching theme for the generated app.\n\n'

  for (const entry of entries) {
    prompt += `- ${entry.name}: ${entry.description}\n`
  }

  return prompt
}

/**
 * Resolve SKILL.md file path for a given theme name.
 * Searches all category subdirectories.
 */
export async function resolveThemeSkillPath(themeName: string): Promise<string | null> {
  const catalogPath = path.join(process.cwd(), 'server/lib/skills/catalog')
  const skillFiles = await glob(`**/${themeName}/SKILL.md`, { cwd: catalogPath })
  if (skillFiles.length === 0) return null
  return path.join(catalogPath, skillFiles[0])
}

/**
 * Load the TypeScript implementation of a skill.
 */
export async function loadSkillImplementation(name: string) {
  try {
    const skillPath = path.join(process.cwd(), `server/lib/skills/catalog/${name}/index.ts`)
    const { skill } = await import(skillPath)
    return skill
  } catch (e) {
    console.error(`[catalog-loader] Failed to load skill ${name}:`, e)
    return null
  }
}
