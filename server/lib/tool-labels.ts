/**
 * Human-readable labels for agent tools.
 * Shared between the SSE bridge (agent.ts) and the history endpoint (projects.ts).
 */
export const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  createSandbox: () => 'Provisioning sandbox',
  writeFile: () => 'Writing',
  writeFiles: (a) => {
    const files = a.files as Array<{ path: string }> | undefined
    return files?.length ? `Writing ${files.length} files` : 'Writing files'
  },
  readFile: () => 'Reading',
  editFile: () => 'Editing',
  listFiles: () => 'Listing files',
  runCommand: (a) => {
    const cmd = String(a.command ?? '')
    return `Running ${cmd.length > 40 ? cmd.slice(0, 40) + '…' : cmd || 'command'}`
  },
  runBuild: () => 'Building app',
  installPackage: (a) => `Installing ${a.packages ?? 'packages'}`,
  getPreviewUrl: () => 'Getting preview URL',
  commitAndPush: (a) => `Committing: ${a.message ?? 'changes'}`,
  webSearch: () => 'Search the web',
  web_search: () => 'Search the web',
  web_search_tool: () => 'Search the web',
}

/** Tools that are internal to Mastra and should not be shown in the UI */
export const INTERNAL_TOOLS = new Set(['updateWorkingMemory', 'readWorkingMemory'])
