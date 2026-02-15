import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { buildRepoName, createRepo, getInstallationToken } from '../github'
import {
  createSandbox as createSandboxFn,
  downloadDirectory,
  getPreviewUrl as getPreviewUrlFn,
  getSandbox,
  pushToGitHub as pushToGitHubFn,
} from '../sandbox'
import { contractToHooks } from '../contract-to-hooks'
import { contractToRoutes } from '../contract-to-routes'
import { SchemaContractSchema } from '../schema-contract'
import { createSupabaseProject as createSupabaseProjectFn, runMigration } from '../supabase-mgmt'

/**
 * Standalone Mastra tools for 9-agent architecture
 *
 * Each tool is a standalone export that can be assigned to agents via their `tools` property.
 * Tools that need sandbox access take `sandboxId` as an input parameter.
 */

/** Escape a string for safe use in shell commands */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`
}

// ============================================================================
// File Operations
// ============================================================================

export const writeFileTool = createTool({
  id: 'write-file',
  description: 'Write a file to the sandbox workspace',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    path: z.string().describe('File path relative to /workspace'),
    content: z.string().describe('File content to write'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    bytesWritten: z.number(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const fullPath = `/workspace/${inputData.path}`
      await sandbox.fs.uploadFile(Buffer.from(inputData.content), fullPath)
      return {
        success: true,
        path: inputData.path,
        bytesWritten: inputData.content.length,
      }
    } catch (e) {
      return {
        success: false,
        path: inputData.path,
        bytesWritten: 0,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

export const writeFilesTool = createTool({
  id: 'write-files',
  description:
    'Write multiple files to the sandbox workspace in one call. More efficient than multiple write-file calls for scaffolding.',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    files: z
      .array(
        z.object({
          path: z.string().describe('File path relative to /workspace'),
          content: z.string().describe('File content to write'),
        }),
      )
      .describe('Array of files to write'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filesWritten: z.number(),
    totalBytes: z.number(),
    errors: z.array(z.object({ path: z.string(), error: z.string() })),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    let filesWritten = 0
    let totalBytes = 0
    const errors: { path: string; error: string }[] = []

    for (const file of inputData.files) {
      try {
        const fullPath = `/workspace/${file.path}`
        await sandbox.fs.uploadFile(Buffer.from(file.content), fullPath)
        filesWritten++
        totalBytes += file.content.length
      } catch (e) {
        errors.push({ path: file.path, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return {
      success: errors.length === 0,
      filesWritten,
      totalBytes,
      errors,
    }
  },
})

export const readFileTool = createTool({
  id: 'read-file',
  description: 'Read a file from the sandbox workspace',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    path: z.string().describe('File path relative to /workspace'),
  }),
  outputSchema: z.object({
    content: z.string(),
    exists: z.boolean(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const fullPath = `/workspace/${inputData.path}`
    try {
      const buffer = await sandbox.fs.downloadFile(fullPath)
      return {
        content: buffer.toString('utf-8'),
        exists: true,
      }
    } catch {
      return {
        content: '',
        exists: false,
      }
    }
  },
})

export const listFilesTool = createTool({
  id: 'list-files',
  description: 'List files in a sandbox directory',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    directory: z.string().describe('Directory path relative to /workspace'),
  }),
  outputSchema: z.object({
    files: z.array(z.string()),
    count: z.number(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const fullPath = `/workspace/${inputData.directory}`

    const result = await sandbox.process.executeCommand(
      `find ${escapeShellArg(fullPath)} -type f ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/.git/*" | sort`,
      '/workspace',
      undefined,
      30,
    )

    if (result.exitCode !== 0) {
      return { files: [], count: 0 }
    }

    const files = result.result
      .split('\n')
      .filter((f) => f.trim() !== '')
      .map((f) => f.replace(`/workspace/${inputData.directory}/`, ''))

    return {
      files,
      count: files.length,
    }
  },
})

export const createDirectoryTool = createTool({
  id: 'create-directory',
  description: 'Create a directory in the sandbox workspace',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    path: z.string().describe('Directory path relative to /workspace'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const fullPath = `/workspace/${inputData.path}`

      await sandbox.process.executeCommand(
        `mkdir -p ${escapeShellArg(fullPath)}`,
        '/workspace',
        undefined,
        10,
      )

      return { success: true, path: inputData.path }
    } catch (e) {
      return {
        success: false,
        path: inputData.path,
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

// ============================================================================
// Command Execution
// ============================================================================

export const runCommandTool = createTool({
  id: 'run-command',
  description: 'Execute a command in the sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    command: z.string().describe('Command to execute'),
    cwd: z.string().optional().describe('Working directory (defaults to /workspace)'),
  }),
  outputSchema: z.object({
    exitCode: z.number(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)
    const workDir = inputData.cwd || '/workspace'

    const result = await sandbox.process.executeCommand(inputData.command, workDir, undefined, 120)

    return {
      exitCode: result.exitCode,
      stdout: result.result,
      stderr: result.exitCode !== 0 ? result.result : '',
    }
  },
})

export const runBuildTool = createTool({
  id: 'run-build',
  description: 'Run bun run build in the sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
  }),
  outputSchema: z.object({
    exitCode: z.number(),
    output: z.string(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)

    const result = await sandbox.process.executeCommand(
      'bun run build',
      '/workspace',
      undefined,
      120,
    )

    return {
      exitCode: result.exitCode,
      output: result.result,
    }
  },
})

export const runLintTool = createTool({
  id: 'run-lint',
  description: 'Run npx biome check --write in the sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
  }),
  outputSchema: z.object({
    exitCode: z.number(),
    output: z.string(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)

    const result = await sandbox.process.executeCommand(
      'npx biome check --write',
      '/workspace',
      undefined,
      30,
    )

    return {
      exitCode: result.exitCode,
      output: result.result,
    }
  },
})

export const runTypeCheckTool = createTool({
  id: 'run-typecheck',
  description: 'Run tsc --noEmit in the sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
  }),
  outputSchema: z.object({
    exitCode: z.number(),
    output: z.string(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId)

    const result = await sandbox.process.executeCommand('tsc --noEmit', '/workspace', undefined, 60)

    return {
      exitCode: result.exitCode,
      output: result.result,
    }
  },
})

// ============================================================================
// SQL Validation
// ============================================================================

/**
 * Cached PGlite instance with auth stubs pre-loaded.
 * Reused across validate-sql calls to avoid ~200ms startup per invocation.
 * Each validation runs in a transaction that gets rolled back to keep state clean.
 */
