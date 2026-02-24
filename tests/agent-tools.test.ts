import {
  createDirectoryTool,
  createGitHubRepoTool,
  createSandboxTool,
  deployToVercelTool,
  getGitHubTokenTool,
  getPreviewUrlTool,
  listFilesTool,
  pushToGitHubTool,
  readFileTool,
  runBuildTool,
  runCommandTool,
  runLintTool,
  runTypeCheckTool,
  searchDocsTool,
  writeFileTool,
} from '@server/lib/agents/tools'
import { describe, expect, it } from 'vitest'

describe('Sandbox Tools', () => {
  it('exports all 15 tools', () => {
    const tools = [
      writeFileTool,
      readFileTool,
      listFilesTool,
      createDirectoryTool,
      runCommandTool,
      runBuildTool,
      runLintTool,
      runTypeCheckTool,
      getPreviewUrlTool,
      createSandboxTool,
      pushToGitHubTool,
      deployToVercelTool,
      searchDocsTool,
      createGitHubRepoTool,
      getGitHubTokenTool,
    ]
    for (const tool of tools) {
      expect(tool).toBeDefined()
      expect(tool.id).toBeDefined()
      expect(tool.description).toBeDefined()
      expect(tool.inputSchema).toBeDefined()
    }
  })

  it('writeFileTool has correct input schema', () => {
    const schema = writeFileTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      sandboxId: 'abc',
      path: 'src/App.tsx',
      content: 'hello',
    })
    expect(valid.success).toBe(true)
  })

  it('readFileTool has correct input schema', () => {
    const schema = readFileTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({ sandboxId: 'abc', path: 'src/App.tsx' })
    expect(valid.success).toBe(true)
  })

  it('listFilesTool has correct input schema', () => {
    const schema = listFilesTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({ sandboxId: 'abc', directory: 'src' })
    expect(valid.success).toBe(true)
  })

  it('createDirectoryTool has correct input schema', () => {
    const schema = createDirectoryTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({ sandboxId: 'abc', path: 'src/components' })
    expect(valid.success).toBe(true)
  })

  it('runCommandTool has correct input schema', () => {
    const schema = runCommandTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      sandboxId: 'abc',
      command: 'bun run build',
    })
    expect(valid.success).toBe(true)

    // With optional cwd
    const withCwd = schema.safeParse({
      sandboxId: 'abc',
      command: 'ls',
      cwd: '/workspace/src',
    })
    expect(withCwd.success).toBe(true)
  })

  it('runBuildTool has correct input schema', () => {
    const schema = runBuildTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({ sandboxId: 'abc' })
    expect(valid.success).toBe(true)
  })

  it('runLintTool has correct input schema', () => {
    const schema = runLintTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({ sandboxId: 'abc' })
    expect(valid.success).toBe(true)
  })

  it('runTypeCheckTool has correct input schema', () => {
    const schema = runTypeCheckTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({ sandboxId: 'abc' })
    expect(valid.success).toBe(true)
  })

  it('getPreviewUrlTool has optional port with default', () => {
    const schema = getPreviewUrlTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({ sandboxId: 'abc' })
    expect(valid.success).toBe(true)

    const withPort = schema.safeParse({ sandboxId: 'abc', port: 8080 })
    expect(withPort.success).toBe(true)
  })

  it('createSandboxTool does not require sandboxId', () => {
    const schema = createSandboxTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({})
    expect(valid.success).toBe(true)

    // With optional labels
    const withLabels = schema.safeParse({
      labels: { project: 'test', type: 'vibestack-generated' },
    })
    expect(withLabels.success).toBe(true)
  })

  it('pushToGitHubTool has correct input schema', () => {
    const schema = pushToGitHubTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      sandboxId: 'abc',
      cloneUrl: 'https://github.com/user/repo.git',
      token: 'ghp_token',
    })
    expect(valid.success).toBe(true)
  })

  it('deployToVercelTool has correct input schema', () => {
    const schema = deployToVercelTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      sandboxId: 'abc',
      projectName: 'test-project',
    })
    expect(valid.success).toBe(true)

    // With optional teamId
    const withTeamId = schema.safeParse({
      sandboxId: 'abc',
      projectName: 'test-project',
      teamId: 'team_123',
    })
    expect(withTeamId.success).toBe(true)
  })

  it('searchDocsTool input accepts library and query', () => {
    const schema = searchDocsTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      library: 'react',
      query: 'useEffect cleanup',
    })
    expect(valid.success).toBe(true)
  })

  it('createGitHubRepoTool has correct input schema', () => {
    const schema = createGitHubRepoTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      appName: 'my-generated-app',
      projectId: 'proj_123',
    })
    expect(valid.success).toBe(true)
  })

  it('getGitHubTokenTool has correct input schema', () => {
    const schema = getGitHubTokenTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    // Empty object should be valid (no required fields)
    const valid = schema.safeParse({})
    expect(valid.success).toBe(true)
  })

  it('tools that require sandboxId reject missing sandboxId', () => {
    const schema = writeFileTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const invalid = schema.safeParse({ path: 'src/App.tsx', content: 'hello' })
    expect(invalid.success).toBe(false)
  })

  it('all sandbox tools have execute functions', () => {
    const tools = [
      writeFileTool,
      readFileTool,
      listFilesTool,
      createDirectoryTool,
      runCommandTool,
      runBuildTool,
      runLintTool,
      runTypeCheckTool,
      getPreviewUrlTool,
      createSandboxTool,
      pushToGitHubTool,
      deployToVercelTool,
      searchDocsTool,
      createGitHubRepoTool,
      getGitHubTokenTool,
    ]

    for (const tool of tools) {
      expect(tool.execute).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    }
  })

  it('writeFileTool outputSchema matches expected structure', () => {
    const schema = writeFileTool.outputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      success: true,
      path: 'src/App.tsx',
      bytesWritten: 1024,
    })
    expect(valid.success).toBe(true)
  })

  it('readFileTool outputSchema matches expected structure', () => {
    const schema = readFileTool.outputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      content: 'file content',
      exists: true,
    })
    expect(valid.success).toBe(true)
  })

  it('listFilesTool outputSchema matches expected structure', () => {
    const schema = listFilesTool.outputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      files: ['file1.ts', 'file2.ts'],
      count: 2,
    })
    expect(valid.success).toBe(true)
  })

  it('runCommandTool outputSchema matches expected structure', () => {
    const schema = runCommandTool.outputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      exitCode: 0,
      stdout: 'command output',
      stderr: '',
    })
    expect(valid.success).toBe(true)
  })

  it('getPreviewUrlTool outputSchema matches expected structure', () => {
    const schema = getPreviewUrlTool.outputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      url: 'https://preview.daytona.io/abc',
      port: 3000,
      expiresAt: new Date().toISOString(),
    })
    expect(valid.success).toBe(true)
  })
})
