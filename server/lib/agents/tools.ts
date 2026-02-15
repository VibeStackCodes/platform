import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandbox, createSandbox as createSandboxFn, getPreviewUrl as getPreviewUrlFn, pushToGitHub as pushToGitHubFn, downloadDirectory } from '../sandbox';
import { createRepo, getInstallationToken, buildRepoName } from '../github';
import { createSupabaseProject as createSupabaseProjectFn, runMigration } from '../supabase-mgmt';

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
      stderr: result.exitCode !== 0 ? result.result : '',
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

/**
 * Cached PGlite instance with auth stubs pre-loaded.
 * Reused across validate-sql calls to avoid ~200ms startup per invocation.
 * Each validation runs in a transaction that gets rolled back to keep state clean.
 */
let _pgliteInstance: Awaited<ReturnType<typeof initPGlite>> | null = null;
let _pgliteReady: Promise<void> | null = null;

async function initPGlite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  const authStubs = `
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '00000000-0000-0000-0000-000000000000'::uuid $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF; END $$;
    GRANT ALL ON SCHEMA public TO authenticated, anon, service_role;
  `;
  await pg.exec(authStubs);
  return pg;
}

async function getPGlite() {
  if (!_pgliteInstance) {
    _pgliteReady = initPGlite().then(pg => { _pgliteInstance = pg; });
  }
  await _pgliteReady;
  return _pgliteInstance!;
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
    const pg = await getPGlite();
    try {
      // Run in a savepoint to keep PGlite clean for next call
      await pg.exec('SAVEPOINT validate_sql');
      await pg.exec(inputData.sql);
      await pg.exec('ROLLBACK TO SAVEPOINT validate_sql');
      return { valid: true };
    } catch (e) {
      try { await pg.exec('ROLLBACK TO SAVEPOINT validate_sql'); } catch { /* already rolled back */ }
      return { valid: false, error: e instanceof Error ? e.message : String(e) };
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
  description: 'Deploy sandbox files to Vercel using the Vercel REST API. Downloads files from sandbox and creates a deployment.',
  inputSchema: z.object({
    sandboxId: z.string().describe('Daytona sandbox ID'),
    projectName: z.string().describe('Project name for Vercel deployment'),
    teamId: z.string().optional().describe('Vercel team ID (defaults to VERCEL_TEAM_ID env var)'),
  }),
  outputSchema: z.object({
    deploymentUrl: z.string(),
    deploymentId: z.string(),
    status: z.string(),
  }),
  execute: async (inputData, _context) => {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      throw new Error('VERCEL_TOKEN environment variable is required');
    }

    const finalTeamId = inputData.teamId || process.env.VERCEL_TEAM_ID;

    // Download files from sandbox
    const sandbox = await getSandbox(inputData.sandboxId);
    const files = await downloadDirectory(sandbox, '/workspace');

    console.log(`[deploy-to-vercel] Downloaded ${files.length} files from sandbox`);

    // Prepare files in Vercel format (base64-encoded)
    const vercelFiles = files.map((f) => ({
      file: f.path,
      data: f.content.toString('base64'),
    }));

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
      }
    );

    if (!deploymentResponse.ok) {
      const error = await deploymentResponse.text();
      throw new Error(`Vercel deployment failed: ${error}`);
    }

    const deployment = await deploymentResponse.json() as { id: string; url: string; readyState: string };
    const deployUrl = `https://${deployment.url}`;

    console.log(`[deploy-to-vercel] Deployment created: ${deployUrl} (${deployment.id})`);

    return {
      deploymentUrl: deployUrl,
      deploymentId: deployment.id,
      status: deployment.readyState,
    };
  },
});

// ============================================================================
// Infrastructure Tools
// ============================================================================

export const createSupabaseProjectTool = createTool({
  id: 'create-supabase-project',
  description: 'Create a new Supabase project via Management API. Waits for ACTIVE_HEALTHY status. Returns project ID, URL, and API keys.',
  inputSchema: z.object({
    name: z.string().describe('Project name (sanitized to lowercase alphanumeric + hyphens)'),
    region: z.string().default('us-east-1').describe('AWS region'),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    url: z.string(),
    anonKey: z.string(),
    serviceRoleKey: z.string(),
    dbHost: z.string(),
  }),
  execute: async (inputData) => {
    const project = await createSupabaseProjectFn(inputData.name, inputData.region);
    return {
      projectId: project.id,
      url: project.url,
      anonKey: project.anonKey,
      serviceRoleKey: project.serviceRoleKey,
      dbHost: project.dbHost,
    };
  },
});

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
    return await runMigration(inputData.supabaseProjectId, inputData.sql);
  },
});

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
  }),
  execute: async (inputData) => {
    const repoName = buildRepoName(inputData.appName, inputData.projectId);
    const repo = await createRepo(repoName);
    return { cloneUrl: repo.cloneUrl, htmlUrl: repo.htmlUrl, repoName };
  },
});

