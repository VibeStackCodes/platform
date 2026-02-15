import {
  createDirectoryTool,
  createGitHubRepoTool,
  createSandboxTool,
  createSupabaseProjectTool,
  deployToVercelTool,
  getGitHubTokenTool,
  getPreviewUrlTool,
  listFilesTool,
  pushToGitHubTool,
  readFileTool,
  runBuildTool,
  runCommandTool,
  runLintTool,
  runMigrationTool,
  runTypeCheckTool,
  searchDocsTool,
  validateSQLTool,
  writeFileTool,
} from '@server/lib/agents/tools'
import { describe, expect, it } from 'vitest'

describe('Sandbox Tools', () => {
  it('exports all 18 tools', () => {
    const tools = [
      writeFileTool,
      readFileTool,
      listFilesTool,
      createDirectoryTool,
      runCommandTool,
      runBuildTool,
      runLintTool,
      runTypeCheckTool,
      validateSQLTool,
      getPreviewUrlTool,
      createSandboxTool,
      pushToGitHubTool,
      deployToVercelTool,
      searchDocsTool,
      createSupabaseProjectTool,
      runMigrationTool,
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
    const schema = writeFileTool.inputSchema!
    const valid = schema.safeParse({
      sandboxId: 'abc',
      path: 'src/App.tsx',
      content: 'hello',
    })
    expect(valid.success).toBe(true)
  })

  it('readFileTool has correct input schema', () => {
    const schema = readFileTool.inputSchema!
    const valid = schema.safeParse({ sandboxId: 'abc', path: 'src/App.tsx' })
    expect(valid.success).toBe(true)
  })

  it('listFilesTool has correct input schema', () => {
    const schema = listFilesTool.inputSchema!
    const valid = schema.safeParse({ sandboxId: 'abc', directory: 'src' })
    expect(valid.success).toBe(true)
  })

  it('createDirectoryTool has correct input schema', () => {
    const schema = createDirectoryTool.inputSchema!
    const valid = schema.safeParse({ sandboxId: 'abc', path: 'src/components' })
    expect(valid.success).toBe(true)
  })

  it('runCommandTool has correct input schema', () => {
    const schema = runCommandTool.inputSchema!
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
    const schema = runBuildTool.inputSchema!
    const valid = schema.safeParse({ sandboxId: 'abc' })
    expect(valid.success).toBe(true)
  })

  it('runLintTool has correct input schema', () => {
    const schema = runLintTool.inputSchema!
    const valid = schema.safeParse({ sandboxId: 'abc' })
    expect(valid.success).toBe(true)
  })

  it('runTypeCheckTool has correct input schema', () => {
    const schema = runTypeCheckTool.inputSchema!
    const valid = schema.safeParse({ sandboxId: 'abc' })
    expect(valid.success).toBe(true)
  })

  it('validateSQLTool input accepts SQL string (no sandboxId needed)', () => {
    const schema = validateSQLTool.inputSchema!
    const valid = schema.safeParse({ sql: 'CREATE TABLE test (id uuid PRIMARY KEY);' })
    expect(valid.success).toBe(true)

    // Should NOT require sandboxId
    const sqlOnly = schema.safeParse({ sql: 'SELECT 1' })
    expect(sqlOnly.success).toBe(true)
  })

  it('getPreviewUrlTool has optional port with default', () => {
    const schema = getPreviewUrlTool.inputSchema!
    const valid = schema.safeParse({ sandboxId: 'abc' })
    expect(valid.success).toBe(true)

    const withPort = schema.safeParse({ sandboxId: 'abc', port: 8080 })
    expect(withPort.success).toBe(true)
  })

  it('createSandboxTool does not require sandboxId', () => {
    const schema = createSandboxTool.inputSchema!
    const valid = schema.safeParse({})
    expect(valid.success).toBe(true)

    // With optional labels
    const withLabels = schema.safeParse({
      labels: { project: 'test', type: 'vibestack-generated' },
    })
    expect(withLabels.success).toBe(true)
  })

  it('pushToGitHubTool has correct input schema', () => {
    const schema = pushToGitHubTool.inputSchema!
    const valid = schema.safeParse({
      sandboxId: 'abc',
      cloneUrl: 'https://github.com/user/repo.git',
      token: 'ghp_token',
    })
    expect(valid.success).toBe(true)
  })

  it('deployToVercelTool has correct input schema', () => {
    const schema = deployToVercelTool.inputSchema!
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
    const schema = searchDocsTool.inputSchema!
    const valid = schema.safeParse({
      library: 'react',
      query: 'useEffect cleanup',
    })
    expect(valid.success).toBe(true)
  })

  it('createSupabaseProjectTool has correct input schema', () => {
    const schema = createSupabaseProjectTool.inputSchema!
    const valid = schema.safeParse({
      name: 'my-app-db',
    })
    expect(valid.success).toBe(true)
  })

  it('runMigrationTool has correct input schema', () => {
    const schema = runMigrationTool.inputSchema!
    const valid = schema.safeParse({
      supabaseProjectId: 'abc123',
      sql: 'CREATE TABLE users (id uuid PRIMARY KEY);',
    })
    expect(valid.success).toBe(true)
  })

  it('createGitHubRepoTool has correct input schema', () => {
    const schema = createGitHubRepoTool.inputSchema!
    const valid = schema.safeParse({
      appName: 'my-generated-app',
      projectId: 'proj_123',
    })
    expect(valid.success).toBe(true)
  })

  it('getGitHubTokenTool has correct input schema', () => {
    const schema = getGitHubTokenTool.inputSchema!
    // Empty object should be valid (no required fields)
    const valid = schema.safeParse({})
    expect(valid.success).toBe(true)
  })

  it('tools that require sandboxId reject missing sandboxId', () => {
    const schema = writeFileTool.inputSchema!
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
      validateSQLTool,
      getPreviewUrlTool,
      createSandboxTool,
      pushToGitHubTool,
      deployToVercelTool,
      searchDocsTool,
      createSupabaseProjectTool,
      runMigrationTool,
      createGitHubRepoTool,
      getGitHubTokenTool,
    ]

    for (const tool of tools) {
      expect(tool.execute).toBeDefined()
      expect(typeof tool.execute).toBe('function')
    }
  })

  it('writeFileTool outputSchema matches expected structure', () => {
    const schema = writeFileTool.outputSchema!
    const valid = schema.safeParse({
      success: true,
      path: 'src/App.tsx',
      bytesWritten: 1024,
    })
    expect(valid.success).toBe(true)
  })

  it('readFileTool outputSchema matches expected structure', () => {
    const schema = readFileTool.outputSchema!
    const valid = schema.safeParse({
      content: 'file content',
      exists: true,
    })
    expect(valid.success).toBe(true)
  })

  it('validateSQLTool outputSchema matches expected structure', () => {
    const schema = validateSQLTool.outputSchema!
    const validResult = schema.safeParse({ valid: true })
    expect(validResult.success).toBe(true)

    const invalidResult = schema.safeParse({
      valid: false,
      error: 'syntax error',
    })
    expect(invalidResult.success).toBe(true)
  })

  it('listFilesTool outputSchema matches expected structure', () => {
    const schema = listFilesTool.outputSchema!
    const valid = schema.safeParse({
      files: ['file1.ts', 'file2.ts'],
      count: 2,
    })
    expect(valid.success).toBe(true)
  })

  it('runCommandTool outputSchema matches expected structure', () => {
    const schema = runCommandTool.outputSchema!
    const valid = schema.safeParse({
      exitCode: 0,
      stdout: 'command output',
      stderr: '',
    })
    expect(valid.success).toBe(true)
  })

  it('getPreviewUrlTool outputSchema matches expected structure', () => {
    const schema = getPreviewUrlTool.outputSchema!
    const valid = schema.safeParse({
      url: 'https://preview.daytona.io/abc',
      port: 3000,
      expiresAt: new Date().toISOString(),
    })
    expect(valid.success).toBe(true)
  })
})

