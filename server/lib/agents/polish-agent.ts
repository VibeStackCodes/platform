import { Agent } from '@mastra/core/agent'
import { LocalFilesystem, LocalSandbox, Workspace, WORKSPACE_TOOLS, type WorkspaceToolsConfig } from '@mastra/core/workspace'
import type { AssemblyResult } from '../capabilities/assembler'
import type { ThemeTokens } from '../themed-code-engine'
import type { AppBlueprint, BlueprintFile } from '../app-blueprint'
import { createAgentModelResolver } from './provider'
import { getCapabilitySkillsPath } from '../capabilities/catalog'
import { getSandbox, runCommand, uploadFiles } from '../sandbox'

export interface PolishInput {
  sandboxId: string
  blueprint: AppBlueprint
  assembly: AssemblyResult | null
  tokens: ThemeTokens
  tokenBudget?: number
}

export interface PolishResult {
  rewrittenFiles: Array<{ path: string; content: string }>
  tokensUsed: number
  polishApplied: boolean
}

const DEFAULT_TOKEN_BUDGET = 50_000

export const POLISH_SYSTEM_INSTRUCTIONS = `You are a senior frontend designer for VibeStack. You rewrite React page components to be visually stunning and unique.

You receive scaffold pages (working but generic) and rewrite their JSX to match the design guidance from the capability's SKILL.md.

## What you CAN do:
- Rewrite JSX structure, layout, and Tailwind classes in public-facing pages
- Add CSS animations using Tailwind (animate-*, transition-*)
- Create new visual patterns (grids, masonry, overlays, cards)
- Adjust typography (font sizes, weights, line heights via Tailwind)
- Add decorative elements (dividers, gradients, background patterns)

## What you MUST preserve:
- All React imports (keep all existing imports, add new ones if needed)
- The createFileRoute() export and its path string — DO NOT change the route path
- All useQuery / useSuspenseQuery / useMutation hooks and their return variables
- All supabase.from() calls — data fetching logic is immutable
- Component function name and default export
- TypeScript types — do not add any or remove type annotations

## What you CANNOT do:
- Modify files outside of public pages (no hooks, no types, no SQL, no config)
- Add new npm dependencies (only use what's in package.json)
- Change Supabase queries or TanStack Query hook calls
- Remove existing data display (if the scaffold shows a field, your rewrite must show it too)
- Use inline styles — Tailwind only

## Design System
Use CSS custom properties from index.css. Available variables:
--background, --foreground, --primary, --primary-foreground, --secondary, --accent, --muted, --border
--font-display (heading font), --font-body (body font)
--radius (border radius)

Apply them via Tailwind: bg-[var(--background)], text-[var(--primary)], font-[family-name:var(--font-display)], etc.

## Output Format
Return the COMPLETE rewritten file content. Do not return diffs or partial code. Include ALL imports.`

function isPathExcluded(path: string): boolean {
  return (
    path.startsWith('src/lib/')
    || path.endsWith('.hooks.ts')
    || path.startsWith('src/components/ui/')
    || path.endsWith('.sql')
    || path.endsWith('.json')
    || path === 'vite.config.ts'
    || path === 'package.json'
    || path === 'tsconfig.json'
  )
}

function pagePathsFromAssembly(assembly: AssemblyResult): Set<string> {
  const paths = new Set<string>()
  for (const page of assembly.pages) {
    if (page.type === 'public-list' && page.entity) {
      paths.add(`src/routes/${page.entity}/index.tsx`)
      paths.add(`src/routes/${page.entity}s/index.tsx`)
    }
    if (page.type === 'public-detail' && page.entity) {
      paths.add(`src/routes/${page.entity}/$id.tsx`)
      paths.add(`src/routes/${page.entity}s/$id.tsx`)
    }
    if (page.path === '/') paths.add('src/routes/index.tsx')
  }
  return paths
}

function collectPolishableFiles(blueprint: AppBlueprint, assembly: AssemblyResult): BlueprintFile[] {
  const pagePaths = pagePathsFromAssembly(assembly)
  return blueprint.fileTree.filter((file) => {
    if (isPathExcluded(file.path)) return false
    if (!file.path.startsWith('src/routes/')) return false
    return file.isLLMSlot || pagePaths.has(file.path)
  })
}

function usageTokens(result: unknown): number {
  if (typeof result !== 'object' || !result) return 0
  const maybe = result as { totalUsage?: { totalTokens?: number } }
  return maybe.totalUsage?.totalTokens ?? 0
}

function generatedText(result: unknown): string | null {
  if (typeof result === 'string') return result
  if (!result || typeof result !== 'object') return null
  const candidate = result as { text?: string; content?: Array<{ type?: string; text?: string }> }
  if (typeof candidate.text === 'string' && candidate.text.trim().length > 0) return candidate.text
  const textParts = candidate.content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n')
  if (textParts && textParts.trim().length > 0) return textParts
  return null
}

