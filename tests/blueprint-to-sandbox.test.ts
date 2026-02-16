import { blueprintToSandbox } from '@server/lib/blueprint-to-sandbox'
import type { AppBlueprint } from '@server/lib/app-blueprint'
import { describe, expect, it, vi } from 'vitest'

describe('blueprintToSandbox', () => {
  const mockUploadFile = vi.fn().mockResolvedValue(undefined)
  const mockSandbox = {
    fs: { uploadFile: mockUploadFile },
  }

  const blueprint: AppBlueprint = {
    meta: { appName: 'Test', appDescription: '', designPreferences: { style: 'modern', primaryColor: '#000', fontFamily: 'Inter' } },
    features: { auth: false, entities: ['item'] },
    contract: { tables: [] },
    fileTree: [
      { path: 'server/db/schema.ts', content: 'schema content', layer: 1, isLLMSlot: false },
      { path: 'src/routes/_authenticated/item.tsx', content: 'page skeleton', layer: 4, isLLMSlot: true },
      { path: 'src/main.tsx', content: 'main content', layer: 5, isLLMSlot: false },
    ],
  }

  it('writes all files to sandbox', async () => {
    mockUploadFile.mockClear()
    const result = await blueprintToSandbox(blueprint, mockSandbox as any)
    expect(mockUploadFile).toHaveBeenCalledTimes(3)
    expect(result.filesWritten).toBe(3)
  })

  it('writes files in layer order (1 before 4 before 5)', async () => {
    mockUploadFile.mockClear()
    await blueprintToSandbox(blueprint, mockSandbox as any)
    const paths = mockUploadFile.mock.calls.map((call: unknown[]) => (call as [Buffer, string])[1])
    const schemaIdx = paths.findIndex((p: string) => p.includes('schema.ts'))
    const pageIdx = paths.findIndex((p: string) => p.includes('item.tsx'))
    const mainIdx = paths.findIndex((p: string) => p.includes('main.tsx'))
    expect(schemaIdx).toBeLessThan(pageIdx)
    expect(pageIdx).toBeLessThan(mainIdx)
  })

  it('prefixes paths with /workspace/', async () => {
    mockUploadFile.mockClear()
    await blueprintToSandbox(blueprint, mockSandbox as any)
    const firstPath = mockUploadFile.mock.calls[0][1]
    expect(firstPath).toMatch(/^\/workspace\//)
  })
})
