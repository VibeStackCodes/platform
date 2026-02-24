import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DesignSystem } from './themed-code-engine'

// ============================================================================
// UI Kit — shadcn/ui components read from snapshot/ui-kit/ at runtime
// ============================================================================

const UI_KIT_DIR = join(import.meta.dirname, '../../snapshot/ui-kit')

/** Read all shadcn/ui component files from snapshot/ui-kit/ */
export function loadUIKit(): BlueprintFile[] {
  const files: BlueprintFile[] = []
  const entries = readdirSync(UI_KIT_DIR)
  for (const entry of entries) {
    const content = readFileSync(join(UI_KIT_DIR, entry), 'utf-8')
    const destPath = entry === 'utils.ts'
      ? 'src/lib/utils.ts'
      : `src/components/ui/${entry}`
    files.push({ path: destPath, content, layer: 1, isLLMSlot: false })
  }
  return files
}

export interface BlueprintFile {
  path: string
  content: string
  layer: number
  isLLMSlot: boolean
}

export interface AppBlueprint {
  meta: {
    appName: string
    appDescription: string
    tokens?: DesignSystem
  }
  fileTree: BlueprintFile[]
}
