// server/lib/skills/catalog-loader.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'glob'

/**
 * Loads all SKILL.md files from the catalog directory and 
 * extracts their frontmatter/descriptions for the LLM.
 */
export async function buildSkillCatalogPrompt(): Promise<string> {
  const catalogPath = path.join(process.cwd(), 'server/lib/skills/catalog')
  const skillFiles = await glob('**/SKILL.md', { cwd: catalogPath })

  let prompt = 'AVAILABLE APP CAPABILITIES (SKILLS):\n'
  prompt += 'Select which skills to include in the generated app based on the user request.\n\n'

  for (const file of skillFiles) {
    const fullPath = path.join(catalogPath, file)
    const content = await fs.readFile(fullPath, 'utf-8')

    // Simple YAML frontmatter extractor
    const match = content.match(/^---\n([\s\S]+?)\n---/)
    if (match) {
      const frontmatter = match[1]
      const name = frontmatter.match(/name:\s*(.+)/)?.[1]
      const description = frontmatter.match(/description:\s*>([\s\S]+?)(?=\w+:|$)/)?.[1]?.trim()

      if (name && description) {
        prompt += `- ${name}: ${description.replace(/\n\s+/g, ' ')}\n`
      }
    }
  }

  return prompt
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
