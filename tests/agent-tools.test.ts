import {
  commitAndPushTool,
  createSandboxTool,
  editFileTool,
  getPreviewUrlTool,
  installPackageTool,
  listFilesTool,
  readFileTool,
  runBuildTool,
  runCommandTool,
  writeFileTool,
  writeFilesTool,
} from '@server/lib/agents/tools'
import { describe, expect, it } from 'vitest'

describe('Sandbox Tools', () => {
  const ALL_TOOLS = [
    writeFileTool,
    writeFilesTool,
    readFileTool,
    listFilesTool,
    runCommandTool,
    runBuildTool,
    getPreviewUrlTool,
    createSandboxTool,
    commitAndPushTool,
    editFileTool,
    installPackageTool,
  ]

  it('exports all 11 tools', () => {
    for (const tool of ALL_TOOLS) {
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

  it('runCommandTool has correct input schema', () => {
    const schema = runCommandTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      sandboxId: 'abc',
      command: 'bun run build',
    })
    expect(valid.success).toBe(true)

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

    const withLabels = schema.safeParse({
      labels: { project: 'test', type: 'vibestack-generated' },
    })
    expect(withLabels.success).toBe(true)
  })

  it('commitAndPushTool has correct input schema', () => {
    const schema = commitAndPushTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const valid = schema.safeParse({
      sandboxId: 'abc',
      message: 'feat: initial scaffold',
    })
    expect(valid.success).toBe(true)

    // sandboxId is required
    const missingSandboxId = schema.safeParse({ message: 'feat: initial scaffold' })
    expect(missingSandboxId.success).toBe(false)

    // message is required
    const missingMessage = schema.safeParse({ sandboxId: 'abc' })
    expect(missingMessage.success).toBe(false)
  })

  it('commitAndPushTool has correct output schema', () => {
    const schema = commitAndPushTool.outputSchema
    expect(schema).toBeDefined()
    if (!schema) return

    // Minimal success (no push)
    const successNoRepo = schema.safeParse({ success: true, commitHash: 'a1b2c3d' })
    expect(successNoRepo.success).toBe(true)

    // Full success with repoUrl
    const successWithRepo = schema.safeParse({
      success: true,
      commitHash: 'a1b2c3d',
      repoUrl: 'https://github.com/org/vibestack-sandboxid.git',
    })
    expect(successWithRepo.success).toBe(true)

    // Failure case
    const failure = schema.safeParse({ success: false, error: 'Commit failed' })
    expect(failure.success).toBe(true)
  })

  it('tools that require sandboxId reject missing sandboxId', () => {
    const schema = writeFileTool.inputSchema
    expect(schema).toBeDefined()
    if (!schema) return
    const invalid = schema.safeParse({ path: 'src/App.tsx', content: 'hello' })
    expect(invalid.success).toBe(false)
  })

  it('all sandbox tools have execute functions', () => {
    for (const tool of ALL_TOOLS) {
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