let _pgliteInstance: Awaited<ReturnType<typeof initPGlite>> | null = null
let _pgliteReady: Promise<void> | null = null

async function initPGlite() {
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = new PGlite()
  const supabaseStubs = `
    -- Supabase roles
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF; END $$;
    GRANT ALL ON SCHEMA public TO authenticated, anon, service_role;

    -- auth schema
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      role text DEFAULT 'authenticated'
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;
    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
    CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;

    -- storage schema (Supabase Storage stubs)
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL UNIQUE,
      owner uuid REFERENCES auth.users(id),
      public boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS storage.objects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text REFERENCES storage.buckets(id),
      name text,
      owner uuid REFERENCES auth.users(id),
      metadata jsonb,
      path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      last_accessed_at timestamptz DEFAULT now()
    );
    GRANT ALL ON SCHEMA storage TO authenticated, anon, service_role;

    -- realtime schema (stub for ALTER PUBLICATION references)
    CREATE SCHEMA IF NOT EXISTS realtime;
  `
  await pg.exec(supabaseStubs)
  return pg
}

async function getPGlite() {
  if (!_pgliteInstance) {
    _pgliteReady = initPGlite().then((pg) => {
      _pgliteInstance = pg
    })
  }
  await _pgliteReady
  if (!_pgliteInstance) {
    throw new Error('PGlite failed to initialize')
  }
  return _pgliteInstance
}

