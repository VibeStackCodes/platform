import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandbox, createSandbox as createSandboxFn, getPreviewUrl as getPreviewUrlFn, pushToGitHub as pushToGitHubFn } from '@/lib/sandbox';

/**
 * Standalone Mastra tools for 9-agent architecture
 *
 * Each tool is a standalone export that can be assigned to agents via their `tools` property.
 * Tools that need sandbox access take `sandboxId` as an input parameter.
 */

/** Escape a string for safe use in shell commands */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
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
      `find ${escapeShellArg(fullPath)} -type f ! -path "*/node_modules/*" ! -path "*/.next/*" ! -path "*/.git/*" | sort`,
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
      `mkdir -p ${escapeShellArg(fullPath)}`,
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
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite();
    try {
      // AUTH_STUBS required for RLS policies
      await pg.exec(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;
        CREATE ROLE authenticated;
        CREATE ROLE anon;
        CREATE ROLE service_role;
        GRANT ALL ON SCHEMA public TO authenticated, anon, service_role;
      `);
      await pg.exec(inputData.sql);
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      await pg.close();
    }
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
  description: 'Deploy a project to Vercel [PLACEHOLDER — returns mock response, integration pending]',
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
  description: 'Search library documentation [PLACEHOLDER — returns mock response, Context7 integration pending]',
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
