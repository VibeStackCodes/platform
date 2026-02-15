import type { Sandbox } from '@daytonaio/sdk'
import { LspLanguageId } from '@daytonaio/sdk'
import type { LspSymbol } from '@daytonaio/toolbox-api-client'

/**
 * LSP Client Wrapper
 *
 * Stateful wrapper around Daytona's LSP API for symbol search.
 * Lazy-initializes one LspServer per sandbox. All calls are wrapped
 * in try/catch — LSP failures are never fatal to the pipeline.
 */

// ============================================================================
// Types
// ============================================================================

/** LspServer type derived from sandbox.createLspServer() return type */
type LspServerInstance = Awaited<ReturnType<Sandbox['createLspServer']>>

/** LSP symbol kind numbers → human-readable strings */
const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
}

export interface SymbolEntry {
  name: string
  kind: string
  filePath: string
  startLine: number
  endLine: number
}

// ============================================================================
// Singleton LspServer Cache
// ============================================================================

const lspServers = new Map<string, LspServerInstance>()

/**
 * Get or create an LSP server for a sandbox.
 * Lazy-initializes and caches per sandbox ID.
 */
export async function getLspServer(sandbox: Sandbox): Promise<LspServerInstance> {
  const existing = lspServers.get(sandbox.id)
  if (existing) return existing

  const lsp = await sandbox.createLspServer(LspLanguageId.TYPESCRIPT, 'workspace')
  await lsp.start()
  lspServers.set(sandbox.id, lsp)
  console.log(`[lsp] Started TypeScript LSP for sandbox ${sandbox.id}`)
  return lsp
}

/**
 * Stop and remove the LSP server for a sandbox.
 */
export async function stopLspServer(sandboxId: string): Promise<void> {
  const lsp = lspServers.get(sandboxId)
  if (!lsp) return

  try {
    await lsp.stop()
    console.log(`[lsp] Stopped LSP for sandbox ${sandboxId}`)
  } catch (err) {
    console.warn(`[lsp] Failed to stop LSP for ${sandboxId}:`, err)
  } finally {
    lspServers.delete(sandboxId)
  }
}

// ============================================================================
// Symbol Operations
// ============================================================================

function toLspSymbolEntry(sym: LspSymbol): SymbolEntry {
  return {
    name: sym.name,
    kind: SYMBOL_KIND_NAMES[sym.kind] || `Unknown(${sym.kind})`,
    filePath: sym.location.uri,
    startLine: sym.location.range.start.line + 1, // Convert 0-based to 1-based
    endLine: sym.location.range.end.line + 1,
  }
}

/**
 * Get all symbols in a single file.
 */
export async function getFileSymbols(sandbox: Sandbox, filePath: string): Promise<SymbolEntry[]> {
  try {
    const lsp = await getLspServer(sandbox)
    await lsp.didOpen(filePath)
    const symbols = await lsp.documentSymbols(filePath)
    await lsp.didClose(filePath)
    return symbols.map(toLspSymbolEntry)
  } catch (err) {
    console.warn(`[lsp] getFileSymbols failed for ${filePath}:`, err)
    return []
  }
}

/**
 * Search for symbols matching a query across the entire sandbox.
 */
export async function searchSymbols(sandbox: Sandbox, query: string): Promise<SymbolEntry[]> {
  try {
    const lsp = await getLspServer(sandbox)
    const symbols = await lsp.sandboxSymbols(query)
    return symbols.map(toLspSymbolEntry)
  } catch (err) {
    console.warn(`[lsp] searchSymbols failed for "${query}":`, err)
    return []
  }
}

/**
 * Get symbols for multiple files in parallel.
 */
export async function getMultiFileSymbols(
  sandbox: Sandbox,
  paths: string[],
): Promise<Map<string, SymbolEntry[]>> {
  const result = new Map<string, SymbolEntry[]>()

  const entries = await Promise.all(
    paths.map(async (path) => {
      const symbols = await getFileSymbols(sandbox, path)
      return [path, symbols] as const
    }),
  )

  for (const [path, symbols] of entries) {
    result.set(path, symbols)
  }

  return result
}

/**
 * Format a symbol index into a human-readable string for AI context.
 */
export function formatSymbolIndex(symbolsByFile: Map<string, SymbolEntry[]>): string {
  const lines: string[] = []

  for (const [file, symbols] of symbolsByFile) {
    if (symbols.length === 0) continue
    lines.push(`\n## ${file}`)
    for (const sym of symbols) {
      lines.push(`  ${sym.kind} ${sym.name} (lines ${sym.startLine}-${sym.endLine})`)
    }
  }

  return lines.join('\n')
}
