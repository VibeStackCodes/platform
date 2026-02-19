// server/lib/skills/catalog-loader.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'glob'
import { getCapabilitySkillsPath } from '../capabilities/catalog'

export interface ThemeCatalogEntry {
  name: string
  description: string
  version: string
  tags: string[]
  /** Relative path from catalog root to the SKILL.md dir (e.g. "recipes") */
  catalogDir: string
}

/**
 * Parse a single SKILL.md file into a ThemeCatalogEntry.
 * Returns null if the file doesn't match capability skill format.
 */
function parseSkillMd(content: string, relativeDir: string): ThemeCatalogEntry | null {
  const fmMatch = content.match(/^---\n([\s\S]+?)\n---/)
  if (!fmMatch) return null

  const frontmatter = fmMatch[1]
  const name = frontmatter.match(/name:\s*(.+)/)?.[1]?.trim()
  if (!name) return null

  const description = frontmatter.match(/description:\s*>([\s\S]+?)(?=\n\w+:|$)/)?.[1]?.trim()?.replace(/\n\s+/g, ' ') ?? ''
  const version = frontmatter.match(/version:\s*(.+)/)?.[1]?.trim() ?? '1.0.0'
  const tags: string[] = []
  const tagsMatch = frontmatter.match(/tags:\n([\s\S]+)$/)
  if (tagsMatch) {
    for (const tagLine of tagsMatch[1].split('\n')) {
      const tag = tagLine.match(/-\s*(.+)/)?.[1]?.trim()
      if (tag) tags.push(tag)
    }
  }

  return { name, description, version, tags, catalogDir: relativeDir }
}

/**
 * Load all capability catalog entries from SKILL.md files.
 */
export async function loadThemeCatalog(): Promise<ThemeCatalogEntry[]> {
  const catalogPath = getCapabilitySkillsPath()
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
 * Build the capability catalog prompt for the design/polish agents.
 */
export async function buildSkillCatalogPrompt(): Promise<string> {
  const entries = await loadThemeCatalog()

  let prompt = 'AVAILABLE CAPABILITIES:\n'
  prompt += 'Select the best-matching capability visual identity for the generated app.\n\n'

  for (const entry of entries) {
    prompt += `- ${entry.name}: ${entry.description}\n`
  }

  return prompt
}

/**
 * Resolve SKILL.md file path for a given capability/theme name.
 */
export async function resolveThemeSkillPath(themeName: string): Promise<string | null> {
  const catalogPath = getCapabilitySkillsPath()
  const skillFiles = await glob(`**/${themeName}/SKILL.md`, { cwd: catalogPath })
  if (skillFiles.length === 0) return null
  return path.join(catalogPath, skillFiles[0])
}