export const validateSQLTool = createTool({
  id: 'validate-sql',
  description: 'Validate SQL migration against PGlite (runs locally, no sandbox needed)',
  inputSchema: z.object({
    sql: z.string().describe('SQL migration to validate'),
  }),
  outputSchema: z.object({
    valid: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    const pg = await getPGlite()
    // Strip statements PGlite can't handle:
    // - CREATE EXTENSION: PGlite has gen_random_uuid() built-in, extensions not needed
    // - ALTER/CREATE PUBLICATION: Supabase realtime uses publications, PGlite doesn't support them
    // - NOTIFY/pg_notify: Supabase realtime triggers, no-op in PGlite
    const sql = inputData.sql
      .replace(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+[^;]+;/gi, '')
      .replace(/ALTER\s+PUBLICATION\s+[^;]+;/gi, '')
      .replace(/CREATE\s+PUBLICATION\s+[^;]+;/gi, '')
      .replace(/DROP\s+PUBLICATION\s+[^;]+;/gi, '')
      .replace(/SELECT\s+pg_notify\s*\([^)]*\)\s*;/gi, '')
      // Strip indexes using pg_trgm operator classes (gin_trgm_ops, gist_trgm_ops)
      // PGlite doesn't bundle pg_trgm, but Supabase Postgres does
      .replace(/CREATE\s+INDEX\s+[^;]*_trgm_ops\b[^;]*;/gi, '')
    try {
      // Wrap in a transaction and always rollback to keep PGlite clean
      await pg.exec('BEGIN')
      await pg.exec(sql)
      await pg.exec('ROLLBACK')
      return { valid: true }
    } catch (e) {
      try {
        await pg.exec('ROLLBACK')
      } catch {
        /* already rolled back */
      }
      return { valid: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
})

// ============================================================================
// Preview & Sandbox Management
// ============================================================================

export const getPreviewUrlTool = createTool({
  id: 'get-preview-url',
  description: 'Get a signed preview URL for the sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    port: z.number().optional().default(3000).describe('Port number (default: 3000)'),
  }),
  outputSchema: z.object({
    url: z.string(),
    port: z.number(),
    expiresAt: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      const port = inputData.port || 3000
      const preview = await getPreviewUrlFn(sandbox, port)
      return { url: preview.url, port: preview.port, expiresAt: preview.expiresAt.toISOString() }
    } catch (e) {
      return {
        url: '',
        port: inputData.port || 3000,
        expiresAt: '',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

export const createSandboxTool = createTool({
  id: 'create-sandbox',
  description:
    'Create a new Daytona sandbox from snapshot. Labels must be a JSON object (e.g. {"project": "my-app", "env": "dev"}), NOT a plain string.',
  inputSchema: z.object({
    labels: z
      .record(z.string(), z.string())
      .optional()
      .describe('Optional labels as key-value object, e.g. {"project": "my-app"}'),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await createSandboxFn({
        language: 'typescript',
        autoStopInterval: 60,
        labels: inputData.labels || {},
      })
      return { sandboxId: sandbox.id, success: true }
    } catch (e) {
      return { sandboxId: '', success: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
})

// ============================================================================
// GitHub & Deployment
// ============================================================================

export const pushToGitHubTool = createTool({
  id: 'push-to-github',
  description: 'Push sandbox git repository to GitHub',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    cloneUrl: z.string().describe('GitHub clone URL (https://github.com/user/repo.git)'),
    token: z.string().describe('GitHub personal access token'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId)
      await pushToGitHubFn(sandbox, inputData.cloneUrl, inputData.token)
      return { success: true, message: `Pushed to ${inputData.cloneUrl}` }
    } catch (e) {
      return { success: false, message: '', error: e instanceof Error ? e.message : String(e) }
    }
  },
})

export const deployToVercelTool = createTool({
  id: 'deploy-to-vercel',
  description:
    'Deploy sandbox files to Vercel using the Vercel REST API. Downloads files from sandbox and creates a deployment.',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    projectName: z.string().describe('Project name for Vercel deployment'),
    teamId: z.string().optional().describe('Vercel team ID (defaults to VERCEL_TEAM_ID env var)'),
  }),
  outputSchema: z.object({
    deploymentUrl: z.string(),
    deploymentId: z.string(),
    status: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    try {
      const vercelToken = process.env.VERCEL_TOKEN
      if (!vercelToken) {
        return {
          deploymentUrl: '',
          deploymentId: '',
          status: 'failed',
          error: 'VERCEL_TOKEN environment variable is required',
        }
      }

      const finalTeamId = inputData.teamId || process.env.VERCEL_TEAM_ID

      // Download files from sandbox
      const sandbox = await getSandbox(inputData.sandboxId)
      const files = await downloadDirectory(sandbox, '/workspace')

      console.log(`[deploy-to-vercel] Downloaded ${files.length} files from sandbox`)

      // Prepare files in Vercel format (base64-encoded)
      const vercelFiles = files.map((f) => ({
        file: f.path,
        data: f.content.toString('base64'),
      }))

      // Create deployment
      const deploymentResponse = await fetch(
        `https://api.vercel.com/v13/deployments${finalTeamId ? `?teamId=${finalTeamId}` : ''}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: inputData.projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            files: vercelFiles,
            projectSettings: {
              framework: 'vite',
              buildCommand: 'bun run build',
              devCommand: 'bun run dev',
              installCommand: 'bun install',
              outputDirectory: 'dist',
            },
            target: 'production',
          }),
        },
      )

      if (!deploymentResponse.ok) {
        const errText = await deploymentResponse.text()
        return {
          deploymentUrl: '',
          deploymentId: '',
          status: 'failed',
          error: `Vercel deployment failed: ${errText}`,
        }
      }

      const deployment = (await deploymentResponse.json()) as {
        id: string
        url: string
        readyState: string
      }
      const deployUrl = `https://${deployment.url}`

      console.log(`[deploy-to-vercel] Deployment created: ${deployUrl} (${deployment.id})`)

      return {
        deploymentUrl: deployUrl,
        deploymentId: deployment.id,
        status: deployment.readyState,
      }
    } catch (e) {
      return {
        deploymentUrl: '',
        deploymentId: '',
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

// ============================================================================
// Infrastructure Tools
// ============================================================================

export const createSupabaseProjectTool = createTool({
  id: 'create-supabase-project',
  description:
    'Create a new Supabase project via Management API. Waits for ACTIVE_HEALTHY status. Returns project ID, URL, and API keys. A random suffix is appended to the name to avoid duplicates.',
  inputSchema: z.object({
    name: z.string().describe('Project name base (a random suffix will be appended automatically)'),
    region: z.string().default('us-east-1').describe('AWS region'),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    url: z.string(),
    anonKey: z.string(),
    serviceRoleKey: z.string(),
    dbHost: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    try {
      const uniqueName = `${inputData.name}-${Date.now().toString(36).slice(-5)}`
      const project = await createSupabaseProjectFn(uniqueName, inputData.region)
      return {
        projectId: project.id,
        url: project.url,
        anonKey: project.anonKey,
        serviceRoleKey: project.serviceRoleKey,
        dbHost: project.dbHost,
      }
    } catch (e) {
      return {
        projectId: '',
        url: '',
        anonKey: '',
        serviceRoleKey: '',
        dbHost: '',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

export const runMigrationTool = createTool({
  id: 'run-migration',
  description: 'Execute a SQL migration against a Supabase project via the Management API',
  inputSchema: z.object({
    supabaseProjectId: z.string().describe('Supabase project ID'),
    sql: z.string().describe('SQL migration to execute'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    executedAt: z.string(),
  }),
  execute: async (inputData) => {
    return await runMigration(inputData.supabaseProjectId, inputData.sql)
  },
})

export const createGitHubRepoTool = createTool({
  id: 'create-github-repo',
  description: 'Create a GitHub repository in the VibeStack org via GitHub App',
  inputSchema: z.object({
    appName: z.string().describe('Application name'),
    projectId: z.string().describe('VibeStack project ID'),
  }),
  outputSchema: z.object({
    cloneUrl: z.string(),
    htmlUrl: z.string(),
    repoName: z.string(),
    error: z.string().optional(),
  }),
  execute: async (inputData) => {
    try {
      const repoName = buildRepoName(inputData.appName, inputData.projectId)
      const repo = await createRepo(repoName)
      return { cloneUrl: repo.cloneUrl, htmlUrl: repo.htmlUrl, repoName }
    } catch (e) {
      return {
        cloneUrl: '',
        htmlUrl: '',
        repoName: '',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
})

export const getGitHubTokenTool = createTool({
  id: 'get-github-token',
  description: 'Get a GitHub App installation token for git push authentication',
  inputSchema: z.object({}),
  outputSchema: z.object({
    token: z.string(),
    error: z.string().optional(),
  }),
  execute: async () => {
    try {
      const token = await getInstallationToken()
      return { token }
    } catch (e) {
      return { token: '', error: e instanceof Error ? e.message : String(e) }
    }
  },
})

// ============================================================================
// Documentation Search
// ============================================================================

export const searchDocsTool = createTool({
  id: 'search-docs',
  description:
    'Search library documentation. Prefers llms.txt (LLM-optimized plaintext) over HTML scraping.',
  inputSchema: z.object({
    library: z
      .string()
      .describe(
        'Library name (e.g., react, supabase, shadcn-ui, vite, tailwindcss, tanstack-router)',
      ),
    query: z.string().describe('What to search for'),
  }),
  outputSchema: z.object({
    results: z.string().describe('Documentation content or guidance'),
    source: z.string().describe('Source URL or reference'),
  }),
  execute: async (inputData, _context) => {
    // llms.txt endpoints — LLM-optimized plaintext docs (preferred)
    const llmsTxtUrls: Record<string, string> = {
      supabase: 'https://supabase.com/llms.txt',
      vite: 'https://vite.dev/llms.txt',
      tailwindcss: 'https://tailwindcss.com/llms.txt',
      'tanstack-router': 'https://tanstack.com/router/latest/llms.txt',
      'tanstack-query': 'https://tanstack.com/query/latest/llms.txt',
      'drizzle-orm': 'https://orm.drizzle.team/llms.txt',
      biome: 'https://biomejs.dev/llms.txt',
    }

    // Fallback HTML docs for libraries without llms.txt
    const fallbackUrls: Record<string, string> = {
      react: 'https://react.dev/reference/react',
      'supabase-auth': 'https://supabase.com/docs/guides/auth',
      'supabase-rls': 'https://supabase.com/docs/guides/database/postgres/row-level-security',
      'shadcn-ui': 'https://ui.shadcn.com/docs/components',
      valibot: 'https://valibot.dev/guides/introduction/',
    }

    const lib = inputData.library.toLowerCase().replace(/\s+/g, '-')
    const llmsUrl = llmsTxtUrls[lib]
    const htmlUrl = fallbackUrls[lib]

    if (!llmsUrl && !htmlUrl) {
      return {
        results: `No curated docs for "${inputData.library}". Available libraries: ${[...Object.keys(llmsTxtUrls), ...Object.keys(fallbackUrls)].join(', ')}. Use your training knowledge for this library.`,
        source: 'built-in',
      }
    }

    // Try llms.txt first (clean plaintext, no parsing needed)
    if (llmsUrl) {
      try {
        const response = await fetch(llmsUrl, {
          headers: { Accept: 'text/plain' },
          signal: AbortSignal.timeout(5000),
        })

        if (response.ok) {
          const text = await response.text()
          return {
            results: text.slice(0, 6000),
            source: llmsUrl,
          }
        }
      } catch {
        // Fall through to HTML fallback
      }
    }

    // Fallback: fetch HTML and strip tags
    const url = htmlUrl ?? llmsUrl
    if (!url) {
      return {
        results: `No documentation URL available for ${inputData.library}`,
        source: 'built-in',
      }
    }
    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        return {
          results: `Documentation for ${inputData.library} is at ${url}. Use your training knowledge for: ${inputData.query}`,
          source: url,
        }
      }

      const html = await response.text()
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4000)

      return {
        results: `Documentation excerpt from ${inputData.library}:\n${text}\n\nQuery: ${inputData.query}`,
        source: url,
      }
    } catch {
      return {
        results: `Could not fetch docs for ${inputData.library}. Reference: ${url}. Use your training knowledge for: ${inputData.query}`,
        source: url,
      }
    }
  },
})

// ============================================================================
// Contract-to-Code Generators (deterministic scaffolding)
// ============================================================================

export const contractToHooksTool = createTool({
  id: 'contract-to-hooks',
  description:
    'Generate TanStack Query CRUD hooks from a SchemaContract. Produces typed useQuery/useMutation hooks for every table.',
  inputSchema: z.object({
    contract: SchemaContractSchema.describe('Database schema contract'),
  }),
  outputSchema: z.object({
    code: z.string().describe('Generated TypeScript hooks code'),
    tableCount: z.number().describe('Number of tables processed'),
  }),
  execute: async (inputData) => {
    const code = contractToHooks(inputData.contract)
    return { code, tableCount: inputData.contract.tables.length }
  },
})

export const contractToRoutesTool = createTool({
  id: 'contract-to-routes',
  description:
    'Generate TanStack Router route definitions from a SchemaContract. Produces list + detail routes for every table.',
  inputSchema: z.object({
    contract: SchemaContractSchema.describe('Database schema contract'),
  }),
  outputSchema: z.object({
    code: z.string().describe('Generated TypeScript route definitions'),
    tableCount: z.number().describe('Number of tables processed'),
  }),
  execute: async (inputData) => {
    const code = contractToRoutes(inputData.contract)
    return { code, tableCount: inputData.contract.tables.length }
  },
})

// ============================================================================
// Clarification Questions (UI-bound tool — no server-side execution)
// ============================================================================

export const askClarifyingQuestionsTool = createTool({
  id: 'ask-clarifying-questions',
  description: `Ask the user structured clarifying questions with selectable options. Use when:
- The user's request is broad or vague and needs refinement
- Multiple valid interpretations exist (design style, feature scope, data model)
- You need specific preferences before generating requirements

The tool returns immediately — the user's answers arrive as the next message.`,
  inputSchema: z.object({
    questions: z
      .array(
        z.object({
          question: z.string().describe('The question to ask'),
          selectionMode: z
            .enum(['single', 'multiple'])
            .describe('single = pick one, multiple = pick many'),
          options: z
            .array(
              z.object({
                label: z.string().describe('Short option label (2-5 words)'),
                description: z.string().describe('Explanation of what this option means'),
              }),
            )
            .min(2)
            .max(4),
        }),
      )
      .min(1)
      .max(4)
      .describe('1-4 clarifying questions'),
  }),
  outputSchema: z.object({
    status: z.literal('awaiting_user_input'),
    questionCount: z.number(),
  }),
  execute: async (inputData) => {
    // This tool doesn't execute server-side logic.
    // The SSE bridge intercepts tool-execution-end for 'ask-clarifying-questions'
    // and emits a clarification_request event to the frontend.
    // The user's answers arrive as the next message to /api/agent.
    return {
      status: 'awaiting_user_input' as const,
      questionCount: inputData.questions.length,
    }
  },
})
