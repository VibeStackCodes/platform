import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandbox, createSandbox as createSandboxFn, getPreviewUrl as getPreviewUrlFn, pushToGitHub as pushToGitHubFn } from '@/lib/sandbox';

/**
 * Standalone Mastra tools for 9-agent architecture
 *
 * Each tool is a standalone export that can be assigned to agents via their `tools` property.
 * Tools that need sandbox access take `sandboxId` as an input parameter.
 */

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
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId);
    const fullPath = `/workspace/${inputData.path}`;
    await sandbox.fs.uploadFile(Buffer.from(inputData.content), fullPath);
    return {
      success: true,
      path: inputData.path,
      bytesWritten: inputData.content.length,
    };
  },
});

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
    const sandbox = await getSandbox(inputData.sandboxId);
    const fullPath = `/workspace/${inputData.path}`;
    try {
      const buffer = await sandbox.fs.downloadFile(fullPath);
      return {
        content: buffer.toString('utf-8'),
        exists: true,
      };
    } catch {
      return {
        content: '',
        exists: false,
      };
    }
  },
});

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
    const sandbox = await getSandbox(inputData.sandboxId);
    const fullPath = `/workspace/${inputData.directory}`;

    const result = await sandbox.process.executeCommand(
      `find ${fullPath} -type f ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/.git/*" | sort`,
      '/workspace',
      undefined,
      30
    );

    if (result.exitCode !== 0) {
      return { files: [], count: 0 };
    }

    const files = result.result
      .split('\n')
      .filter(f => f.trim() !== '')
      .map(f => f.replace(`/workspace/${inputData.directory}/`, ''));

    return {
      files,
      count: files.length,
    };
  },
});

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
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId);
    const fullPath = `/workspace/${inputData.path}`;

    await sandbox.process.executeCommand(
      `mkdir -p ${fullPath}`,
      '/workspace',
      undefined,
      10
    );

    return {
      success: true,
      path: inputData.path,
    };
  },
});

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
    const sandbox = await getSandbox(inputData.sandboxId);
    const workDir = inputData.cwd || '/workspace';

    const result = await sandbox.process.executeCommand(
      inputData.command,
      workDir,
      undefined,
      120
    );

    return {
      exitCode: result.exitCode,
      stdout: result.result,
      stderr: result.error || '',
    };
  },
});

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
    const sandbox = await getSandbox(inputData.sandboxId);

    const result = await sandbox.process.executeCommand(
      'bun run build',
      '/workspace',
      undefined,
      120
    );

    return {
      exitCode: result.exitCode,
      output: result.result,
    };
  },
});

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
    const sandbox = await getSandbox(inputData.sandboxId);

    const result = await sandbox.process.executeCommand(
      'npx biome check --write',
      '/workspace',
      undefined,
      30
    );

    return {
      exitCode: result.exitCode,
      output: result.result,
    };
  },
});

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
    const sandbox = await getSandbox(inputData.sandboxId);

    const result = await sandbox.process.executeCommand(
      'tsc --noEmit',
      '/workspace',
      undefined,
      60
    );

    return {
      exitCode: result.exitCode,
      output: result.result,
    };
  },
});

// ============================================================================
// SQL Validation
// ============================================================================

const AUTH_STUBS = `
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  role text DEFAULT 'authenticated'
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT gen_random_uuid() $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
`;

export const validateSQLTool = createTool({
  id: 'validate-sql',
  description: 'Validate SQL migration against PGlite in sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    sql: z.string().describe('SQL migration to validate'),
  }),
  outputSchema: z.object({
    valid: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId);

    // Create a PGlite validation script
    const script = `
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(${JSON.stringify(AUTH_STUBS)});
  await db.exec(${JSON.stringify(inputData.sql)});
  console.log('MIGRATION_OK');
} catch (e) {
  console.error('MIGRATION_ERROR:', e.message);
  process.exit(1);
} finally {
  await db.close();
}
`;

    await sandbox.fs.uploadFile(
      Buffer.from(script),
      '/workspace/validate-sql.mjs'
    );

    const result = await sandbox.process.executeCommand(
      'bun /workspace/validate-sql.mjs',
      '/workspace',
      undefined,
      30
    );

    if (result.exitCode !== 0) {
      const output = `${result.result}\n${result.error || ''}`.trim();
      const match = output.match(/MIGRATION_ERROR:\s*(.+)/);
      return {
        valid: false,
        error: match?.[1] || output,
      };
    }

    return { valid: true };
  },
});

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
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId);
    const port = inputData.port || 3000;

    const preview = await getPreviewUrlFn(sandbox, port);

    return {
      url: preview.url,
      port: preview.port,
      expiresAt: preview.expiresAt.toISOString(),
    };
  },
});

export const createSandboxTool = createTool({
  id: 'create-sandbox',
  description: 'Create a new Daytona sandbox from snapshot',
  inputSchema: z.object({
    labels: z.record(z.string(), z.string()).optional().describe('Optional labels for the sandbox'),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    success: z.boolean(),
  }),
  execute: async (inputData, _context) => {
    const sandbox = await createSandboxFn({
      language: 'typescript',
      autoStopInterval: 60,
      labels: inputData.labels || {},
    });

    return {
      sandboxId: sandbox.id,
      success: true,
    };
  },
});

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
  }),
  execute: async (inputData, _context) => {
    const sandbox = await getSandbox(inputData.sandboxId);

    await pushToGitHubFn(sandbox, inputData.cloneUrl, inputData.token);

    return {
      success: true,
      message: `Pushed to ${inputData.cloneUrl}`,
    };
  },
});

export const deployToVercelTool = createTool({
  id: 'deploy-to-vercel',
  description: 'Deploy a project to Vercel (placeholder — integration pending)',
  inputSchema: z.object({
    projectId: z.string().describe('VibeStack project ID'),
    repoUrl: z.string().describe('GitHub repository URL'),
  }),
  outputSchema: z.object({
    deploymentUrl: z.string(),
    deploymentId: z.string(),
    status: z.string(),
  }),
  execute: async (inputData, _context) => {
    // Placeholder — will use @vercel/client in full implementation
    return {
      deploymentUrl: `https://${inputData.projectId}.vercel.app`,
      deploymentId: `dpl_${Date.now()}`,
      status: 'pending',
    };
  },
});

// ============================================================================
// Documentation Search
// ============================================================================

export const searchDocsTool = createTool({
  id: 'search-docs',
  description: 'Search library documentation for API patterns (placeholder — integration pending)',
  inputSchema: z.object({
    library: z.string().describe('Library name (e.g., react, drizzle-orm, supabase)'),
    query: z.string().describe('Search query'),
  }),
  outputSchema: z.object({
    results: z.string().describe('Documentation results'),
  }),
  execute: async (inputData, _context) => {
    // Placeholder — will be connected to Context7 MCP or web search
    return {
      results: `Documentation for ${inputData.library}: ${inputData.query} (integration pending)`,
    };
  },
});