function fileRole(path: string): string {
  if (path === 'src/routes/index.tsx') return 'homepage'
  if (path.endsWith('/index.tsx')) return 'public-list'
  if (path.endsWith('/$id.tsx')) return 'public-detail'
  return 'public-page'
}

async function repairFiles(
  agent: Agent,
  files: Array<{ path: string; content: string }>,
  errorOutput: string,
  errorType: string,
): Promise<Array<{ path: string; content: string }>> {
  const repaired: Array<{ path: string; content: string }> = []

  for (const file of files) {
    const prompt = `The following file has ${errorType}. Fix it while preserving behavior and route/data logic.\n\nError output:\n${errorOutput}\n\nFile path: ${file.path}\n\nCurrent content:\n${file.content}`
    const result = await agent.generate(prompt)
    const text = generatedText(result)
    repaired.push({ path: file.path, content: text ?? file.content })
  }

  return repaired
}

async function validatePolishedFiles(
  sandboxId: string,
  files: Array<{ path: string; content: string }>,
  agent: Agent,
  maxRetries: number = 3,
): Promise<Array<{ path: string; content: string }>> {
  let current = files

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const sandbox = await getSandbox(sandboxId)
    await uploadFiles(
      sandbox,
      current.map((file) => ({ content: file.content, path: `/workspace/${file.path}` })),
    )

    const sessionId = `polish-${Date.now()}-${attempt}`

    const tscResult = await runCommand(sandbox, 'cd /workspace && bunx tsc --noEmit', sessionId, { timeout: 300 })
    if (tscResult.exitCode !== 0) {
      current = await repairFiles(agent, current, `${tscResult.stderr ?? ''}\n${tscResult.stdout}`, 'TypeScript errors')
      continue
    }

    const buildResult = await runCommand(sandbox, 'cd /workspace && bunx vite build', sessionId, { timeout: 300 })
    if (buildResult.exitCode !== 0) {
      current = await repairFiles(agent, current, `${buildResult.stderr ?? ''}\n${buildResult.stdout}`, 'Build errors')
      continue
    }

    return current
  }

  return []
}

export async function runPolish(input: PolishInput): Promise<PolishResult> {
  if (!input.assembly) {
    return { rewrittenFiles: [], tokensUsed: 0, polishApplied: false }
  }

  const workspaceTools: WorkspaceToolsConfig = {
    enabled: true,
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { enabled: true },
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { enabled: true },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { enabled: true },
    [WORKSPACE_TOOLS.SEARCH.SEARCH]: { enabled: false },
    [WORKSPACE_TOOLS.SEARCH.INDEX]: { enabled: false },
  }

  const workspace = new Workspace({
    filesystem: new LocalFilesystem({ basePath: '/tmp/polish-workspace' }),
    sandbox: new LocalSandbox({ workingDirectory: '/tmp/polish-workspace' }),
    skills: [getCapabilitySkillsPath()],
    tools: workspaceTools,
  })
  await workspace.init()

  const agent = new Agent({
    id: 'polish-agent',
    name: 'Polish Agent',
    model: createAgentModelResolver('codegen'),
    instructions: POLISH_SYSTEM_INSTRUCTIONS,
    workspace,
    defaultOptions: { modelSettings: { temperature: 0.7 } },
  })

  const tokenBudget = input.tokenBudget ?? DEFAULT_TOKEN_BUDGET
  let tokensUsed = 0

  try {
    const polishable = collectPolishableFiles(input.blueprint, input.assembly)
    const rewrittenFiles: Array<{ path: string; content: string }> = []

    for (const file of polishable) {
      if (tokensUsed >= tokenBudget) break
      const prompt = `Rewrite this ${fileRole(file.path)} page using loaded capability skills and theme tokens.

Theme tokens:
${JSON.stringify(input.tokens, null, 2)}

Assembly design hints:
${JSON.stringify(input.assembly.designHints, null, 2)}

File path: ${file.path}

Current file content:
${file.content}`

      const result = await agent.generate(prompt)
      tokensUsed += usageTokens(result)
      const text = generatedText(result)
      rewrittenFiles.push({
        path: file.path,
        content: text ?? file.content,
      })

      if (tokensUsed >= tokenBudget) break
    }

    const validated = await validatePolishedFiles(input.sandboxId, rewrittenFiles, agent, 3)
    if (validated.length === 0) {
      return { rewrittenFiles: [], tokensUsed, polishApplied: false }
    }

    return {
      rewrittenFiles: validated,
      tokensUsed,
      polishApplied: validated.length > 0,
    }
  } catch {
    return { rewrittenFiles: [], tokensUsed, polishApplied: false }
  } finally {
    await workspace.destroy()
  }
}

export const __testables = {
  collectPolishableFiles,
}