export const getGitHubTokenTool = createTool({
  id: 'get-github-token',
  description: 'Get a GitHub App installation token for git push authentication',
  inputSchema: z.object({}),
  outputSchema: z.object({
    token: z.string(),
  }),
  execute: async () => {
    const token = await getInstallationToken();
    return { token };
  },
});

// ============================================================================
// Documentation Search
// ============================================================================

export const searchDocsTool = createTool({
  id: 'search-docs',
  description: 'Search library documentation. Prefers llms.txt (LLM-optimized plaintext) over HTML scraping.',
  inputSchema: z.object({
    library: z.string().describe('Library name (e.g., react, supabase, shadcn-ui, vite, tailwindcss, tanstack-router)'),
    query: z.string().describe('What to search for'),
  }),
  outputSchema: z.object({
    results: z.string().describe('Documentation content or guidance'),
    source: z.string().describe('Source URL or reference'),
  }),
  execute: async (inputData, _context) => {
    // llms.txt endpoints — LLM-optimized plaintext docs (preferred)
    const llmsTxtUrls: Record<string, string> = {
      'supabase': 'https://supabase.com/llms.txt',
      'vite': 'https://vite.dev/llms.txt',
      'tailwindcss': 'https://tailwindcss.com/llms.txt',
      'tanstack-router': 'https://tanstack.com/router/latest/llms.txt',
      'tanstack-query': 'https://tanstack.com/query/latest/llms.txt',
      'drizzle-orm': 'https://orm.drizzle.team/llms.txt',
      'biome': 'https://biomejs.dev/llms.txt',
    };

    // Fallback HTML docs for libraries without llms.txt
    const fallbackUrls: Record<string, string> = {
      'react': 'https://react.dev/reference/react',
      'supabase-auth': 'https://supabase.com/docs/guides/auth',
      'supabase-rls': 'https://supabase.com/docs/guides/database/postgres/row-level-security',
      'shadcn-ui': 'https://ui.shadcn.com/docs/components',
      'valibot': 'https://valibot.dev/guides/introduction/',
    };

    const lib = inputData.library.toLowerCase().replace(/\s+/g, '-');
    const llmsUrl = llmsTxtUrls[lib];
    const htmlUrl = fallbackUrls[lib];

    if (!llmsUrl && !htmlUrl) {
      return {
        results: `No curated docs for "${inputData.library}". Available libraries: ${[...Object.keys(llmsTxtUrls), ...Object.keys(fallbackUrls)].join(', ')}. Use your training knowledge for this library.`,
        source: 'built-in',
      };
    }

    // Try llms.txt first (clean plaintext, no parsing needed)
    if (llmsUrl) {
      try {
        const response = await fetch(llmsUrl, {
          headers: { 'Accept': 'text/plain' },
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const text = await response.text();
          return {
            results: text.slice(0, 6000),
            source: llmsUrl,
          };
        }
      } catch {
        // Fall through to HTML fallback
      }
    }

    // Fallback: fetch HTML and strip tags
    const url = htmlUrl || llmsUrl!;
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'text/html' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          results: `Documentation for ${inputData.library} is at ${url}. Use your training knowledge for: ${inputData.query}`,
          source: url,
        };
      }

      const html = await response.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4000);

      return {
        results: `Documentation excerpt from ${inputData.library}:\n${text}\n\nQuery: ${inputData.query}`,
        source: url,
      };
    } catch {
      return {
        results: `Could not fetch docs for ${inputData.library}. Reference: ${url}. Use your training knowledge for: ${inputData.query}`,
        source: url,
      };
    }
  },
});

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
    questions: z.array(z.object({
      question: z.string().describe('The question to ask'),
      selectionMode: z.enum(['single', 'multiple']).describe('single = pick one, multiple = pick many'),
      options: z.array(z.object({
        label: z.string().describe('Short option label (2-5 words)'),
        description: z.string().describe('Explanation of what this option means'),
      })).min(2).max(4),
    })).min(1).max(4).describe('1-4 clarifying questions'),
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
    };
  },
});