describe('PGlite Supabase Stubs', () => {
  // These tests call validateSQLTool.execute() directly against PGlite
  // to verify that the Supabase stubs (auth, storage, realtime) work correctly.
  const validate = (sql: string) =>
    validateSQLTool.execute!({ context: {}, sql }, { toolCallId: 'test', resourceId: 'test', threadId: 'test', runId: 'test' } as never)

  it('validates basic table with RLS referencing auth.uid()', async () => {
    const result = await validate(`
      CREATE TABLE notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL DEFAULT auth.uid(),
        content text NOT NULL,
        created_at timestamptz DEFAULT now()
      );
      ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "users read own notes" ON notes FOR SELECT USING (auth.uid() = user_id);
    `)
    expect(result.valid).toBe(true)
  })

  it('validates FK to auth.users', async () => {
    const result = await validate(`
      CREATE TABLE profiles (
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        display_name text NOT NULL,
        avatar_url text
      );
    `)
    expect(result.valid).toBe(true)
  })

  it('validates FK to storage.objects', async () => {
    const result = await validate(`
      CREATE TABLE uploads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        object_id uuid REFERENCES storage.objects(id),
        user_id uuid NOT NULL DEFAULT auth.uid(),
        label text
      );
    `)
    expect(result.valid).toBe(true)
  })

  it('validates FK to storage.buckets', async () => {
    const result = await validate(`
      CREATE TABLE bucket_configs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id text REFERENCES storage.buckets(id),
        max_size bigint DEFAULT 10485760
      );
    `)
    expect(result.valid).toBe(true)
  })

  it('strips CREATE EXTENSION statements', async () => {
    const result = await validate(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE test (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    `)
    expect(result.valid).toBe(true)
  })

  it('strips ALTER PUBLICATION supabase_realtime', async () => {
    const result = await validate(`
      CREATE TABLE messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        content text NOT NULL
      );
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    `)
    expect(result.valid).toBe(true)
  })

  it('strips CREATE PUBLICATION', async () => {
    const result = await validate(`
      CREATE PUBLICATION my_pub FOR TABLE messages;
    `)
    expect(result.valid).toBe(true)
  })

  it('strips pg_notify calls', async () => {
    const result = await validate(`
      CREATE TABLE events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payload jsonb);
      SELECT pg_notify('events_channel', 'test');
    `)
    expect(result.valid).toBe(true)
  })

  it('validates grants to Supabase roles', async () => {
    const result = await validate(`
      CREATE TABLE items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
      GRANT SELECT ON items TO authenticated;
      GRANT SELECT ON items TO anon;
      GRANT ALL ON items TO service_role;
    `)
    expect(result.valid).toBe(true)
  })

  it('rejects genuinely invalid SQL', async () => {
    const result = await validate('CREATE TABL not_valid (;')
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('validates storage policies referencing storage schema', async () => {
    const result = await validate(`
      CREATE POLICY "authenticated can read objects"
        ON storage.objects FOR SELECT
        USING (auth.role() = 'authenticated');
    `)
    expect(result.valid).toBe(true)
  })
})
