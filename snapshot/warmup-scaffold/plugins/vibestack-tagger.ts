import MagicString from 'magic-string'
import type { Plugin } from 'vite'

/**
 * VibeStack Tagger — injects data-vs-id attributes on JSX elements.
 *
 * This runs at dev time only (apply: 'serve') and BEFORE @vitejs/plugin-react
 * (enforce: 'pre') so line numbers are still accurate.
 *
 * Result: <button data-vs-id="src/components/Form.tsx:42" className="bg-green-500">
 */
export function vibestackTagger(): Plugin {
  return {
    name: 'vibestack-tagger',
    apply: 'serve',           // dev only — stripped in production builds
    enforce: 'pre',           // BEFORE @vitejs/plugin-react (preserves line numbers)
    transform(code, id) {
      // Only process JSX/TSX files in src/, skip node_modules
      if (!/\/src\/.*\.[jt]sx$/.test(id) || id.includes('node_modules')) return null

      const s = new MagicString(code)

      // Calculate relative path from project root
      const srcIndex = id.indexOf('/src/')
      const relPath = srcIndex >= 0 ? id.slice(srcIndex + 1) : id

      // Match JSX opening tags: both HTML elements and components
      // Matches: <div, <Button, <my-component
      // Does NOT match: </div, <!-- comments
      const jsxOpenTag = /<([A-Z][A-Za-z0-9]*|[a-z][a-z0-9-]*)(?=[\s>\/])/g
      let match: RegExpExecArray | null

      while ((match = jsxOpenTag.exec(code)) !== null) {
        // Skip if this tag already has data-vs-id
        const afterTag = code.slice(match.index, match.index + 200)
        if (afterTag.includes('data-vs-id=')) continue

        // Skip fragment shorthand (<> or </>)
        if (match[1] === '') continue

        // Calculate line number (1-indexed)
        const line = code.slice(0, match.index).split('\n').length

        // Insert data-vs-id attribute after the tag name
        const insertPos = match.index + match[0].length
        s.appendLeft(insertPos, ` data-vs-id="${relPath}:${line}"`)
      }

      if (!s.hasChanged()) return null

      return {
        code: s.toString(),
        map: s.generateMap({ hires: true }),
      }
    },
  }
}
