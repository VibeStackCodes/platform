import { describe, it, expect } from 'vitest'
import {
  checkManifest,
  checkScaffold,
} from '@server/lib/agents/validation'

describe('validation gate', () => {
  describe('checkManifest', () => {
    it('passes when all blueprint files exist', async () => {
      const blueprint = {
        fileTree: [
          { path: 'src/main.tsx' },
          { path: 'src/App.tsx' },
          { path: 'package.json' },
        ],
      }

      const mockListFiles = async () => ({
        files: ['src/main.tsx', 'src/App.tsx', 'package.json', 'README.md'],
        count: 4,
      })

      const result = await checkManifest(blueprint, mockListFiles)

      expect(result.passed).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('fails when blueprint files are missing', async () => {
      const blueprint = {
        fileTree: [
          { path: 'src/main.tsx' },
          { path: 'src/App.tsx' },
          { path: 'package.json' },
          { path: 'src/lib/utils.ts' },
        ],
      }

      const mockListFiles = async () => ({
        files: ['src/main.tsx', 'src/App.tsx', 'README.md'],
        count: 3,
      })

      const result = await checkManifest(blueprint, mockListFiles)

      expect(result.passed).toBe(false)
      expect(result.errors).toHaveLength(2)
      expect(result.errors).toContain('Missing file: package.json')
      expect(result.errors).toContain('Missing file: src/lib/utils.ts')
    })
  })

  describe('checkScaffold', () => {
    it('passes clean files', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `import { useState } from 'react'\n\nexport function App() {\n  return <div>Hello</div>\n}`,
        },
        {
          path: 'src/main.tsx',
          content: `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport { App } from './App'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />)`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('detects scaffold/placeholder strings', () => {
      const files = [
        {
          path: 'src/App.tsx',
          content: `export function App() {\n  return <div>Building your app</div>\n}`,
        },
        {
          path: 'src/config.ts',
          content: `export const SUPABASE_URL = 'https://your_supabase_project.supabase.co'`,
        },
        {
          path: 'src/lib/api.ts',
          content: `// TODO: implement API client\nexport function fetchData() {}`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some((e) => e.includes('Building your app'))).toBe(true)
      expect(result.errors.some((e) => e.includes('your_supabase_project'))).toBe(true)
      expect(result.errors.some((e) => e.includes('TODO:'))).toBe(true)
    })

    it('skips components/ui/ files', () => {
      const files = [
        {
          path: 'src/components/ui/input.tsx',
          content: `export const Input = (props: { placeholder?: string }) => <input {...props} />`,
        },
        {
          path: 'src/components/ui/command.tsx',
          content: `// TODO: refactor this\nBuilding your app`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('detects require() in ESM files', () => {
      const files = [
        {
          path: 'src/config.ts',
          content: `const dotenv = require('dotenv')\ndotenv.config()`,
        },
        {
          path: 'src/utils.tsx',
          content: `import React from 'react'\nconst fs = require('fs')`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(2)
      expect(result.errors.some((e) => e.includes('require(') && e.includes('config.ts'))).toBe(
        true,
      )
      expect(result.errors.some((e) => e.includes('require(') && e.includes('utils.tsx'))).toBe(
        true,
      )
    })

    it('skips .env files', () => {
      const files = [
        {
          path: '.env',
          content: `VITE_SUPABASE_URL=your_supabase_project\nVITE_API_KEY=placeholder`,
        },
        {
          path: '.env.local',
          content: `# TODO: Add production keys`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('only checks source files', () => {
      const files = [
        {
          path: 'README.md',
          content: `# TODO: Update this documentation\nBuilding your app is easy!`,
        },
        {
          path: 'package-lock.json',
          content: `{"placeholder": "value"}`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('detects hardcoded localhost URLs', () => {
      const files = [
        {
          path: 'src/config.ts',
          content: `export const API_URL = 'http://localhost:3000/api'`,
        },
        {
          path: 'src/App.tsx',
          content: `fetch('http://localhost:5173/data.json')`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(false)
      expect(result.errors.some((e) => e.includes('localhost:3000'))).toBe(true)
      expect(result.errors.some((e) => e.includes('localhost:5173'))).toBe(true)
    })

    it('detects __PLACEHOLDER__ markers', () => {
      const files = [
        {
          path: 'src/types.ts',
          content: `export interface User {\n  id: string\n  name: __PLACEHOLDER__\n}`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(false)
      expect(result.errors.some((e) => e.includes('__PLACEHOLDER__'))).toBe(true)
    })

    it('detects FIXME comments', () => {
      const files = [
        {
          path: 'src/utils.ts',
          content: `// FIXME: This function needs optimization\nexport function slowFunction() {}`,
        },
      ]

      const result = checkScaffold(files)

      expect(result.passed).toBe(false)
      expect(result.errors.some((e) => e.includes('FIXME:'))).toBe(true)
    })
  })
})
